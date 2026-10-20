/**
 * @file scenarioBuilder.ts
 * @description Shared time-series synthesis utilities:
 *   - Antecedent soil saturation model
 *   - Storm rainfall profile generator (BLOCK / TRIANGULAR + recession tail)
 *   - Parametric scenario composer (Mode B — visual builder, also used by presets)
 *   - Custom JSON normaliser (Mode A — fills omitted fields via models)
 */

import { BBR_LATITUDE, BBR_LONGITUDE } from '../../constants/hydrologyConstants';
import {
  DEFAULT_INITIAL_SOIL_SATURATION,
  DRY_HOUR_THRESHOLD_MM_PER_HR,
  SOIL_DRYING_RATE_PER_HR,
  SOIL_INFILTRATION_CAPACITY_MM,
} from '../../constants/weatherConstants';
import type { ValidatedCustomScenario, ValidatedParametricScenario } from './scenarioValidator';
import { createNormalTideProfile, generateTidalSeries } from './tidalSimulator';
import type {
  DerivedField,
  HourlyWeatherPoint,
  RecessionTailParams,
  ScenarioSourceType,
  StormEventParams,
  WeatherScenarioPayload,
} from './weatherTypes';

const MS_PER_HOUR = 3_600_000;
/** Tolerance before a user-supplied timeIso is flagged as inconsistent. */
const TIME_CONSISTENCY_TOLERANCE_MS = 60_000;

// ---------------------------------------------------------------------------
// Generic helpers
// ---------------------------------------------------------------------------

function clampUnit(value: number): number {
  return Math.min(Math.max(value, 0), 1);
}

function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

export function floorToHour(ms: number): number {
  return Math.floor(ms / MS_PER_HOUR) * MS_PER_HOUR;
}

export function hourOffsetToIso(startMs: number, hourOffset: number): string {
  return new Date(startMs + hourOffset * MS_PER_HOUR).toISOString();
}

/** Resolve the series start time: explicit ISO, otherwise `nowMs` floored to the hour. */
export function resolveStartMs(startTimeIso: string | undefined, nowMs: number): number {
  return startTimeIso !== undefined ? floorToHour(Date.parse(startTimeIso)) : floorToHour(nowMs);
}

/** Qualitative rainfall description (WMO-style intensity classes). */
export function describeRainfall(intensityMmPerHr: number): string {
  if (intensityMmPerHr < DRY_HOUR_THRESHOLD_MM_PER_HR) return 'No rain';
  if (intensityMmPerHr < 2.5) return 'Light rain';
  if (intensityMmPerHr < 10) return 'Moderate rain';
  if (intensityMmPerHr < 50) return 'Heavy rain';
  return 'Violent rain / thunderstorm';
}

// ---------------------------------------------------------------------------
// Soil saturation model
// ---------------------------------------------------------------------------

/**
 * S_{t+1} = clamp(S_t + P_t / capacity − drying, 0, 1)
 * Drying is applied only during dry hours.
 */
export function stepSoilSaturation(currentSaturation: number, precipitationMmPerHr: number): number {
  const wetting = precipitationMmPerHr / SOIL_INFILTRATION_CAPACITY_MM;
  const drying = precipitationMmPerHr < DRY_HOUR_THRESHOLD_MM_PER_HR ? SOIL_DRYING_RATE_PER_HR : 0;
  return clampUnit(currentSaturation + wetting - drying);
}

/**
 * Build a saturation series. Supplied values take precedence; gaps are filled
 * by integrating the soil model forward from the last known saturation.
 */
export function deriveSoilSaturationSeries(
  precipitationSeries: readonly number[],
  initialSaturation: number,
  supplied: ReadonlyArray<number | undefined> = [],
): number[] {
  const series: number[] = [];
  let modelled = clampUnit(initialSaturation);

  precipitationSeries.forEach((precipitation, hour) => {
    const current = supplied[hour] ?? modelled;
    series.push(round4(current));
    modelled = stepSoilSaturation(current, precipitation);
  });

  return series;
}

// ---------------------------------------------------------------------------
// Rainfall profile generator
// ---------------------------------------------------------------------------

/** Normalised triangular weights with the peak hit exactly at the middle hour(s). */
function triangularWeights(durationHours: number): number[] {
  const raw = Array.from({ length: durationHours }, (_, k) => Math.min(k + 1, durationHours - k));
  const max = Math.max(...raw);
  return raw.map((weight) => weight / max);
}

export function generateRainfallSeries(
  horizonHours: number,
  storm?: StormEventParams,
  recessionTail?: RecessionTailParams,
): number[] {
  const series = new Array<number>(horizonHours).fill(0);
  if (!storm) {
    return series;
  }

  const weights =
    storm.profile === 'TRIANGULAR'
      ? triangularWeights(storm.durationHours)
      : new Array<number>(storm.durationHours).fill(1);

  weights.forEach((weight, k) => {
    const hour = storm.startHour + k;
    if (hour < horizonHours) {
      series[hour] = round4(storm.peakIntensityMmPerHr * weight);
    }
  });

  if (recessionTail) {
    const tailStart = storm.startHour + storm.durationHours;
    for (let k = 0; k < recessionTail.durationHours; k += 1) {
      const hour = tailStart + k;
      if (hour < horizonHours) {
        series[hour] = recessionTail.intensityMmPerHr;
      }
    }
  }

  return series;
}

// ---------------------------------------------------------------------------
// Payload assembly
// ---------------------------------------------------------------------------

interface ComposeOptions {
  sourceType: ScenarioSourceType;
  provider: string;
  nowMs: number;
  defaultScenarioId: string;
  defaultScenarioName: string;
}

/** Compose a full scenario payload from validated parametric input. */
export function composeParametricScenario(
  params: ValidatedParametricScenario,
  options: ComposeOptions,
): WeatherScenarioPayload {
  const horizon = params.horizonHours;
  const startMs = resolveStartMs(params.startTimeIso, options.nowMs);

  const rainfall = generateRainfallSeries(horizon, params.storm, params.recessionTail);
  const soil = deriveSoilSaturationSeries(rainfall, params.initialSoilSaturation ?? DEFAULT_INITIAL_SOIL_SATURATION);
  const tide = generateTidalSeries(params.tide ?? createNormalTideProfile(startMs), horizon);

  const hourlySeries: HourlyWeatherPoint[] = rainfall.map((precipitation, hour) => ({
    timeIso: hourOffsetToIso(startMs, hour),
    hourOffset: hour,
    precipitationMmPerHr: precipitation,
    soilSaturation: soil[hour] ?? DEFAULT_INITIAL_SOIL_SATURATION,
    downstreamLevelM: tide[hour] ?? 0,
    weatherDescription: describeRainfall(precipitation),
  }));

  return {
    scenarioId: params.scenarioId ?? options.defaultScenarioId,
    scenarioName: params.scenarioName ?? options.defaultScenarioName,
    ...(params.description !== undefined ? { description: params.description } : {}),
    sourceType: options.sourceType,
    createdAt: new Date(options.nowMs).toISOString(),
    hourlySeries,
    metadata: {
      provider: options.provider,
      latitude: BBR_LATITUDE,
      longitude: BBR_LONGITUDE,
      isFallback: false,
      warnings: [],
      derivedFields: ['timeIso', 'soilSaturation', 'downstreamLevelM'],
    },
  };
}

/**
 * Normalise a validated custom (Swagger) payload into the unified series.
 * Omitted `timeIso`, `soilSaturation` and `downstreamLevelM` are filled by the
 * time, soil and normal-tide models respectively and reported in metadata.
 */
export function normaliseCustomScenario(
  input: ValidatedCustomScenario,
  options: { provider: string; nowMs: number },
): WeatherScenarioPayload {
  const points = input.hourlySeries;
  const firstSuppliedTime = points[0]?.timeIso;
  const startMs = resolveStartMs(input.startTimeIso ?? firstSuppliedTime, options.nowMs);

  const rainfall = points.map((point) => point.precipitationMmPerHr);
  const suppliedSoil = points.map((point) => point.soilSaturation);
  const initialSoil = input.initialSoilSaturation ?? suppliedSoil[0] ?? DEFAULT_INITIAL_SOIL_SATURATION;
  const soil = deriveSoilSaturationSeries(rainfall, initialSoil, suppliedSoil);
  const tide = generateTidalSeries(createNormalTideProfile(startMs), points.length);

  const derived = new Set<DerivedField>();
  const warnings: string[] = [];

  const hourlySeries: HourlyWeatherPoint[] = points.map((point, hour) => {
    const expectedIso = hourOffsetToIso(startMs, hour);
    if (point.timeIso === undefined) {
      derived.add('timeIso');
    } else if (Math.abs(Date.parse(point.timeIso) - Date.parse(expectedIso)) > TIME_CONSISTENCY_TOLERANCE_MS) {
      warnings.push(`hourlySeries.${hour}.timeIso (${point.timeIso}) is inconsistent with hourOffset ${hour} (expected ${expectedIso}).`);
    }
    if (point.soilSaturation === undefined) derived.add('soilSaturation');
    if (point.downstreamLevelM === undefined) derived.add('downstreamLevelM');

    return {
      timeIso: point.timeIso ?? expectedIso,
      hourOffset: hour,
      precipitationMmPerHr: point.precipitationMmPerHr,
      soilSaturation: soil[hour] ?? initialSoil,
      downstreamLevelM: point.downstreamLevelM ?? tide[hour] ?? 0,
      ...(point.temperatureC !== undefined ? { temperatureC: point.temperatureC } : {}),
      ...(point.precipitationProbabilityPct !== undefined
        ? { precipitationProbabilityPct: point.precipitationProbabilityPct }
        : {}),
      weatherDescription: point.weatherDescription ?? describeRainfall(point.precipitationMmPerHr),
    };
  });

  return {
    scenarioId: input.scenarioId,
    scenarioName: input.scenarioName,
    ...(input.description !== undefined ? { description: input.description } : {}),
    sourceType: 'CUSTOM_SWAGGER',
    createdAt: new Date(options.nowMs).toISOString(),
    hourlySeries,
    metadata: {
      provider: options.provider,
      latitude: BBR_LATITUDE,
      longitude: BBR_LONGITUDE,
      isFallback: false,
      warnings,
      derivedFields: [...derived],
    },
  };
}
