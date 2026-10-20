/**
 * @file stateMachine.ts
 * @description 3-Phase Autonomous Control State Machine for the BBR 125-Acre Wetland.
 *
 * Implements four primary operational phases + emergency safety lockout:
 *   - Phase 0: NORMAL           (H ≈ 2.0 m, rain < 10 mm / 6h, gates closed)
 *   - Phase 1: PRE_DISCHARGE    (Forecast rain > 30 mm / 6h or Vin > Vavail, drain to 1.0 m)
 *   - Phase 2: PEAK_SHAVING     (Active storm i >= 20 mm/h or downstream high, gates 0%)
 *   - Phase 3: RECOVERY         (Storm ended i < 2 mm/h, H > 2.0 m, throttled discharge)
 *   - Guard:   INTERLOCK_SUSPENDED (Downstream criteria violated, instantaneous emergency closure)
 */

import {
  DEFAULT_CATCHMENT_AREA_HA,
  DOWNSTREAM_CRITICAL_LEVEL_M,
  GATE_MAX_OPENING_M,
  H_MIN_ECOLOGICAL_M,
  H_NORMAL_OPERATING_M,
} from '../constants/hydrologyConstants';
import type { HourlyWeatherPoint } from '../services/weather/weatherTypes';
import type {
  ControlPhase,
  DownstreamSafetyCriteria,
  DownstreamSafetyEvaluation,
  InterlockState,
  InterlockTelemetry,
} from '../types/hydrology';
import {
  createInitialInterlockState,
  DEFAULT_SAFETY_CRITERIA,
  evaluatePreDischargeSafety,
  monitorActiveDischarge,
} from './downstreamInterlock';
import {
  calculateAvailableStorage,
  calculateEffectiveRunoffCoefficient,
  calculateStormInflowVolume,
} from './hydrologyEngine';

// ---------------------------------------------------------------------------
// Threshold Constants
// ---------------------------------------------------------------------------

/** Lookahead window for proactive pre-discharge decision (hours). */
export const PRE_DISCHARGE_LOOKAHEAD_HOURS = 6;

/** 6-hour cumulative rainfall threshold to trigger pre-discharge (mm). */
export const PRE_DISCHARGE_RAIN_THRESHOLD_MM = 30.0;

/** Active rainfall threshold that triggers peak-shaving detention (mm/h). */
export const PEAK_SHAVING_RAIN_INTENSITY_MM_PER_HR = 20.0;

/** Rainfall intensity threshold indicating storm cessation for recovery (mm/h). */
export const RECOVERY_RAIN_CESSATION_MM_PER_HR = 2.0;

/** Normal baseline water level tolerance (metres). */
export const WATER_LEVEL_TOLERANCE_M = 0.05;

// ---------------------------------------------------------------------------
// State Machine I/O Types
// ---------------------------------------------------------------------------

export interface StateMachineInput {
  /** Current simulation clock timestamp (seconds). */
  simTimeSec: number;
  /** Current measured wetland water level H_wetland (m). */
  wetlandLevelM: number;
  /** Current measured downstream river / tidal level H_downstream (m). */
  downstreamLevelM: number;
  /** Current instantaneous rainfall intensity (mm/h). */
  currentRainfallMmPerHr: number;
  /** Current soil saturation index S ∈ [0, 1]. */
  soilSaturation: number;
  /** Current actual physical gate opening (m). */
  currentGateOpeningM?: number;
  /** Future weather forecast series (starting at current simulation time). */
  forecastSeries: readonly HourlyWeatherPoint[];
}

export interface StateMachineDecision {
  /** Current operating control phase. */
  phase: ControlPhase;
  /** Target gate opening commanded to actuator (m). */
  targetGateOpeningM: number;
  /** Diagnostic human-readable rationale for current phase & command. */
  reason: string;
  /** Downstream safety interlock evaluation result. */
  safetyEvaluation: DownstreamSafetyEvaluation;
  /** Cumulative forecasted rainfall over next 6 hours (mm). */
  forecast6hRainfallMm: number;
  /** Expected runoff volume over next 6 hours (m³). */
  forecast6hInflowVolumeM3: number;
  /** Available buffer volume before H_max spillover (m³). */
  availableBufferVolumeM3: number;
  /** Whether the state changed on this simulation step. */
  phaseChanged: boolean;
}

// ---------------------------------------------------------------------------
// State Machine Class
// ---------------------------------------------------------------------------

export class SmartWetlandStateMachine {
  private currentPhase: ControlPhase;
  private interlockState: InterlockState;
  private safetyCriteria: DownstreamSafetyCriteria;

  constructor(
    initialPhase: ControlPhase = 'NORMAL',
    safetyCriteria: DownstreamSafetyCriteria = DEFAULT_SAFETY_CRITERIA,
  ) {
    this.currentPhase = initialPhase;
    this.interlockState = createInitialInterlockState();
    this.safetyCriteria = safetyCriteria;
  }

  public getPhase(): ControlPhase {
    return this.currentPhase;
  }

  public getInterlockState(): Readonly<InterlockState> {
    return this.interlockState;
  }

  /**
   * Main cycle evaluation method called every simulation step.
   */
  public evaluate(input: StateMachineInput): StateMachineDecision {
    const {
      simTimeSec,
      wetlandLevelM,
      downstreamLevelM,
      currentRainfallMmPerHr,
      soilSaturation,
      forecastSeries,
    } = input;

    // 1. Analyze 6-hour forecast window
    const lookaheadHours = Math.min(forecastSeries.length, PRE_DISCHARGE_LOOKAHEAD_HOURS);
    let forecast6hRainfallMm = 0;
    const hourlyRainList: number[] = [];

    for (let i = 0; i < lookaheadHours; i += 1) {
      const rain = forecastSeries[i]?.precipitationMmPerHr ?? 0;
      forecast6hRainfallMm += rain;
      hourlyRainList.push(rain);
    }

    const cEff = calculateEffectiveRunoffCoefficient(soilSaturation);
    const forecast6hInflowVolumeM3 = calculateStormInflowVolume({
      hourlyRainfallMmPerHr: hourlyRainList,
      runoffCoefficient: cEff,
      catchmentAreaHa: DEFAULT_CATCHMENT_AREA_HA,
    });

    const availableBufferVolumeM3 = calculateAvailableStorage({
      currentLevelM: wetlandLevelM,
    });

    // 2. Perform Downstream Interlock Safety Monitor
    const telemetry: InterlockTelemetry = {
      wetlandLevelM,
      downstreamLevelM,
      requestedGateOpeningM: GATE_MAX_OPENING_M,
      simTimeSec,
    };

    const monitorResult = monitorActiveDischarge(
      telemetry,
      this.interlockState,
      this.safetyCriteria,
    );
    this.interlockState = monitorResult.nextState;

    const preCheckResult = evaluatePreDischargeSafety(
      telemetry,
      this.safetyCriteria,
      this.interlockState,
    );

    const prevPhase = this.currentPhase;
    let nextPhase: ControlPhase = this.currentPhase;
    let targetGateOpeningM = 0;
    let decisionReason = '';

    // -----------------------------------------------------------------------
    // Core Phase Selection Logic
    // -----------------------------------------------------------------------

    // A. PHASE 2: PEAK-SHAVING (Active heavy storm in progress)
    // When active rain is heavy (>= 20 mm/h), the wetland's operational objective
    // is detention (gate = 0 m).
    if (currentRainfallMmPerHr >= PEAK_SHAVING_RAIN_INTENSITY_MM_PER_HR) {
      nextPhase = 'PEAK_SHAVING';
      targetGateOpeningM = 0;
      decisionReason = `Active peak storm (i = ${currentRainfallMmPerHr.toFixed(1)} mm/h). Trapping runoff inside wetland.`;
    }
    // B. EMERGENCY GUARD: Downstream Surge / Backflow Lockout during intended discharge
    else if (this.interlockState.isLockedOut || !monitorResult.evaluation.canDischarge) {
      nextPhase = 'INTERLOCK_SUSPENDED';
      targetGateOpeningM = 0;
      decisionReason = `Downstream interlock active: ${monitorResult.evaluation.diagnosticMessage}`;
    }
    // C. Downstream capacity exceeded while idle
    else if (downstreamLevelM >= DOWNSTREAM_CRITICAL_LEVEL_M) {
      nextPhase = 'INTERLOCK_SUSPENDED';
      targetGateOpeningM = 0;
      decisionReason = `Downstream Klang river high (${downstreamLevelM.toFixed(2)} m >= ${DOWNSTREAM_CRITICAL_LEVEL_M} m). Gates closed.`;
    }
    // D. PHASE 1: PRE-DISCHARGE (Proactive draw down before storm arrival)
    else if (
      (forecast6hRainfallMm >= PRE_DISCHARGE_RAIN_THRESHOLD_MM ||
        forecast6hInflowVolumeM3 > availableBufferVolumeM3) &&
      wetlandLevelM > H_MIN_ECOLOGICAL_M + WATER_LEVEL_TOLERANCE_M
    ) {
      if (preCheckResult.canDischarge) {
        nextPhase = 'PRE_DISCHARGE';
        targetGateOpeningM = GATE_MAX_OPENING_M;
        decisionReason =
          `Pre-storm forecast: 6h rain = ${forecast6hRainfallMm.toFixed(1)} mm, ` +
          `expected inflow ${Math.round(forecast6hInflowVolumeM3).toLocaleString()} m³ exceeds available buffer. ` +
          `Proactively opening gates to lower water level to 1.0 m.`;
      } else {
        nextPhase = 'INTERLOCK_SUSPENDED';
        targetGateOpeningM = 0;
        decisionReason = `Pre-discharge required by forecast but blocked by downstream safety: ${preCheckResult.diagnosticMessage}`;
      }
    }
    // E. PRE-DISCHARGE COMPLETED: Level drawn down to 1.0m, holding for storm
    else if (
      (forecast6hRainfallMm >= PRE_DISCHARGE_RAIN_THRESHOLD_MM ||
        forecast6hInflowVolumeM3 > availableBufferVolumeM3) &&
      wetlandLevelM <= H_MIN_ECOLOGICAL_M + WATER_LEVEL_TOLERANCE_M
    ) {
      nextPhase = 'PRE_DISCHARGE';
      targetGateOpeningM = 0; // Hold at 1.0m ecological floor
      decisionReason = `Pre-discharge draw-down to ${H_MIN_ECOLOGICAL_M.toFixed(1)} m achieved (+505,857 m³ buffer ready). Holding closed for storm.`;
    }
    // F. PHASE 3: RECOVERY (Post-storm safe drawdown)
    else if (
      currentRainfallMmPerHr < RECOVERY_RAIN_CESSATION_MM_PER_HR &&
      wetlandLevelM > H_NORMAL_OPERATING_M + WATER_LEVEL_TOLERANCE_M
    ) {
      if (preCheckResult.canDischarge) {
        nextPhase = 'RECOVERY';
        targetGateOpeningM = 1.2;
        decisionReason =
          `Storm receded (i = ${currentRainfallMmPerHr.toFixed(1)} mm/h). ` +
          `Safely discharging detained volume from ${wetlandLevelM.toFixed(2)} m toward normal ${H_NORMAL_OPERATING_M.toFixed(1)} m.`;
      } else {
        nextPhase = 'INTERLOCK_SUSPENDED';
        targetGateOpeningM = 0;
        decisionReason = `Recovery drainage required but blocked by downstream level: ${preCheckResult.diagnosticMessage}`;
      }
    }
    // G. PHASE 0: NORMAL MODE
    else {
      nextPhase = 'NORMAL';
      targetGateOpeningM = 0;
      decisionReason =
        `Normal operating state. Baseline water level ${wetlandLevelM.toFixed(2)} m maintained for ecology and recreation.`;
    }

    this.currentPhase = nextPhase;

    return {
      phase: this.currentPhase,
      targetGateOpeningM,
      reason: decisionReason,
      safetyEvaluation: preCheckResult.canDischarge ? monitorResult.evaluation : preCheckResult,
      forecast6hRainfallMm: Math.round(forecast6hRainfallMm * 10) / 10,
      forecast6hInflowVolumeM3: Math.round(forecast6hInflowVolumeM3),
      availableBufferVolumeM3: Math.round(availableBufferVolumeM3),
      phaseChanged: nextPhase !== prevPhase,
    };
  }
}
