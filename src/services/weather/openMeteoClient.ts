/**
 * @file openMeteoClient.ts
 * @description Open-Meteo forecast REST client for Bandar Bukit Raja.
 * Fetches hourly precipitation, soil moisture, temperature and weather code,
 * validates the response shape and converts it into simulation-ready hours.
 *
 * Docs: https://open-meteo.com/en/docs
 */

import { z } from 'zod';
import { BBR_LATITUDE, BBR_LONGITUDE, BBR_TIMEZONE } from '../../constants/hydrologyConstants';
import {
  DEFAULT_SIMULATION_HORIZON_HOURS,
  OPEN_METEO_FORECAST_DAYS,
  OPEN_METEO_FORECAST_ENDPOINT,
  OPEN_METEO_HOURLY_VARIABLES,
  OPEN_METEO_MAX_RETRIES,
  OPEN_METEO_TIMEOUT_MS,
  SOIL_POROSITY_M3_PER_M3,
} from '../../constants/weatherConstants';
import { fetchJsonWithTimeout, type FetchImplementation } from '../http/fetchWithTimeout';
import { floorToHour } from './scenarioBuilder';

// ---------------------------------------------------------------------------
// Response schema
// ---------------------------------------------------------------------------

const nullableNumberArray = z.array(z.number().nullable());

const openMeteoResponseSchema = z.object({
  latitude: z.number(),
  longitude: z.number(),
  timezone: z.string().optional(),
  hourly: z.object({
    time: z.array(z.number()),
    precipitation: nullableNumberArray,
    rain: nullableNumberArray.optional(),
    precipitation_probability: nullableNumberArray.optional(),
    soil_moisture_0_to_7cm: nullableNumberArray.optional(),
    temperature_2m: nullableNumberArray.optional(),
    weather_code: nullableNumberArray.optional(),
  }),
});

export type OpenMeteoResponse = z.infer<typeof openMeteoResponseSchema>;

export class OpenMeteoError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'OpenMeteoError';
  }
}

// ---------------------------------------------------------------------------
// WMO weather interpretation codes
// ---------------------------------------------------------------------------

const WMO_DESCRIPTIONS: ReadonlyArray<[codes: number[], label: string]> = [
  [[0], 'Clear sky'],
  [[1, 2, 3], 'Partly cloudy'],
  [[45, 48], 'Fog'],
  [[51, 53, 55, 56, 57], 'Drizzle'],
  [[61, 63, 65, 66, 67], 'Rain'],
  [[80, 81, 82], 'Rain showers'],
  [[95, 96, 99], 'Thunderstorm'],
];

export function describeWmoCode(code: number | null | undefined): string | undefined {
  if (code === null || code === undefined) return undefined;
  return WMO_DESCRIPTIONS.find(([codes]) => codes.includes(code))?.[1] ?? `WMO code ${code}`;
}

// ---------------------------------------------------------------------------
// Request
// ---------------------------------------------------------------------------

export interface OpenMeteoRequestOptions {
  latitude?: number;
  longitude?: number;
  forecastDays?: number;
  /** Number of past days to include (enables real-time hindcast windows). */
  pastDays?: number;
  timeoutMs?: number;
  maxRetries?: number;
  fetchImpl?: FetchImplementation;
}

export function buildOpenMeteoUrl(options: OpenMeteoRequestOptions = {}): string {
  const params = new URLSearchParams({
    latitude: String(options.latitude ?? BBR_LATITUDE),
    longitude: String(options.longitude ?? BBR_LONGITUDE),
    hourly: OPEN_METEO_HOURLY_VARIABLES.join(','),
    timezone: BBR_TIMEZONE,
    timeformat: 'unixtime',
    forecast_days: String(options.forecastDays ?? OPEN_METEO_FORECAST_DAYS),
  });
  if (options.pastDays !== undefined && options.pastDays > 0) {
    params.set('past_days', String(options.pastDays));
  }
  return `${OPEN_METEO_FORECAST_ENDPOINT}?${params.toString()}`;
}

/** Fetch and schema-validate a raw Open-Meteo forecast response. */
export async function fetchOpenMeteoForecast(options: OpenMeteoRequestOptions = {}): Promise<OpenMeteoResponse> {
  const url = buildOpenMeteoUrl(options);
  let raw: unknown;
  try {
    raw = await fetchJsonWithTimeout(url, {
      timeoutMs: options.timeoutMs ?? OPEN_METEO_TIMEOUT_MS,
      maxRetries: options.maxRetries ?? OPEN_METEO_MAX_RETRIES,
      ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
    });
  } catch (error) {
    throw new OpenMeteoError(`Open-Meteo request failed: ${(error as Error).message}`, { cause: error });
  }
  return validateOpenMeteoResponse(raw);
}

export function validateOpenMeteoResponse(raw: unknown): OpenMeteoResponse {
  const result = openMeteoResponseSchema.safeParse(raw);
  if (!result.success) {
    const detail = result.error.issues
      .slice(0, 3)
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new OpenMeteoError(`Unexpected Open-Meteo response shape — ${detail}`);
  }

  const { hourly } = result.data;
  const expectedLength = hourly.time.length;
  const mismatched = Object.entries(hourly).filter(
    ([, values]) => Array.isArray(values) && values.length !== expectedLength,
  );
  if (mismatched.length > 0) {
    throw new OpenMeteoError(
      `Open-Meteo hourly arrays have inconsistent lengths: ${mismatched.map(([key]) => key).join(', ')}`,
    );
  }
  return result.data;
}

// ---------------------------------------------------------------------------
// Parsing into simulation hours
// ---------------------------------------------------------------------------

export interface ParsedLiveHour {
  timeMs: number;
  precipitationMmPerHr: number;
  /** Saturation S ∈ [0, 1]; undefined when the API returned null. */
  soilSaturation: number | undefined;
  temperatureC?: number;
  precipitationProbabilityPct?: number;
  weatherDescription?: string;
}

export interface ParsedLiveForecast {
  latitude: number;
  longitude: number;
  startMs: number;
  hours: ParsedLiveHour[];
  warnings: string[];
}

/** Convert volumetric soil moisture θ (m³/m³) into saturation S = θ / θ_sat. */
export function volumetricToSaturation(volumetricM3PerM3: number): number {
  return Math.min(Math.max(volumetricM3PerM3 / SOIL_POROSITY_M3_PER_M3, 0), 1);
}

/**
 * Slice the forecast to start at the current hour and cover `horizonHours`.
 * Null precipitation is treated as 0 mm/h and reported as a warning.
 */
export function parseOpenMeteoResponse(
  response: OpenMeteoResponse,
  options: { nowMs: number; horizonHours?: number },
): ParsedLiveForecast {
  const horizon = options.horizonHours ?? DEFAULT_SIMULATION_HORIZON_HOURS;
  const currentHourMs = floorToHour(options.nowMs);
  const { hourly } = response;

  const startIndex = hourly.time.findIndex((unixSec) => unixSec * 1000 >= currentHourMs);
  if (startIndex < 0) {
    throw new OpenMeteoError('Open-Meteo forecast contains no hours at or after the current time.');
  }

  const endIndex = Math.min(startIndex + horizon, hourly.time.length);
  const warnings: string[] = [];
  let nullPrecipitation = 0;
  let nullSoil = 0;

  const hours: ParsedLiveHour[] = [];
  for (let i = startIndex; i < endIndex; i += 1) {
    const precipitation = hourly.precipitation[i];
    const soil = hourly.soil_moisture_0_to_7cm?.[i];
    const temperature = hourly.temperature_2m?.[i];
    const probability = hourly.precipitation_probability?.[i];
    const description = describeWmoCode(hourly.weather_code?.[i]);

    if (precipitation === null || precipitation === undefined) nullPrecipitation += 1;
    if (soil === null || soil === undefined) nullSoil += 1;

    hours.push({
      timeMs: (hourly.time[i] ?? 0) * 1000,
      precipitationMmPerHr: Math.max(0, precipitation ?? 0),
      soilSaturation: soil === null || soil === undefined ? undefined : volumetricToSaturation(soil),
      ...(temperature !== null && temperature !== undefined ? { temperatureC: temperature } : {}),
      ...(probability !== null && probability !== undefined ? { precipitationProbabilityPct: probability } : {}),
      ...(description !== undefined ? { weatherDescription: description } : {}),
    });
  }

  if (hours.length < horizon) {
    warnings.push(`Open-Meteo returned only ${hours.length} of ${horizon} requested forecast hours.`);
  }
  if (nullPrecipitation > 0) {
    warnings.push(`${nullPrecipitation} hour(s) had null precipitation and were treated as 0 mm/h.`);
  }
  if (nullSoil > 0) {
    warnings.push(`${nullSoil} hour(s) had null soil moisture and were filled by the soil saturation model.`);
  }

  return {
    latitude: response.latitude,
    longitude: response.longitude,
    startMs: hours[0]?.timeMs ?? currentHourMs,
    hours,
    warnings,
  };
}
