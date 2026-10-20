/**
 * @file hydrology.ts
 * @description Strongly-typed domain model for the BBR wetland hydrology
 * engine, downstream safety interlock, telemetry and control phases.
 */

// ---------------------------------------------------------------------------
// Hydrology engine I/O
// ---------------------------------------------------------------------------

export interface RunoffInflowInput {
  /** Rainfall intensity i (mm/h). */
  rainfallIntensityMmPerHr: number;
  /** Effective runoff coefficient C_eff (dimensionless, 0–1). */
  runoffCoefficient: number;
  /** Catchment area A_cat (hectares). */
  catchmentAreaHa: number;
}

export interface StormVolumeInput {
  /** Hourly rainfall intensity series (mm/h), one entry per forecast hour. */
  hourlyRainfallMmPerHr: readonly number[];
  /** Effective runoff coefficient C_eff applied to every hour. */
  runoffCoefficient: number;
  /** Catchment area A_cat (hectares). */
  catchmentAreaHa: number;
}

export interface AvailableStorageInput {
  /** Current wetland water level H_current (m). */
  currentLevelM: number;
  /** Critical spillover level H_max (m). Defaults to H_MAX_CRITICAL_M. */
  criticalLevelM?: number;
  /** Wetland surface area A_wetland (m²). Defaults to WETLAND_AREA_M2. */
  wetlandAreaM2?: number;
}

export interface GateDischargeInput {
  /** Wetland water level H_current (m). */
  wetlandLevelM: number;
  /** Downstream river / tidal level H_downstream (m). */
  downstreamLevelM: number;
  /** Gate opening height O_gate (m), clamped to [0, O_max]. */
  gateOpeningM: number;
  /** Discharge coefficient C_d. Defaults to DISCHARGE_COEFFICIENT. */
  dischargeCoefficient?: number;
  /** Total gate width W (m). Defaults to GATE_TOTAL_WIDTH_M. */
  gateWidthM?: number;
}

export interface GateDischargeResult {
  /** Outflow rate Q_out (m³/s). Zero when tidal lock is active. */
  dischargeRateM3PerS: number;
  /** Hydraulic head H_current − H_downstream (m). May be negative. */
  headDifferenceM: number;
  /** True when H_current ≤ H_downstream (gravity discharge impossible). */
  isTidalLocked: boolean;
  /** Effective gate opening actually applied after clamping (m). */
  appliedGateOpeningM: number;
}

export interface WaterBalanceInput {
  /** Current wetland water level H_current (m). */
  currentLevelM: number;
  /** Inflow rate Q_in (m³/s). */
  inflowM3PerS: number;
  /** Outflow rate Q_out (m³/s). */
  outflowM3PerS: number;
  /** Time step Δt (s). */
  timeStepSec: number;
  /** Wetland surface area A_wetland (m²). Defaults to WETLAND_AREA_M2. */
  wetlandAreaM2?: number;
}

export interface WaterBalanceResult {
  /** Next-step wetland level H_next (m), floored at 0. */
  nextLevelM: number;
  /** Net volume change ΔV (m³) over the step. */
  deltaVolumeM3: number;
  /** Level change ΔH (m) actually applied. */
  deltaLevelM: number;
  /** True when H_next exceeds the critical spillover level H_max. */
  exceedsCriticalLevel: boolean;
}

// ---------------------------------------------------------------------------
// Downstream safety interlock
// ---------------------------------------------------------------------------

/** Diagnostic reason codes emitted by the downstream safety interlock. */
export type InterlockReasonCode =
  /** All safety criteria satisfied; discharge permitted. */
  | 'CLEAR'
  /** Telemetry is missing, non-finite or physically impossible (fail-safe). */
  | 'INVALID_TELEMETRY'
  /** Wetland at/below ecological minimum H_min. */
  | 'ECOLOGICAL_LIMIT_REACHED'
  /** Head difference below ΔH_safe — backflow / tidal intrusion risk. */
  | 'TIDAL_BACKFLOW_RISK'
  /** Downstream channel at/above critical capacity level. */
  | 'DOWNSTREAM_CAPACITY_EXCEEDED'
  /** Latched lockout held: conditions not yet clear of hysteresis band. */
  | 'LOCKOUT_HYSTERESIS_HOLD'
  /** Latched lockout released this cycle; discharge may resume. */
  | 'INTERLOCK_RELEASED';

/** Downstream-originated faults that cause a latched lockout. */
export type DownstreamFaultCode = Extract<
  InterlockReasonCode,
  'TIDAL_BACKFLOW_RISK' | 'DOWNSTREAM_CAPACITY_EXCEEDED' | 'INVALID_TELEMETRY'
>;

export interface DownstreamSafetyCriteria {
  /** ΔH_safe — minimum wetland-over-downstream head (m). */
  minHeadDifferenceM: number;
  /** H_downstream_critical — downstream capacity limit (m). */
  maxDownstreamLevelM: number;
  /** H_min — wetland ecological floor (m). */
  minWetlandLevelM: number;
  /** Recession below H_downstream_critical required to release lockout (m). */
  downstreamReleaseMarginM: number;
  /** Extra head above ΔH_safe required to release lockout (m). */
  headReleaseMarginM: number;
  /** Maximum mechanical gate opening (m). */
  maxGateOpeningM: number;
}

export interface InterlockTelemetry {
  /** Wetland ultrasonic level sensor reading H_wetland (m). */
  wetlandLevelM: number;
  /** Downstream tidal gauge reading H_downstream (m). */
  downstreamLevelM: number;
  /** Gate opening requested by the controller (m). */
  requestedGateOpeningM: number;
  /** Simulation clock (s) — used for event timestamping. */
  simTimeSec: number;
}

/** Latched interlock state carried between monitoring cycles. */
export interface InterlockState {
  /** True while an EMERGENCY_HALT lockout is latched. */
  isLockedOut: boolean;
  /** Fault that originally tripped the current lockout. */
  tripReason: DownstreamFaultCode | null;
  /** Simulation time (s) at which the lockout was latched. */
  lockedSinceSec: number | null;
  /** Cumulative number of emergency trips since start. */
  tripCount: number;
}

export interface DownstreamSafetyEvaluation {
  /** Whether opening / continuing discharge is permitted. */
  canDischarge: boolean;
  /** Whether a latched emergency lockout is active. */
  activeLockout: boolean;
  /** Primary reason code for this evaluation. */
  reasonCode: InterlockReasonCode;
  /** All criteria currently violated (empty when CLEAR). */
  violations: InterlockReasonCode[];
  /** Human-readable diagnostic message for operators / audit log. */
  diagnosticMessage: string;
  /** Safe gate opening the actuator must apply (m). 0 when blocked. */
  recommendedGateOpeningM: number;
}

export type InterlockEventType = 'EMERGENCY_HALT' | 'INTERLOCK_RELEASED';

export interface InterlockEvent {
  type: InterlockEventType;
  reasonCode: InterlockReasonCode;
  simTimeSec: number;
  wetlandLevelM: number;
  downstreamLevelM: number;
  message: string;
}

export interface InterlockMonitorResult {
  evaluation: DownstreamSafetyEvaluation;
  nextState: InterlockState;
  /** Emitted only on state transitions (trip or release). */
  event: InterlockEvent | null;
}

// ---------------------------------------------------------------------------
// Control phases (consumed by Task 3 state machine)
// ---------------------------------------------------------------------------

export type ControlPhase =
  | 'NORMAL'
  | 'PRE_DISCHARGE'
  | 'PEAK_SHAVING'
  | 'RECOVERY'
  | 'INTERLOCK_SUSPENDED';
