/**
 * @file weatherAdapter.ts
 * @description Unified weather & scenario coordinator for the BBR digital twin.
 * Exposes a single consistent contract regardless of whether the simulation is
 * driven by:
 *   - Live Open-Meteo API (`loadLiveWeather`)
 *   - Built-in disaster presets (`loadPresetScenario`)
 *   - Swagger / OpenAPI custom JSON (`injectCustomScenario`)
 *   - Remote custom JSON endpoint (`fetchCustomScenarioFromUrl`)
 *   - Parametric visual builder (`buildParametricScenario`)
 */

import { DOWNSTREAM_CRITICAL_LEVEL_M } from '../../constants/hydrologyConstants';
import {
  CUSTOM_URL_TIMEOUT_MS,
  DEFAULT_INITIAL_SOIL_SATURATION,
  DEFAULT_SIMULATION_HORIZON_HOURS,
  LIVE_FORECAST_HOURS,
  LIVE_LOOKBACK_HOURS,
  LIVE_WEATHER_CACHE_TTL_MS,
} from '../../constants/weatherConstants';
import { fetchJsonWithTimeout, type FetchImplementation } from '../http/fetchWithTimeout';
import {
  fetchOpenMeteoForecast,
  parseOpenMeteoResponse,
  type OpenMeteoRequestOptions,
} from './openMeteoClient';
import { buildPresetScenario } from './presetScenarios';
import {
  composeParametricScenario,
  deriveSoilSaturationSeries,
  describeRainfall,
  floorToHour,
  normaliseCustomScenario,
} from './scenarioBuilder';
import {
  ScenarioValidationError,
  validateCustomScenario,
  validateParametricScenario,
} from './scenarioValidator';
import { createNormalTideProfile, generateTidalSeries } from './tidalSimulator';
import type {
  DerivedField,
  HourlyWeatherPoint,
  PresetScenarioId,
  ScenarioRequest,
  ScenarioSummary,
  WeatherScenarioPayload,
} from './weatherTypes';

// ---------------------------------------------------------------------------
// Live forecast cache
// ---------------------------------------------------------------------------

interface LiveWeatherCacheEntry {
  fetchedAtMs: number;
  payload: WeatherScenarioPayload;
}

let liveCache: LiveWeatherCacheEntry | null = null;

export function clearLiveWeatherCache(): void {
  liveCache = null;
}

export interface LoadLiveWeatherOptions extends OpenMeteoRequestOptions {
  nowMs?: number;
  horizonHours?: number;
  forceRefresh?: boolean;
  /** When true (default), falls back to a safe clear-day series if Open-Meteo fails. */
  allowFallback?: boolean;
}

/**
 * Fetch live hourly weather for Bandar Bukit Raja from Open-Meteo, align it to
 * the current hour, and enrich it with soil saturation and Klang tidal levels.
 */
export async function loadLiveWeather(
  options: LoadLiveWeatherOptions = {},
): Promise<WeatherScenarioPayload> {
  const nowMs = options.nowMs ?? Date.now();
  const horizonHours = options.horizonHours ?? DEFAULT_SIMULATION_HORIZON_HOURS;
  const allowFallback = options.allowFallback ?? true;

  if (
    !options.forceRefresh &&
    liveCache !== null &&
    nowMs - liveCache.fetchedAtMs < LIVE_WEATHER_CACHE_TTL_MS &&
    liveCache.payload.hourlySeries.length === horizonHours
  ) {
    return liveCache.payload;
  }

  try {
    const raw = await fetchOpenMeteoForecast(options);
    const parsed = parseOpenMeteoResponse(raw, { nowMs, horizonHours });

    const rainfall = parsed.hours.map((h) => h.precipitationMmPerHr);
    const suppliedSoil = parsed.hours.map((h) => h.soilSaturation);
    const firstSoil = suppliedSoil.find((s): s is number => s !== undefined) ?? DEFAULT_INITIAL_SOIL_SATURATION;
    const soilSeries = deriveSoilSaturationSeries(rainfall, firstSoil, suppliedSoil);
    const tideSeries = generateTidalSeries(createNormalTideProfile(parsed.startMs), parsed.hours.length);

    const derivedFields: DerivedField[] = ['downstreamLevelM'];
    if (suppliedSoil.some((s) => s === undefined)) {
      derivedFields.push('soilSaturation');
    }

    const hourlySeries: HourlyWeatherPoint[] = parsed.hours.map((hour, index) => ({
      timeIso: new Date(hour.timeMs).toISOString(),
      hourOffset: index,
      precipitationMmPerHr: hour.precipitationMmPerHr,
      soilSaturation: soilSeries[index] ?? firstSoil,
      downstreamLevelM: tideSeries[index] ?? 0,
      ...(hour.temperatureC !== undefined ? { temperatureC: hour.temperatureC } : {}),
      ...(hour.precipitationProbabilityPct !== undefined
        ? { precipitationProbabilityPct: hour.precipitationProbabilityPct }
        : {}),
      weatherDescription: hour.weatherDescription ?? describeRainfall(hour.precipitationMmPerHr),
    }));

    const payload: WeatherScenarioPayload = {
      scenarioId: 'LIVE_OPEN_METEO',
      scenarioName: 'Bandar Bukit Raja Live Forecast (Open-Meteo)',
      description: 'Real-time hourly forecast from Open-Meteo coupled with Klang Strait synthetic tide.',
      sourceType: 'LIVE_API',
      createdAt: new Date(nowMs).toISOString(),
      hourlySeries,
      metadata: {
        provider: 'open-meteo',
        latitude: parsed.latitude,
        longitude: parsed.longitude,
        isFallback: false,
        warnings: parsed.warnings,
        derivedFields,
      },
    };

    liveCache = { fetchedAtMs: nowMs, payload };
    return payload;
  } catch (error) {
    if (!allowFallback) {
      throw error;
    }

    const fallback = buildPresetScenario('SCENARIO_CLEAR_DAY', { nowMs });
    return {
      ...fallback,
      scenarioId: 'LIVE_OPEN_METEO_FALLBACK',
      scenarioName: 'BBR Live Forecast (Offline Safe Fallback)',
      sourceType: 'LIVE_API',
      metadata: {
        ...fallback.metadata,
        provider: 'open-meteo-fallback',
        isFallback: true,
        warnings: [
          `Open-Meteo unreachable (${(error as Error).message}). Serving safe clear-day baseline.`,
        ],
      },
    };
  }
}

// ---------------------------------------------------------------------------
// Live real-time operation window (hindcast + NOW + forecast)
// ---------------------------------------------------------------------------

const MS_PER_HOUR = 3_600_000;

export interface LoadLiveOperationalOptions {
  nowMs?: number;
  lookbackHours?: number;
  forecastHours?: number;
  fetchImpl?: FetchImplementation;
  /** When true (default), serves an offline clear-day baseline if Open-Meteo fails. */
  allowFallback?: boolean;
}

/**
 * Build an offline clear-day baseline covering the requested real-time window.
 * Used when Open-Meteo is unreachable so the live twin keeps operating safely.
 */
export function buildOfflineLiveBaseline(
  windowStartMs: number,
  totalHours: number,
  nowMs: number,
  reason: string,
): WeatherScenarioPayload {
  const validated = validateParametricScenario({
    horizonHours: totalHours,
    startTimeIso: new Date(windowStartMs).toISOString(),
    initialSoilSaturation: DEFAULT_INITIAL_SOIL_SATURATION,
  });
  const baseline = composeParametricScenario(validated, {
    sourceType: 'LIVE_API',
    provider: 'open-meteo-fallback',
    nowMs,
    defaultScenarioId: 'LIVE_OPERATION_FALLBACK',
    defaultScenarioName: 'BBR Real-Time (Safe Baseline)',
  });
  return {
    ...baseline,
    metadata: {
      ...baseline.metadata,
      isFallback: true,
      warnings: [reason],
    },
  };
}

/**
 * Load the real-time operational window for live mode: `lookbackHours` of
 * observed/assimilated Open-Meteo hours before the current wall-clock hour,
 * followed by `forecastHours` of forecast. The series starts on an exact hour
 * boundary so that frame indices map deterministically to wall-clock time.
 */
export async function loadLiveOperationalWeather(
  options: LoadLiveOperationalOptions = {},
): Promise<WeatherScenarioPayload> {
  const nowMs = options.nowMs ?? Date.now();
  const lookbackHours = options.lookbackHours ?? LIVE_LOOKBACK_HOURS;
  const forecastHours = options.forecastHours ?? LIVE_FORECAST_HOURS;
  const totalHours = lookbackHours + forecastHours;
  const windowStartMs = floorToHour(nowMs) - lookbackHours * MS_PER_HOUR;
  const allowFallback = options.allowFallback ?? true;

  try {
    const raw = await fetchOpenMeteoForecast({
      ...(lookbackHours > 0 ? { pastDays: Math.ceil(lookbackHours / 24) } : {}),
      ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
    });
    const parsed = parseOpenMeteoResponse(raw, { nowMs: windowStartMs, horizonHours: totalHours });

    if (parsed.startMs !== windowStartMs) {
      throw new Error(
        `Open-Meteo window misaligned (expected ${new Date(windowStartMs).toISOString()}, received ${new Date(parsed.startMs).toISOString()}).`,
      );
    }
    if (parsed.hours.length < lookbackHours + 1) {
      throw new Error(`Open-Meteo returned only ${parsed.hours.length} hour(s); the NOW hour is not covered.`);
    }

    const rainfall = parsed.hours.map((h) => h.precipitationMmPerHr);
    const suppliedSoil = parsed.hours.map((h) => h.soilSaturation);
    const firstSoil = suppliedSoil.find((s): s is number => s !== undefined) ?? DEFAULT_INITIAL_SOIL_SATURATION;
    const soilSeries = deriveSoilSaturationSeries(rainfall, firstSoil, suppliedSoil);
    const tideSeries = generateTidalSeries(createNormalTideProfile(parsed.startMs), parsed.hours.length);

    const derivedFields: DerivedField[] = ['downstreamLevelM'];
    if (suppliedSoil.some((s) => s === undefined)) {
      derivedFields.push('soilSaturation');
    }

    const hourlySeries: HourlyWeatherPoint[] = parsed.hours.map((hour, index) => ({
      timeIso: new Date(hour.timeMs).toISOString(),
      hourOffset: index,
      precipitationMmPerHr: hour.precipitationMmPerHr,
      soilSaturation: soilSeries[index] ?? firstSoil,
      downstreamLevelM: tideSeries[index] ?? 0,
      ...(hour.temperatureC !== undefined ? { temperatureC: hour.temperatureC } : {}),
      ...(hour.precipitationProbabilityPct !== undefined
        ? { precipitationProbabilityPct: hour.precipitationProbabilityPct }
        : {}),
      weatherDescription: hour.weatherDescription ?? describeRainfall(hour.precipitationMmPerHr),
    }));

    return {
      scenarioId: 'LIVE_OPERATION',
      scenarioName: 'BBR Real-Time (Open-Meteo Live)',
      description: `Real-time window: ${lookbackHours} h hindcast + ${forecastHours} h forecast from Open-Meteo, coupled with Klang Strait synthetic tide.`,
      sourceType: 'LIVE_API',
      createdAt: new Date(nowMs).toISOString(),
      hourlySeries,
      metadata: {
        provider: 'open-meteo',
        latitude: parsed.latitude,
        longitude: parsed.longitude,
        isFallback: false,
        warnings: parsed.warnings,
        derivedFields,
      },
    };
  } catch (error) {
    if (!allowFallback) {
      throw error;
    }
    return buildOfflineLiveBaseline(
      windowStartMs,
      totalHours,
      nowMs,
      `Open-Meteo unreachable (${(error as Error).message}). Serving offline clear-day baseline.`,
    );
  }
}

// ---------------------------------------------------------------------------
// Preset scenarios
// ---------------------------------------------------------------------------

export function loadPresetScenario(
  scenarioId: PresetScenarioId,
  options: { nowMs?: number; startTimeIso?: string } = {},
): WeatherScenarioPayload {
  return buildPresetScenario(scenarioId, {
    nowMs: options.nowMs ?? Date.now(),
    ...(options.startTimeIso !== undefined ? { startTimeIso: options.startTimeIso } : {}),
  });
}

// ---------------------------------------------------------------------------
// Mode A — Swagger / OpenAPI raw JSON injection & remote URL loading
// ---------------------------------------------------------------------------

/**
 * Validate and normalise a user-supplied JSON string or object conforming to
 * the `CustomScenarioInput` OpenAPI schema.
 */
export function injectCustomScenario(
  rawPayload: unknown,
  options: { nowMs?: number; provider?: string } = {},
): WeatherScenarioPayload {
  const validated = validateCustomScenario(rawPayload);
  return normaliseCustomScenario(validated, {
    provider: options.provider ?? 'custom-swagger-json',
    nowMs: options.nowMs ?? Date.now(),
  });
}

/**
 * Fetch a custom scenario JSON document from a user-supplied HTTP(S) endpoint,
 * validate it against the OpenAPI contract, and return the normalised payload.
 */
export async function fetchCustomScenarioFromUrl(
  url: string,
  options: {
    nowMs?: number;
    timeoutMs?: number;
    fetchImpl?: FetchImplementation;
  } = {},
): Promise<WeatherScenarioPayload> {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch (error) {
    throw new ScenarioValidationError(
      'UNSUPPORTED_URL',
      `Invalid URL "${url}". Provide a valid http:// or https:// endpoint.`,
      [{ path: 'url', message: 'Invalid URL format' }],
      { cause: error },
    );
  }

  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    throw new ScenarioValidationError(
      'UNSUPPORTED_URL',
      `Unsupported protocol "${parsedUrl.protocol}". Only http:// and https:// are permitted.`,
      [{ path: 'url', message: `Unsupported protocol ${parsedUrl.protocol}` }],
    );
  }

  let body: unknown;
  try {
    body = await fetchJsonWithTimeout(parsedUrl.toString(), {
      timeoutMs: options.timeoutMs ?? CUSTOM_URL_TIMEOUT_MS,
      maxRetries: 0,
      ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
    });
  } catch (error) {
    throw new ScenarioValidationError(
      'FETCH_FAILED',
      `Failed to fetch custom scenario from ${parsedUrl.toString()}: ${(error as Error).message}`,
      [{ path: 'url', message: (error as Error).message }],
      { cause: error },
    );
  }

  return injectCustomScenario(body, {
    ...(options.nowMs !== undefined ? { nowMs: options.nowMs } : {}),
    provider: `custom-url:${parsedUrl.host}`,
  });
}

// ---------------------------------------------------------------------------
// Mode B — Parametric visual scenario builder
// ---------------------------------------------------------------------------

export function buildParametricScenario(
  rawParams: unknown,
  options: { nowMs?: number } = {},
): WeatherScenarioPayload {
  const validated = validateParametricScenario(rawParams);
  return composeParametricScenario(validated, {
    sourceType: 'CUSTOM_SWAGGER',
    provider: 'custom-parametric-builder',
    nowMs: options.nowMs ?? Date.now(),
    defaultScenarioId: 'CUSTOM_PARAMETRIC',
    defaultScenarioName: 'Custom Parametric Storm Scenario',
  });
}

// ---------------------------------------------------------------------------
// Unified dispatcher & summary statistics
// ---------------------------------------------------------------------------

export async function loadScenario(
  request: ScenarioRequest,
  options: { nowMs?: number; fetchImpl?: FetchImplementation } = {},
): Promise<WeatherScenarioPayload> {
  switch (request.mode) {
    case 'LIVE_API':
      return loadLiveWeather({
        ...(options.nowMs !== undefined ? { nowMs: options.nowMs } : {}),
        ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
      });
    case 'PRESET':
      return loadPresetScenario(request.scenarioId, {
        ...(options.nowMs !== undefined ? { nowMs: options.nowMs } : {}),
      });
    case 'CUSTOM_JSON':
      return injectCustomScenario(request.payload, {
        ...(options.nowMs !== undefined ? { nowMs: options.nowMs } : {}),
      });
    case 'CUSTOM_URL':
      return fetchCustomScenarioFromUrl(request.url, {
        ...(options.nowMs !== undefined ? { nowMs: options.nowMs } : {}),
        ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
      });
    case 'PARAMETRIC':
      return buildParametricScenario(request.params, {
        ...(options.nowMs !== undefined ? { nowMs: options.nowMs } : {}),
      });
  }
}

/** Compute headline hydrological metrics for any loaded scenario payload. */
export function summarizeScenario(payload: WeatherScenarioPayload): ScenarioSummary {
  let totalRainfallMm = 0;
  let peakIntensityMmPerHr = 0;
  let peakIntensityHour = 0;
  let maxDownstreamLevelM = Number.NEGATIVE_INFINITY;
  let maxDownstreamHour = 0;
  let hoursDownstreamCritical = 0;

  payload.hourlySeries.forEach((point) => {
    totalRainfallMm += point.precipitationMmPerHr;
    if (point.precipitationMmPerHr > peakIntensityMmPerHr) {
      peakIntensityMmPerHr = point.precipitationMmPerHr;
      peakIntensityHour = point.hourOffset;
    }
    if (point.downstreamLevelM > maxDownstreamLevelM) {
      maxDownstreamLevelM = point.downstreamLevelM;
      maxDownstreamHour = point.hourOffset;
    }
    if (point.downstreamLevelM >= DOWNSTREAM_CRITICAL_LEVEL_M) {
      hoursDownstreamCritical += 1;
    }
  });

  return {
    scenarioId: payload.scenarioId,
    sourceType: payload.sourceType,
    horizonHours: payload.hourlySeries.length,
    totalRainfallMm: Math.round(totalRainfallMm * 100) / 100,
    peakIntensityMmPerHr,
    peakIntensityHour,
    maxDownstreamLevelM: Number.isFinite(maxDownstreamLevelM) ? maxDownstreamLevelM : 0,
    maxDownstreamHour,
    hoursDownstreamCritical,
  };
}
