/**
 * @file hydrologyConstants.ts
 * @description Geographic, physical, hydrological and safety constants for the
 * Bandar Bukit Raja (BBR) 125-acre townpark wetland digital twin.
 *
 * All values are SI units unless explicitly suffixed otherwise
 * (e.g. `_HA` for hectares, `_MM_PER_HR` for rainfall intensity).
 */

// ---------------------------------------------------------------------------
// Unit conversion factors
// ---------------------------------------------------------------------------

/** International acre to square metres (exact definition). */
export const SQUARE_METRES_PER_ACRE = 4046.8564224;

/** Hectare to square metres. */
export const SQUARE_METRES_PER_HECTARE = 10_000;

/** Seconds in one hour. */
export const SECONDS_PER_HOUR = 3_600;

/**
 * Rational Method unit factor.
 * Q [m³/s] = C · i [mm/h] · A [ha] / 360
 */
export const RATIONAL_METHOD_UNIT_FACTOR = 360;

// ---------------------------------------------------------------------------
// Geographic constants
// ---------------------------------------------------------------------------

/** Bandar Bukit Raja, Klang, Selangor — latitude (decimal degrees). */
export const BBR_LATITUDE = 3.085;

/** Bandar Bukit Raja, Klang, Selangor — longitude (decimal degrees). */
export const BBR_LONGITUDE = 101.445;

/** IANA timezone used for forecast alignment (UTC+8). */
export const BBR_TIMEZONE = 'Asia/Singapore';

// ---------------------------------------------------------------------------
// Physical geometry
// ---------------------------------------------------------------------------

/** Wetland nominal area in acres. */
export const WETLAND_AREA_ACRES = 125;

/** Wetland surface area A_wetland (m²) ≈ 505,857 m². */
export const WETLAND_AREA_M2 = WETLAND_AREA_ACRES * SQUARE_METRES_PER_ACRE;

/** Default upstream catchment area A_cat (hectares). */
export const DEFAULT_CATCHMENT_AREA_HA = 500;

// ---------------------------------------------------------------------------
// Runoff coefficients
// ---------------------------------------------------------------------------

/** Base urban / residential runoff coefficient C_base (dimensionless). */
export const BASE_RUNOFF_COEFFICIENT = 0.65;

/** Soil-saturation sensitivity factor applied in C_eff adjustment. */
export const SOIL_SATURATION_SENSITIVITY = 0.3;

// ---------------------------------------------------------------------------
// Wetland water level thresholds (metres above wetland bed datum)
// ---------------------------------------------------------------------------

/** H_min — minimum ecological level; never drain below this. */
export const H_MIN_ECOLOGICAL_M = 1.0;

/** H_normal — normal operating level for recreation & ecology. */
export const H_NORMAL_OPERATING_M = 2.0;

/** H_max — critical spillover / flood level. */
export const H_MAX_CRITICAL_M = 3.5;

// ---------------------------------------------------------------------------
// Sluice gate hydraulics
// ---------------------------------------------------------------------------

/** Discharge coefficient C_d for the sluice gate orifice. */
export const DISCHARGE_COEFFICIENT = 0.62;

/** Total clear width W of all sluice gate bays (m). */
export const GATE_TOTAL_WIDTH_M = 10.0;

/** Maximum gate opening height O_max (m). */
export const GATE_MAX_OPENING_M = 2.0;

/** Gravitational acceleration g (m/s²). */
export const GRAVITY_ACCELERATION = 9.81;

// ---------------------------------------------------------------------------
// Downstream safety interlock thresholds
// ---------------------------------------------------------------------------

/**
 * ΔH_safe — minimum positive head (wetland minus downstream) required before
 * gravity discharge is permitted. Prevents backflow and unstable low-head flow.
 */
export const MIN_SAFE_HEAD_DIFFERENCE_M = 0.1;

/**
 * H_downstream_critical — downstream Klang river / tidal level at or above
 * which the receiving channel is considered at capacity. No discharge allowed.
 */
export const DOWNSTREAM_CRITICAL_LEVEL_M = 2.5;

/**
 * Hysteresis band (m) below H_downstream_critical that the downstream level
 * must recede to before a latched lockout can be released.
 */
export const DOWNSTREAM_RELEASE_MARGIN_M = 0.15;

/**
 * Additional head (m) above ΔH_safe required to release a latched
 * backflow lockout. Prevents gate hunting around the tidal crossover point.
 */
export const HEAD_RELEASE_MARGIN_M = 0.05;
