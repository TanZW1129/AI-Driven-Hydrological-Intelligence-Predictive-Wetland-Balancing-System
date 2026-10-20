/**
 * @file hydrologyEngine.ts
 * @description Pure, side-effect-free hydrological calculation engine for the
 * BBR 125-acre wetland. Implements:
 *   1. Effective runoff coefficient C_eff (soil-saturation adjusted)
 *   2. Peak surface runoff inflow Q_in (Rational Method)
 *   3. Total expected storm inflow volume V_in
 *   4. Available wetland buffer volume V_avail
 *   5. Sluice gate orifice outflow Q_out with tidal lock detection
 *   6. Discrete time-step water balance H_next
 *
 * NOTE: This module performs physics only. Authorisation to discharge is the
 * sole responsibility of `downstreamInterlock.ts` — callers MUST pass the
 * interlock's `recommendedGateOpeningM` into `calculateGateDischarge`.
 */

import {
  BASE_RUNOFF_COEFFICIENT,
  DISCHARGE_COEFFICIENT,
  GATE_MAX_OPENING_M,
  GATE_TOTAL_WIDTH_M,
  GRAVITY_ACCELERATION,
  H_MAX_CRITICAL_M,
  RATIONAL_METHOD_UNIT_FACTOR,
  SECONDS_PER_HOUR,
  SOIL_SATURATION_SENSITIVITY,
  WETLAND_AREA_M2,
} from '../constants/hydrologyConstants';
import type {
  AvailableStorageInput,
  GateDischargeInput,
  GateDischargeResult,
  RunoffInflowInput,
  StormVolumeInput,
  WaterBalanceInput,
  WaterBalanceResult,
} from '../types/hydrology';

// ---------------------------------------------------------------------------
// Input validation helpers
// ---------------------------------------------------------------------------

function assertFinite(value: number, name: string): void {
  if (!Number.isFinite(value)) {
    throw new RangeError(`[hydrologyEngine] ${name} must be a finite number, received ${value}.`);
  }
}

function assertNonNegative(value: number, name: string): void {
  assertFinite(value, name);
  if (value < 0) {
    throw new RangeError(`[hydrologyEngine] ${name} must be ≥ 0, received ${value}.`);
  }
}

function assertPositive(value: number, name: string): void {
  assertFinite(value, name);
  if (value <= 0) {
    throw new RangeError(`[hydrologyEngine] ${name} must be > 0, received ${value}.`);
  }
}

function assertUnitInterval(value: number, name: string): void {
  assertFinite(value, name);
  if (value < 0 || value > 1) {
    throw new RangeError(`[hydrologyEngine] ${name} must be within [0, 1], received ${value}.`);
  }
}

/** Clamp `value` into the closed interval [min, max]. */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

// ---------------------------------------------------------------------------
// 1. Effective runoff coefficient
// ---------------------------------------------------------------------------

/**
 * C_eff = C_base + (1 − C_base) × S × 0.3
 *
 * @param soilSaturation Soil saturation index S ∈ [0, 1].
 * @param baseCoefficient Base urban runoff coefficient C_base ∈ [0, 1].
 * @returns Effective runoff coefficient C_eff.
 */
export function calculateEffectiveRunoffCoefficient(
  soilSaturation: number,
  baseCoefficient: number = BASE_RUNOFF_COEFFICIENT,
): number {
  assertUnitInterval(soilSaturation, 'soilSaturation');
  assertUnitInterval(baseCoefficient, 'baseCoefficient');

  return baseCoefficient + (1 - baseCoefficient) * soilSaturation * SOIL_SATURATION_SENSITIVITY;
}

// ---------------------------------------------------------------------------
// 2. Peak surface runoff inflow (Rational Method)
// ---------------------------------------------------------------------------

/**
 * Q_in = (C_eff · i · A_cat) / 360
 *
 * @returns Peak inflow rate Q_in (m³/s).
 */
export function calculateRunoffInflow(input: RunoffInflowInput): number {
  const { rainfallIntensityMmPerHr, runoffCoefficient, catchmentAreaHa } = input;

  assertNonNegative(rainfallIntensityMmPerHr, 'rainfallIntensityMmPerHr');
  assertUnitInterval(runoffCoefficient, 'runoffCoefficient');
  assertNonNegative(catchmentAreaHa, 'catchmentAreaHa');

  return (runoffCoefficient * rainfallIntensityMmPerHr * catchmentAreaHa) / RATIONAL_METHOD_UNIT_FACTOR;
}

// ---------------------------------------------------------------------------
// 3. Total expected storm inflow volume
// ---------------------------------------------------------------------------

/**
 * V_in = Σ_{t=1..T} Q_in(t) × 3600
 *
 * @returns Total inflow volume over the forecast horizon (m³).
 */
export function calculateStormInflowVolume(input: StormVolumeInput): number {
  const { hourlyRainfallMmPerHr, runoffCoefficient, catchmentAreaHa } = input;

  return hourlyRainfallMmPerHr.reduce((totalVolume, intensity, index) => {
    assertNonNegative(intensity, `hourlyRainfallMmPerHr[${index}]`);
    const hourlyInflow = calculateRunoffInflow({
      rainfallIntensityMmPerHr: intensity,
      runoffCoefficient,
      catchmentAreaHa,
    });
    return totalVolume + hourlyInflow * SECONDS_PER_HOUR;
  }, 0);
}

// ---------------------------------------------------------------------------
// 4. Available wetland buffer volume
// ---------------------------------------------------------------------------

/**
 * V_avail = max(0, (H_max − H_current) × A_wetland)
 *
 * @returns Remaining storage before spillover (m³).
 */
export function calculateAvailableStorage(input: AvailableStorageInput): number {
  const {
    currentLevelM,
    criticalLevelM = H_MAX_CRITICAL_M,
    wetlandAreaM2 = WETLAND_AREA_M2,
  } = input;

  assertNonNegative(currentLevelM, 'currentLevelM');
  assertPositive(criticalLevelM, 'criticalLevelM');
  assertPositive(wetlandAreaM2, 'wetlandAreaM2');

  return Math.max(0, (criticalLevelM - currentLevelM) * wetlandAreaM2);
}

// ---------------------------------------------------------------------------
// 5. Sluice gate outflow & tidal lock
// ---------------------------------------------------------------------------

/**
 * Tidal lock condition: gravity discharge is physically impossible when the
 * downstream level equals or exceeds the wetland level.
 */
export function isTidalLockActive(wetlandLevelM: number, downstreamLevelM: number): boolean {
  assertFinite(wetlandLevelM, 'wetlandLevelM');
  assertFinite(downstreamLevelM, 'downstreamLevelM');
  return wetlandLevelM <= downstreamLevelM;
}

/**
 * Q_out = C_d · W · O_gate · √(2 · g · (H_current − H_downstream))
 * Q_out = 0 when H_current ≤ H_downstream (tidal lock).
 */
export function calculateGateDischarge(input: GateDischargeInput): GateDischargeResult {
  const {
    wetlandLevelM,
    downstreamLevelM,
    gateOpeningM,
    dischargeCoefficient = DISCHARGE_COEFFICIENT,
    gateWidthM = GATE_TOTAL_WIDTH_M,
  } = input;

  assertNonNegative(wetlandLevelM, 'wetlandLevelM');
  assertFinite(downstreamLevelM, 'downstreamLevelM');
  assertFinite(gateOpeningM, 'gateOpeningM');
  assertPositive(dischargeCoefficient, 'dischargeCoefficient');
  assertPositive(gateWidthM, 'gateWidthM');

  const headDifferenceM = wetlandLevelM - downstreamLevelM;
  const appliedGateOpeningM = clamp(gateOpeningM, 0, GATE_MAX_OPENING_M);
  const tidalLocked = isTidalLockActive(wetlandLevelM, downstreamLevelM);

  if (tidalLocked || appliedGateOpeningM === 0) {
    return {
      dischargeRateM3PerS: 0,
      headDifferenceM,
      isTidalLocked: tidalLocked,
      // Tidal lock forces the gate closed to prevent backflow.
      appliedGateOpeningM: tidalLocked ? 0 : appliedGateOpeningM,
    };
  }

  const dischargeRateM3PerS =
    dischargeCoefficient *
    gateWidthM *
    appliedGateOpeningM *
    Math.sqrt(2 * GRAVITY_ACCELERATION * headDifferenceM);

  return {
    dischargeRateM3PerS,
    headDifferenceM,
    isTidalLocked: false,
    appliedGateOpeningM,
  };
}

// ---------------------------------------------------------------------------
// 6. Discrete time-step water balance
// ---------------------------------------------------------------------------

/**
 * ΔV = (Q_in − Q_out) × Δt
 * H_next = max(0, H_current + ΔV / A_wetland)
 */
export function stepWaterBalance(input: WaterBalanceInput): WaterBalanceResult {
  const {
    currentLevelM,
    inflowM3PerS,
    outflowM3PerS,
    timeStepSec,
    wetlandAreaM2 = WETLAND_AREA_M2,
  } = input;

  assertNonNegative(currentLevelM, 'currentLevelM');
  assertNonNegative(inflowM3PerS, 'inflowM3PerS');
  assertNonNegative(outflowM3PerS, 'outflowM3PerS');
  assertPositive(timeStepSec, 'timeStepSec');
  assertPositive(wetlandAreaM2, 'wetlandAreaM2');

  const deltaVolumeM3 = (inflowM3PerS - outflowM3PerS) * timeStepSec;
  const nextLevelM = Math.max(0, currentLevelM + deltaVolumeM3 / wetlandAreaM2);

  return {
    nextLevelM,
    deltaVolumeM3,
    deltaLevelM: nextLevelM - currentLevelM,
    exceedsCriticalLevel: nextLevelM > H_MAX_CRITICAL_M,
  };
}
