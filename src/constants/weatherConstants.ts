/**
 * @file weatherConstants.ts
 * @description Constants for weather ingestion, soil moisture modelling,
 * Klang Strait tidal simulation and custom scenario validation bounds.
 */

// ---------------------------------------------------------------------------
// Open-Meteo forecast API
// ---------------------------------------------------------------------------

export const OPEN_METEO_FORECAST_ENDPOINT = 'https://api.open-meteo.com/v1/forecast';

/** Hourly variables requested from Open-Meteo. */
export const OPEN_METEO_HOURLY_VARIABLES = [
  'precipitation',
  'rain',
  'precipitation_probability',
  'soil_moisture_0_to_7cm',
  'temperature_2m',
  'weather_code',
] as const;

/** Forecast days requested (covers a full 24 h horizon from any hour of day). */
export const OPEN_METEO_FORECAST_DAYS = 3;

/** Per-request network timeout (ms). */
export const OPEN_METEO_TIMEOUT_MS = 8_000;

/** Number of retries after the first failed attempt. */
export const OPEN_METEO_MAX_RETRIES = 1;

/** Live forecast cache time-to-live (ms). */
export const LIVE_WEATHER_CACHE_TTL_MS = 15 * 60 * 1_000;

/** Timeout for fetching a user-supplied custom scenario URL (ms). */
export const CUSTOM_URL_TIMEOUT_MS = 8_000;

// ---------------------------------------------------------------------------
// Scenario horizon & validation bounds
// ---------------------------------------------------------------------------

/** Default simulation horizon (hours). */
export const DEFAULT_SIMULATION_HORIZON_HOURS = 24;

/** Maximum accepted scenario horizon (7 days). */
export const MAX_SCENARIO_HORIZON_HOURS = 168;

/**
 * Upper plausibility bound for hourly rainfall (mm/h). The world record
 * 1-hour rainfall is ≈ 305 mm; 500 mm/h rejects obvious data-entry errors
 * while still allowing extreme stress-test scenarios.
 */
export const MAX_PLAUSIBLE_RAINFALL_MM_PER_HR = 500;

/** Accepted downstream / tidal level range (m, relative to wetland datum). */
export const DOWNSTREAM_LEVEL_MIN_M = -2;
export const DOWNSTREAM_LEVEL_MAX_M = 10;

/** Accepted air temperature range (°C). */
export const TEMPERATURE_MIN_C = -10;
export const TEMPERATURE_MAX_C = 60;

// ---------------------------------------------------------------------------
// Soil moisture model
// ---------------------------------------------------------------------------

/**
 * Saturated volumetric water content θ_sat (m³/m³) used to convert
 * Open-Meteo `soil_moisture_0_to_7cm` into a saturation index S ∈ [0, 1].
 * 0.45 is representative of Klang coastal marine clay / clay-loam.
 */
export const SOIL_POROSITY_M3_PER_M3 = 0.45;

/** Rainfall depth (mm) that takes the soil from fully dry to saturated. */
export const SOIL_INFILTRATION_CAPACITY_MM = 100;

/** Saturation decrease per dry hour (evapotranspiration / drainage). */
export const SOIL_DRYING_RATE_PER_HR = 0.005;

/** Rainfall below this intensity (mm/h) counts as a dry hour. */
export const DRY_HOUR_THRESHOLD_MM_PER_HR = 0.1;

/** Default antecedent soil saturation when no data is supplied. */
export const DEFAULT_INITIAL_SOIL_SATURATION = 0.5;

// ---------------------------------------------------------------------------
// Klang Strait tidal model (synthetic semi-diurnal)
// ---------------------------------------------------------------------------

/** Principal lunar semi-diurnal (M2) tidal period (hours). */
export const M2_TIDAL_PERIOD_HOURS = 12.42;

/**
 * Reference high-water epoch for the synthetic live tide. This is NOT a real
 * Port Klang tide table — it provides a deterministic, time-consistent phase.
 */
export const TIDE_REFERENCE_HIGH_WATER_EPOCH_MS = Date.UTC(2026, 0, 1, 0, 0, 0);

/** Normal Klang river / tidal profile used for LIVE_API and defaults. */
export const NORMAL_TIDE_MEAN_LEVEL_M = 1.4;
export const NORMAL_TIDE_AMPLITUDE_M = 0.4;
