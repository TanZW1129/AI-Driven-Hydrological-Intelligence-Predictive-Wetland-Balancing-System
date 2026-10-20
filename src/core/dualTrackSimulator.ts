/**
 * @file dualTrackSimulator.ts
 * @description Dual-Track Simulation Comparator Engine:
 * Compares "Static Traditional Wetland (Fixed Weir Spillway)" vs.
 * "AI Smart Wetland (3-Phase Pre-Discharge + Dynamic Sluice Gates)".
 *
 * Demonstrates quantified flood mitigation benefits:
 *   - Avoided urban overflow volume (m³)
 *   - Peak water level reduction (m)
 *   - Hours of flood inundation prevented
 */

import {
  DEFAULT_CATCHMENT_AREA_HA,
  GATE_TOTAL_WIDTH_M,
  H_MAX_CRITICAL_M,
  H_NORMAL_OPERATING_M,
  WETLAND_AREA_M2,
} from '../constants/hydrologyConstants';
import { IoTDeviceSimulator } from '../services/iot/sensorSimulator';
import type { WeatherScenarioPayload } from '../services/weather/weatherTypes';
import type { ControlPhase, InterlockReasonCode } from '../types/hydrology';
import {
  calculateEffectiveRunoffCoefficient,
  calculateGateDischarge,
  calculateRunoffInflow,
  stepWaterBalance,
} from './hydrologyEngine';
import { SimulationClock } from './simulationClock';
import { SmartWetlandStateMachine } from './stateMachine';

// ---------------------------------------------------------------------------
// Constants for Traditional Baseline
// ---------------------------------------------------------------------------

/** Broad-crested weir discharge coefficient for traditional static wetland. */
export const TRADITIONAL_WEIR_COEFF = 1.84;

/** Traditional weir crest elevation (m), fixed at normal operating level. */
export const TRADITIONAL_WEIR_CREST_M = H_NORMAL_OPERATING_M;

/** Traditional weir crest width (m). */
export const TRADITIONAL_WEIR_WIDTH_M = GATE_TOTAL_WIDTH_M;

// ---------------------------------------------------------------------------
// Telemetry & Comparison Types
// ---------------------------------------------------------------------------

export interface SimulationFrame {
  simTimeSec: number;
  hourOffset: number;
  rainfallIntensityMmPerHr: number;
  downstreamLevelM: number;
  soilSaturation: number;
  traditional: {
    waterLevelM: number;
    inflowM3PerS: number;
    outflowM3PerS: number;
    isSpilling: boolean;
    cumulativeOverflowM3: number;
  };
  smart: {
    waterLevelM: number;
    measuredWaterLevelM: number;
    inflowM3PerS: number;
    outflowM3PerS: number;
    gateOpeningM: number;
    targetGateOpeningM: number;
    gateIsMoving: boolean;
    phase: ControlPhase;
    decisionReason: string;
    canDischarge: boolean;
    activeLockout: boolean;
    interlockReasonCode: InterlockReasonCode;
    interlockDiagnostic: string;
    availableBufferM3: number;
    forecast6hRainMm: number;
    isSpilling: boolean;
    cumulativeOverflowM3: number;
  };
}

export interface DualTrackComparisonSummary {
  scenarioId: string;
  scenarioName: string;
  durationHours: number;
  totalRainfallMm: number;

  /** Traditional static baseline results */
  traditional: {
    peakWaterLevelM: number;
    spilloverHours: number;
    totalOverflowVolumeM3: number;
  };

  /** AI Smart digital twin results */
  smart: {
    peakWaterLevelM: number;
    spilloverHours: number;
    totalOverflowVolumeM3: number;
    gateOperationsCount: number;
    phaseDistribution: Record<ControlPhase, number>; // hours per phase
  };

  /** Comparative mitigation metrics */
  mitigation: {
    avoidedOverflowVolumeM3: number;
    peakLevelReductionM: number;
    floodDurationReductionHours: number;
    floodEliminated: boolean;
  };
}

// ---------------------------------------------------------------------------
// Traditional Static Wetland Discharge Formula
// ---------------------------------------------------------------------------

/**
 * Calculates outflow over a fixed unmanaged spillway weir.
 * Q = C_w · W · (H - H_crest)^1.5 when H > H_crest.
 * If downstream water level is higher than wetland water level, gravity outflow ceases (0).
 */
export function calculateTraditionalWeirDischarge(
  wetlandLevelM: number,
  downstreamLevelM: number,
  crestLevelM: number = TRADITIONAL_WEIR_CREST_M,
  weirWidthM: number = TRADITIONAL_WEIR_WIDTH_M,
  weirCoeff: number = TRADITIONAL_WEIR_COEFF,
): number {
  if (wetlandLevelM <= crestLevelM || wetlandLevelM <= downstreamLevelM) {
    return 0;
  }
  const headAboveCrest = wetlandLevelM - crestLevelM;
  return weirCoeff * weirWidthM * Math.pow(headAboveCrest, 1.5);
}

// ---------------------------------------------------------------------------
// Dual-Track Simulation Runner
// ---------------------------------------------------------------------------

export interface RunSimulationOptions {
  /** Time step in seconds (e.g. 60s for 1-minute resolution). Default: 60s */
  dtSec?: number;
  /** Initial wetland level (m). Default: 2.0 m (H_normal) */
  initialWetlandLevelM?: number;
  /** Maximum duration to simulate (hours). If omitted, runs entire scenario. */
  maxHours?: number;
}

export function runDualTrackSimulation(
  scenario: WeatherScenarioPayload,
  options: RunSimulationOptions = {},
): {
  frames: SimulationFrame[];
  summary: DualTrackComparisonSummary;
} {
  const dtSec = options.dtSec ?? 60;
  const initialLevelM = options.initialWetlandLevelM ?? H_NORMAL_OPERATING_M;

  const clock = new SimulationClock(scenario.hourlySeries);
  const stateMachine = new SmartWetlandStateMachine();
  const iotSimulator = new IoTDeviceSimulator(0);

  let tradLevelM = initialLevelM;
  let smartLevelM = initialLevelM;
  let tradCumulativeOverflowM3 = 0;
  let smartCumulativeOverflowM3 = 0;

  let tradPeakLevelM = initialLevelM;
  let smartPeakLevelM = initialLevelM;
  let tradSpilloverSec = 0;
  let smartSpilloverSec = 0;

  const phaseDurationSec: Record<ControlPhase, number> = {
    NORMAL: 0,
    PRE_DISCHARGE: 0,
    PEAK_SHAVING: 0,
    RECOVERY: 0,
    INTERLOCK_SUSPENDED: 0,
  };

  let gateOperationsCount = 0;
  let prevTargetGateM = 0;

  const frames: SimulationFrame[] = [];
  const maxSimDurationSec = options.maxHours
    ? options.maxHours * 3600
    : clock.getTotalDurationSec();

  while (!clock.isComplete() && clock.getTimeSec() < maxSimDurationSec) {
    const simTimeSec = clock.getTimeSec();
    const env = clock.sample();

    // 1. Inflow Calculation (identical upstream catchment for both tracks)
    const cEff = calculateEffectiveRunoffCoefficient(env.soilSaturation);
    const qIn = calculateRunoffInflow({
      rainfallIntensityMmPerHr: env.rainfallIntensityMmPerHr,
      runoffCoefficient: cEff,
      catchmentAreaHa: DEFAULT_CATCHMENT_AREA_HA,
    });

    // 2. Track A: Traditional Static Wetland Step
    const qTradOut = calculateTraditionalWeirDischarge(tradLevelM, env.downstreamLevelM);
    const tradBalance = stepWaterBalance({
      currentLevelM: tradLevelM,
      inflowM3PerS: qIn,
      outflowM3PerS: qTradOut,
      timeStepSec: dtSec,
      wetlandAreaM2: WETLAND_AREA_M2,
    });

    tradLevelM = tradBalance.nextLevelM;
    if (tradLevelM > tradPeakLevelM) tradPeakLevelM = tradLevelM;

    const tradIsSpilling = tradLevelM > H_MAX_CRITICAL_M;
    if (tradIsSpilling) {
      tradSpilloverSec += dtSec;
      // Excess volume spilling over surrounding bank
      tradCumulativeOverflowM3 += (tradLevelM - H_MAX_CRITICAL_M) * WETLAND_AREA_M2 * (dtSec / 3600);
    }

    // 3. Track B: AI Smart Digital Twin Step
    const stateDecision = stateMachine.evaluate({
      simTimeSec,
      wetlandLevelM: smartLevelM,
      downstreamLevelM: env.downstreamLevelM,
      currentRainfallMmPerHr: env.rainfallIntensityMmPerHr,
      soilSaturation: env.soilSaturation,
      currentGateOpeningM: iotSimulator.getActualGateOpening(),
      forecastSeries: env.forecastLookahead,
    });

    if (stateDecision.targetGateOpeningM !== prevTargetGateM) {
      gateOperationsCount += 1;
      prevTargetGateM = stateDecision.targetGateOpeningM;
    }

    iotSimulator.commandGateOpening(stateDecision.targetGateOpeningM);
    const telemetry = iotSimulator.step(
      dtSec,
      simTimeSec,
      smartLevelM,
      env.downstreamLevelM,
      env.soilSaturation,
    );

    const qSmartOutResult = calculateGateDischarge({
      wetlandLevelM: smartLevelM,
      downstreamLevelM: env.downstreamLevelM,
      gateOpeningM: telemetry.gateActuator.currentOpeningM,
    });

    const smartBalance = stepWaterBalance({
      currentLevelM: smartLevelM,
      inflowM3PerS: qIn,
      outflowM3PerS: qSmartOutResult.dischargeRateM3PerS,
      timeStepSec: dtSec,
      wetlandAreaM2: WETLAND_AREA_M2,
    });

    smartLevelM = smartBalance.nextLevelM;
    if (smartLevelM > smartPeakLevelM) smartPeakLevelM = smartLevelM;

    const smartIsSpilling = smartLevelM > H_MAX_CRITICAL_M;
    if (smartIsSpilling) {
      smartSpilloverSec += dtSec;
      smartCumulativeOverflowM3 += (smartLevelM - H_MAX_CRITICAL_M) * WETLAND_AREA_M2 * (dtSec / 3600);
    }

    phaseDurationSec[stateDecision.phase] += dtSec;

    // Record frame (sampled every 5 minutes or at least hourly to keep payload lightweight)
    if (simTimeSec % 300 === 0 || simTimeSec === 0) {
      frames.push({
        simTimeSec,
        hourOffset: Math.round((simTimeSec / 3600) * 10) / 10,
        rainfallIntensityMmPerHr: env.rainfallIntensityMmPerHr,
        downstreamLevelM: env.downstreamLevelM,
        soilSaturation: env.soilSaturation,
        traditional: {
          waterLevelM: Math.round(tradLevelM * 1000) / 1000,
          inflowM3PerS: Math.round(qIn * 100) / 100,
          outflowM3PerS: Math.round(qTradOut * 100) / 100,
          isSpilling: tradIsSpilling,
          cumulativeOverflowM3: Math.round(tradCumulativeOverflowM3),
        },
        smart: {
          waterLevelM: Math.round(smartLevelM * 1000) / 1000,
          measuredWaterLevelM: telemetry.wetlandLevel.value,
          inflowM3PerS: Math.round(qIn * 100) / 100,
          outflowM3PerS: Math.round(qSmartOutResult.dischargeRateM3PerS * 100) / 100,
          gateOpeningM: Math.round(telemetry.gateActuator.currentOpeningM * 100) / 100,
          targetGateOpeningM: stateDecision.targetGateOpeningM,
          gateIsMoving: telemetry.gateActuator.isMoving,
          phase: stateDecision.phase,
          decisionReason: stateDecision.reason,
          canDischarge: stateDecision.safetyEvaluation.canDischarge,
          activeLockout: stateDecision.safetyEvaluation.activeLockout,
          interlockReasonCode: stateDecision.safetyEvaluation.reasonCode,
          interlockDiagnostic: stateDecision.safetyEvaluation.diagnosticMessage,
          availableBufferM3: stateDecision.availableBufferVolumeM3,
          forecast6hRainMm: stateDecision.forecast6hRainfallMm,
          isSpilling: smartIsSpilling,
          cumulativeOverflowM3: Math.round(smartCumulativeOverflowM3),
        },
      });
    }

    clock.advance(dtSec);
  }

  const durationHours = Math.round(clock.getTimeSec() / 3600);
  const totalRainfallMm = scenario.hourlySeries
    .slice(0, durationHours)
    .reduce((sum, h) => sum + h.precipitationMmPerHr, 0);

  const phaseDistributionHours = Object.fromEntries(
    Object.entries(phaseDurationSec).map(([phase, sec]) => [
      phase as ControlPhase,
      Math.round((sec / 3600) * 10) / 10,
    ]),
  ) as Record<ControlPhase, number>;

  const avoidedOverflowM3 = Math.max(0, tradCumulativeOverflowM3 - smartCumulativeOverflowM3);
  const peakLevelReductionM = Math.max(0, tradPeakLevelM - smartPeakLevelM);
  const floodDurationReductionHours = Math.max(0, (tradSpilloverSec - smartSpilloverSec) / 3600);

  const summary: DualTrackComparisonSummary = {
    scenarioId: scenario.scenarioId,
    scenarioName: scenario.scenarioName,
    durationHours,
    totalRainfallMm: Math.round(totalRainfallMm * 10) / 10,
    traditional: {
      peakWaterLevelM: Math.round(tradPeakLevelM * 1000) / 1000,
      spilloverHours: Math.round((tradSpilloverSec / 3600) * 10) / 10,
      totalOverflowVolumeM3: Math.round(tradCumulativeOverflowM3),
    },
    smart: {
      peakWaterLevelM: Math.round(smartPeakLevelM * 1000) / 1000,
      spilloverHours: Math.round((smartSpilloverSec / 3600) * 10) / 10,
      totalOverflowVolumeM3: Math.round(smartCumulativeOverflowM3),
      gateOperationsCount,
      phaseDistribution: phaseDistributionHours,
    },
    mitigation: {
      avoidedOverflowVolumeM3: Math.round(avoidedOverflowM3),
      peakLevelReductionM: Math.round(peakLevelReductionM * 1000) / 1000,
      floodDurationReductionHours: Math.round(floodDurationReductionHours * 10) / 10,
      floodEliminated: tradSpilloverSec > 0 && smartSpilloverSec === 0,
    },
  };

  return { frames, summary };
}
