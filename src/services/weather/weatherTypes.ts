/**
 * @file weatherTypes.ts
 * @description Strongly-typed contracts for weather ingestion, tidal
 * simulation and scenario payloads. These types mirror the OpenAPI 3.0
 * component schemas declared in `openApiSpec.ts`.
 */

// ---------------------------------------------------------------------------
// Unified simulation time series
// ---------------------------------------------------------------------------

export interface HourlyWeatherPoint {
  /** Absolute timestamp of the start of the hour (ISO 8601, UTC). */
  timeIso: string;
  /** Relative simulation hour t = 0..N-1. */
  hourOffset: number;
  /** Rainfall intensity i (mm/h). */
  precipitationMmPerHr: number;
  /** Soil saturation index S ∈ [0, 1]. */
  soilSaturation: number;
  /** Downstream Klang river / tidal level H_downstream (m). */
  downstreamLevelM: number;
  /** Air temperature (°C), when available. */
  temperatureC?: number;
  /** Probability of precipitation (%), when available. */
  precipitationProbabilityPct?: number;
  /** Short human-readable weather description. */
  weatherDescription?: string;
}

export type ScenarioSourceType = 'LIVE_API' | 'PRESET' | 'CUSTOM_SWAGGER';

/** Fields that were derived by a model rather than supplied by the source. */
export type DerivedField = 'timeIso' | 'soilSaturation' | 'downstreamLevelM';

export interface ScenarioMetadata {
  /** Data provider identifier (e.g. `open-meteo`, `custom-json`). */
  provider: string;
  latitude: number;
  longitude: number;
  /** True when live data was unavailable and a safe fallback was served. */
  isFallback: boolean;
  /** Non-fatal data quality warnings. */
  warnings: string[];
  /** Fields filled by the soil / tidal models. */
  derivedFields: DerivedField[];
}

export interface WeatherScenarioPayload {
  scenarioId: string;
  scenarioName: string;
  description?: string;
  sourceType: ScenarioSourceType;
  /** Payload creation time (ISO 8601). */
  createdAt: string;
  hourlySeries: HourlyWeatherPoint[];
  metadata: ScenarioMetadata;
}

// ---------------------------------------------------------------------------
// Preset scenarios
// ---------------------------------------------------------------------------

export const PRESET_SCENARIO_IDS = [
  'SCENARIO_CLEAR_DAY',
  'SCENARIO_PRE_STORM',
  'SCENARIO_FLASH_FLOOD_HIGH_TIDE',
] as const;

export type PresetScenarioId = (typeof PRESET_SCENARIO_IDS)[number];

// ---------------------------------------------------------------------------
// Tidal model
// ---------------------------------------------------------------------------

export interface StormSurgeParams {
  /** Peak surge added on top of the astronomical tide (m). */
  peakM: number;
  /** Simulation hour at which the surge peaks. */
  centerHour: number;
  /** Total surge duration (hours, raised-cosine envelope). */
  durationHours: number;
}

export interface TidalProfileParams {
  /** Mean water level (m). */
  meanLevelM: number;
  /** Astronomical tide amplitude (m). */
  amplitudeM: number;
  /** Tidal period (hours). Defaults to M2 = 12.42 h. */
  periodHours?: number;
  /** Simulation hour of astronomical high water (may be negative). */
  highWaterHourOffset: number;
  /** Optional meteorological storm surge. */
  surge?: StormSurgeParams;
}

// ---------------------------------------------------------------------------
// Parametric builder (Mode B — visual scenario builder)
// ---------------------------------------------------------------------------

export type StormProfileShape = 'BLOCK' | 'TRIANGULAR';

export interface StormEventParams {
  /** Simulation hour at which rainfall begins. */
  startHour: number;
  /** Storm duration (hours). */
  durationHours: number;
  /** Peak rainfall intensity (mm/h). */
  peakIntensityMmPerHr: number;
  /** Temporal rainfall profile. */
  profile: StormProfileShape;
}

export interface RecessionTailParams {
  /** Light rainfall intensity after the main storm (mm/h). */
  intensityMmPerHr: number;
  /** Tail duration (hours). */
  durationHours: number;
}

export interface ParametricScenarioInput {
  scenarioId?: string;
  scenarioName?: string;
  description?: string;
  horizonHours?: number;
  startTimeIso?: string;
  initialSoilSaturation?: number;
  storm?: StormEventParams;
  recessionTail?: RecessionTailParams;
  tide?: TidalProfileParams;
}

// ---------------------------------------------------------------------------
// Custom JSON injection (Mode A — Swagger / OpenAPI payload)
// ---------------------------------------------------------------------------

export interface CustomHourlyPointInput {
  hourOffset: number;
  timeIso?: string;
  precipitationMmPerHr: number;
  soilSaturation?: number;
  downstreamLevelM?: number;
  temperatureC?: number;
  precipitationProbabilityPct?: number;
  weatherDescription?: string;
}

export interface CustomScenarioInput {
  scenarioId: string;
  scenarioName: string;
  description?: string;
  startTimeIso?: string;
  initialSoilSaturation?: number;
  hourlySeries: CustomHourlyPointInput[];
}

// ---------------------------------------------------------------------------
// Scenario loading requests & summaries
// ---------------------------------------------------------------------------

export type ScenarioRequest =
  | { mode: 'LIVE_API' }
  | { mode: 'PRESET'; scenarioId: PresetScenarioId }
  | { mode: 'CUSTOM_JSON'; payload: unknown }
  | { mode: 'CUSTOM_URL'; url: string }
  | { mode: 'PARAMETRIC'; params: unknown };

export interface ScenarioSummary {
  scenarioId: string;
  sourceType: ScenarioSourceType;
  horizonHours: number;
  totalRainfallMm: number;
  peakIntensityMmPerHr: number;
  peakIntensityHour: number;
  maxDownstreamLevelM: number;
  maxDownstreamHour: number;
  /** Hours where H_downstream ≥ downstream critical level. */
  hoursDownstreamCritical: number;
}

export interface ValidationIssue {
  /** Dot-separated JSON path to the offending field (e.g. `hourlySeries.3.precipitationMmPerHr`). */
  path: string;
  message: string;
}
