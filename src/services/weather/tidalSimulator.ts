/**
 * @file tidalSimulator.ts
 * @description Synthetic Klang Strait downstream level generator.
 *
 *   H_down(t) = H_mean + A · cos(2π (t − t_HW) / T) + Surge(t)
 *
 *   Surge(t)  = P · ½ · (1 + cos(2π (t − t_c) / D))   for |t − t_c| < D/2
 *             = 0                                      otherwise
 *
 * NOTE: Real-time Port Klang tide gauge data is not publicly available as a
 * free API; the LIVE_API mode therefore uses a phase-consistent synthetic tide.
 */

import {
  M2_TIDAL_PERIOD_HOURS,
  NORMAL_TIDE_AMPLITUDE_M,
  NORMAL_TIDE_MEAN_LEVEL_M,
  TIDE_REFERENCE_HIGH_WATER_EPOCH_MS,
} from '../../constants/weatherConstants';
import type { StormSurgeParams, TidalProfileParams } from './weatherTypes';

const MS_PER_HOUR = 3_600_000;

/** Round to 4 decimal places to keep series human-readable. */
function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

/** Raised-cosine storm surge envelope at simulation hour `hour`. */
export function calculateStormSurge(surge: StormSurgeParams, hour: number): number {
  const halfWidth = surge.durationHours / 2;
  const distance = hour - surge.centerHour;
  if (Math.abs(distance) >= halfWidth) {
    return 0;
  }
  return surge.peakM * 0.5 * (1 + Math.cos((2 * Math.PI * distance) / surge.durationHours));
}

/** Downstream level (m) at simulation hour `hour`. */
export function calculateTidalLevel(params: TidalProfileParams, hour: number): number {
  const period = params.periodHours ?? M2_TIDAL_PERIOD_HOURS;
  const astronomical =
    params.meanLevelM +
    params.amplitudeM * Math.cos((2 * Math.PI * (hour - params.highWaterHourOffset)) / period);
  const surge = params.surge ? calculateStormSurge(params.surge, hour) : 0;
  return round4(astronomical + surge);
}

/** Generate an hourly downstream level series for hours 0..horizonHours-1. */
export function generateTidalSeries(params: TidalProfileParams, horizonHours: number): number[] {
  return Array.from({ length: horizonHours }, (_, hour) => calculateTidalLevel(params, hour));
}

/**
 * Compute the simulation-relative high-water offset for a series starting at
 * `startMs`, so that live tides stay phase-consistent across reloads.
 */
export function computeHighWaterOffsetForStart(
  startMs: number,
  periodHours: number = M2_TIDAL_PERIOD_HOURS,
): number {
  const hoursSinceEpoch = (startMs - TIDE_REFERENCE_HIGH_WATER_EPOCH_MS) / MS_PER_HOUR;
  const phaseHours = ((hoursSinceEpoch % periodHours) + periodHours) % periodHours;
  return phaseHours === 0 ? 0 : periodHours - phaseHours;
}

/** Normal (non-storm) Klang tidal profile aligned to an absolute start time. */
export function createNormalTideProfile(startMs: number): TidalProfileParams {
  return {
    meanLevelM: NORMAL_TIDE_MEAN_LEVEL_M,
    amplitudeM: NORMAL_TIDE_AMPLITUDE_M,
    periodHours: M2_TIDAL_PERIOD_HOURS,
    highWaterHourOffset: computeHighWaterOffsetForStart(startMs),
  };
}
