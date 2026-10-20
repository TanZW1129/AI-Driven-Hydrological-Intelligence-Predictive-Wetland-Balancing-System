/**
 * @file sensorSimulator.ts
 * @description Virtual IoT sensor telemetry and mechanical actuator simulator
 * for the Bandar Bukit Raja (BBR) wetland digital twin.
 *
 * Implements:
 *   1. Ultrasonic water level sensor (with measurement noise & sampling jitter)
 *   2. Downstream river / tidal gauge sensor
 *   3. Soil moisture TDR / capacitance sensor
 *   4. Motorized sluice gate actuator kinetics (slew rate / finite transit speed)
 */

import {
  GATE_MAX_OPENING_M,
  H_MAX_CRITICAL_M,
  H_MIN_ECOLOGICAL_M,
} from '../../constants/hydrologyConstants';
import { clamp } from '../../core/hydrologyEngine';

// ---------------------------------------------------------------------------
// Physical Actuator Constants
// ---------------------------------------------------------------------------

/**
 * Standard mechanical gate travel speed (m/s).
 * At 0.05 m/s, a full stroke from 0.0 m to 2.0 m takes 40 physical seconds.
 */
export const DEFAULT_GATE_SLEW_RATE_M_PER_S = 0.05;

/** Standard deviation for ultrasonic water level sensor jitter (metres). */
export const DEFAULT_ULTRASONIC_NOISE_STD_DEV_M = 0.003;

/** Standard deviation for tidal gauge sensor jitter (metres). */
export const DEFAULT_TIDAL_GAUGE_NOISE_STD_DEV_M = 0.005;

// ---------------------------------------------------------------------------
// Telemetry & Actuator Data Types
// ---------------------------------------------------------------------------

export type SensorHealthStatus = 'HEALTHY' | 'DEGRADED' | 'FAULT';

export interface SensorReading {
  /** Filtered / calibrated reading in engineering units (m or fraction). */
  value: number;
  /** Raw simulated physical value before noise injection. */
  rawValue: number;
  /** Signal noise offset applied. */
  noiseOffset: number;
  /** Sensor hardware health diagnostic status. */
  status: SensorHealthStatus;
  /** Sampling timestamp (simulation seconds). */
  timestampSec: number;
}

export interface GateActuatorState {
  /** Actual physical gate opening position O_actual (m) ∈ [0, O_max]. */
  currentOpeningM: number;
  /** Commanded setpoint opening O_target (m) ∈ [0, O_max]. */
  targetOpeningM: number;
  /** Commanded motor slew rate (m/s). */
  slewRateMPerS: number;
  /** Whether the mechanical drive is currently in motion. */
  isMoving: boolean;
  /** Estimated time remaining until target position is reached (seconds). */
  timeToTargetSec: number;
}

export interface IoTSensorTelemetry {
  /** Simulation clock timestamp (seconds). */
  simTimeSec: number;
  /** Wetland water level sensor telemetry. */
  wetlandLevel: SensorReading;
  /** Downstream river / tidal gauge telemetry. */
  downstreamLevel: SensorReading;
  /** Soil moisture saturation sensor telemetry. */
  soilSaturation: SensorReading;
  /** Motorized gate actuator physical position feedback. */
  gateActuator: GateActuatorState;
}

// ---------------------------------------------------------------------------
// Noise & Gaussian Distribution Generator
// ---------------------------------------------------------------------------

/**
 * Box-Muller transform to generate zero-mean Gaussian distributed random noise.
 */
export function generateGaussianNoise(mean: number = 0, stdDev: number = 1): number {
  let u1 = 0;
  let u2 = 0;
  while (u1 === 0) u1 = Math.random();
  while (u2 === 0) u2 = Math.random();
  const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
  return mean + z0 * stdDev;
}

// ---------------------------------------------------------------------------
// Actuator Dynamics Function
// ---------------------------------------------------------------------------

/**
 * Advances the mechanical gate position by time step Δt based on motor slew rate.
 *
 * @param currentOpeningM Current physical opening height (m).
 * @param targetOpeningM Commanded target opening height (m).
 * @param dtSec Time step (seconds).
 * @param slewRateMPerS Motor travel speed (m/s).
 * @returns Updated physical gate opening height (m).
 */
export function stepActuatorOpening(
  currentOpeningM: number,
  targetOpeningM: number,
  dtSec: number,
  slewRateMPerS: number = DEFAULT_GATE_SLEW_RATE_M_PER_S,
): { newOpeningM: number; isMoving: boolean; timeToTargetSec: number } {
  const clampedTarget = clamp(targetOpeningM, 0, GATE_MAX_OPENING_M);
  const diff = clampedTarget - currentOpeningM;
  const absDiff = Math.abs(diff);

  if (absDiff < 1e-5) {
    return {
      newOpeningM: clampedTarget,
      isMoving: false,
      timeToTargetSec: 0,
    };
  }

  const maxTravel = slewRateMPerS * dtSec;
  if (absDiff <= maxTravel) {
    return {
      newOpeningM: clampedTarget,
      isMoving: false,
      timeToTargetSec: 0,
    };
  }

  const step = Math.sign(diff) * maxTravel;
  const newOpeningM = clamp(currentOpeningM + step, 0, GATE_MAX_OPENING_M);
  const remainingDiff = Math.abs(clampedTarget - newOpeningM);
  const timeToTargetSec = remainingDiff / slewRateMPerS;

  return {
    newOpeningM: Math.round(newOpeningM * 10_000) / 10_000,
    isMoving: true,
    timeToTargetSec: Math.round(timeToTargetSec * 10) / 10,
  };
}

// ---------------------------------------------------------------------------
// Sensor Reading Builders
// ---------------------------------------------------------------------------

export function sampleUltrasonicLevel(
  physicalWaterLevelM: number,
  simTimeSec: number,
  enableNoise: boolean = true,
  stdDevM: number = DEFAULT_ULTRASONIC_NOISE_STD_DEV_M,
): SensorReading {
  const noiseOffset = enableNoise ? generateGaussianNoise(0, stdDevM) : 0;
  const noisyValue = Math.max(0, physicalWaterLevelM + noiseOffset);

  let status: SensorHealthStatus = 'HEALTHY';
  if (noisyValue < H_MIN_ECOLOGICAL_M * 0.5 || noisyValue > H_MAX_CRITICAL_M * 1.3) {
    status = 'DEGRADED';
  }

  return {
    value: Math.round(noisyValue * 10_000) / 10_000,
    rawValue: physicalWaterLevelM,
    noiseOffset: Math.round(noiseOffset * 10_000) / 10_000,
    status,
    timestampSec: simTimeSec,
  };
}

export function sampleTidalGauge(
  physicalTidalLevelM: number,
  simTimeSec: number,
  enableNoise: boolean = true,
  stdDevM: number = DEFAULT_TIDAL_GAUGE_NOISE_STD_DEV_M,
): SensorReading {
  const noiseOffset = enableNoise ? generateGaussianNoise(0, stdDevM) : 0;
  const noisyValue = physicalTidalLevelM + noiseOffset;

  return {
    value: Math.round(noisyValue * 10_000) / 10_000,
    rawValue: physicalTidalLevelM,
    noiseOffset: Math.round(noiseOffset * 10_000) / 10_000,
    status: 'HEALTHY',
    timestampSec: simTimeSec,
  };
}

export function sampleSoilMoisture(
  physicalSaturation: number,
  simTimeSec: number,
  enableNoise: boolean = false,
): SensorReading {
  const noiseOffset = enableNoise ? generateGaussianNoise(0, 0.005) : 0;
  const noisyValue = clamp(physicalSaturation + noiseOffset, 0, 1);

  return {
    value: Math.round(noisyValue * 10_000) / 10_000,
    rawValue: physicalSaturation,
    noiseOffset: Math.round(noiseOffset * 10_000) / 10_000,
    status: 'HEALTHY',
    timestampSec: simTimeSec,
  };
}

// ---------------------------------------------------------------------------
// IoT Device Simulator Manager
// ---------------------------------------------------------------------------

export class IoTDeviceSimulator {
  private gateOpeningM: number;
  private targetOpeningM: number;
  private slewRateMPerS: number;
  private enableSensorNoise: boolean;

  constructor(
    initialGateOpeningM: number = 0,
    slewRateMPerS: number = DEFAULT_GATE_SLEW_RATE_M_PER_S,
    enableSensorNoise: boolean = true,
  ) {
    this.gateOpeningM = clamp(initialGateOpeningM, 0, GATE_MAX_OPENING_M);
    this.targetOpeningM = this.gateOpeningM;
    this.slewRateMPerS = slewRateMPerS;
    this.enableSensorNoise = enableSensorNoise;
  }

  /** Send setpoint command to the mechanical gate actuator. */
  public commandGateOpening(targetM: number): void {
    this.targetOpeningM = clamp(targetM, 0, GATE_MAX_OPENING_M);
  }

  /** Advance actuator position and produce synchronized telemetry pack. */
  public step(
    dtSec: number,
    simTimeSec: number,
    physicalWetlandLevelM: number,
    physicalDownstreamLevelM: number,
    physicalSoilSaturation: number,
  ): IoTSensorTelemetry {
    const actuatorResult = stepActuatorOpening(
      this.gateOpeningM,
      this.targetOpeningM,
      dtSec,
      this.slewRateMPerS,
    );

    this.gateOpeningM = actuatorResult.newOpeningM;

    const wetlandSensor = sampleUltrasonicLevel(
      physicalWetlandLevelM,
      simTimeSec,
      this.enableSensorNoise,
    );

    const tidalSensor = sampleTidalGauge(
      physicalDownstreamLevelM,
      simTimeSec,
      this.enableSensorNoise,
    );

    const soilSensor = sampleSoilMoisture(
      physicalSoilSaturation,
      simTimeSec,
      this.enableSensorNoise,
    );

    return {
      simTimeSec,
      wetlandLevel: wetlandSensor,
      downstreamLevel: tidalSensor,
      soilSaturation: soilSensor,
      gateActuator: {
        currentOpeningM: this.gateOpeningM,
        targetOpeningM: this.targetOpeningM,
        slewRateMPerS: this.slewRateMPerS,
        isMoving: actuatorResult.isMoving,
        timeToTargetSec: actuatorResult.timeToTargetSec,
      },
    };
  }

  public getActualGateOpening(): number {
    return this.gateOpeningM;
  }
}
