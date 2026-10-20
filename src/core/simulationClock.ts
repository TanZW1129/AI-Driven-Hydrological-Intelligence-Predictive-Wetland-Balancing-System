/**
 * @file simulationClock.ts
 * @description Simulation clock and time-series interpolator for the BBR digital twin.
 *
 * Allows the simulation to step at fine-grained discrete time intervals (e.g. Δt = 60s)
 * while smoothly interpolating hourly rainfall, tidal profiles, and soil dynamics.
 */

import type { HourlyWeatherPoint } from '../services/weather/weatherTypes';

const SECONDS_PER_HOUR = 3600;

export interface InterpolatedWeatherState {
  simTimeSec: number;
  currentHourIndex: number;
  fractionOfHour: number;
  rainfallIntensityMmPerHr: number;
  downstreamLevelM: number;
  soilSaturation: number;
  forecastLookahead: HourlyWeatherPoint[];
}

export class SimulationClock {
  private simTimeSec: number;
  private totalDurationSec: number;
  private hourlySeries: readonly HourlyWeatherPoint[];

  constructor(hourlySeries: readonly HourlyWeatherPoint[], initialTimeSec: number = 0) {
    if (hourlySeries.length === 0) {
      throw new Error('SimulationClock requires at least one hourly weather point.');
    }
    this.hourlySeries = hourlySeries;
    this.simTimeSec = initialTimeSec;
    this.totalDurationSec = hourlySeries.length * SECONDS_PER_HOUR;
  }

  public getTimeSec(): number {
    return this.simTimeSec;
  }

  public getTotalDurationSec(): number {
    return this.totalDurationSec;
  }

  public isComplete(): boolean {
    return this.simTimeSec >= this.totalDurationSec;
  }

  public reset(timeSec: number = 0): void {
    this.simTimeSec = timeSec;
  }

  /**
   * Advance simulation clock by dtSec.
   */
  public advance(dtSec: number): void {
    this.simTimeSec = Math.min(this.simTimeSec + dtSec, this.totalDurationSec);
  }

  /**
   * Samples interpolated environmental state at current simulation timestamp.
   */
  public sample(): InterpolatedWeatherState {
    const hourFloat = this.simTimeSec / SECONDS_PER_HOUR;
    const hourIndex = Math.min(Math.floor(hourFloat), this.hourlySeries.length - 1);
    const fractionOfHour = hourFloat - Math.floor(hourFloat);

    const currentPoint = this.hourlySeries[hourIndex]!;
    const nextIndex = Math.min(hourIndex + 1, this.hourlySeries.length - 1);
    const nextPoint = this.hourlySeries[nextIndex]!;

    // Step-block for rainfall (rain intensity remains constant within each hour)
    const rainfallIntensityMmPerHr = currentPoint.precipitationMmPerHr;

    // Linear interpolation for downstream tide level between hour markers
    const downstreamLevelM =
      currentPoint.downstreamLevelM +
      (nextPoint.downstreamLevelM - currentPoint.downstreamLevelM) * fractionOfHour;

    // Linear interpolation for soil saturation
    const soilSaturation =
      currentPoint.soilSaturation +
      (nextPoint.soilSaturation - currentPoint.soilSaturation) * fractionOfHour;

    // Sliced forecast from the current hour forward
    const forecastLookahead = this.hourlySeries.slice(hourIndex);

    return {
      simTimeSec: this.simTimeSec,
      currentHourIndex: hourIndex,
      fractionOfHour,
      rainfallIntensityMmPerHr,
      downstreamLevelM: Math.round(downstreamLevelM * 10_000) / 10_000,
      soilSaturation: Math.round(soilSaturation * 10_000) / 10_000,
      forecastLookahead,
    };
  }
}
