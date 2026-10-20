/**
 * @file downstreamInterlock.ts
 * @description Full-lifecycle downstream safety interlock for the BBR wetland
 * sluice gates.
 *
 * Safety contract (non-negotiable):
 *   A. PRE-DISCHARGE AUTHORISATION — before the gate is ever opened, the
 *      downstream level MUST be verified against all discharge criteria.
 *   B. IN-FLIGHT MONITORING — while discharging, the downstream level is
 *      re-evaluated every simulation tick. Any violation immediately trips an
 *      EMERGENCY_HALT, forcing the gate to 0 m and latching a lockout.
 *   C. HYSTERESIS RELEASE — a latched lockout is only released once the
 *      downstream level has receded clear of a hysteresis band, preventing
 *      gate hunting around threshold values.
 *
 * Fail-safe principle: any invalid telemetry results in a CLOSED gate.
 */

import {
  DOWNSTREAM_CRITICAL_LEVEL_M,
  DOWNSTREAM_RELEASE_MARGIN_M,
  GATE_MAX_OPENING_M,
  H_MIN_ECOLOGICAL_M,
  HEAD_RELEASE_MARGIN_M,
  MIN_SAFE_HEAD_DIFFERENCE_M,
} from '../constants/hydrologyConstants';
import type {
  DownstreamFaultCode,
  DownstreamSafetyCriteria,
  DownstreamSafetyEvaluation,
  InterlockEvent,
  InterlockMonitorResult,
  InterlockReasonCode,
  InterlockState,
  InterlockTelemetry,
} from '../types/hydrology';

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

export const DEFAULT_SAFETY_CRITERIA: Readonly<DownstreamSafetyCriteria> = Object.freeze({
  minHeadDifferenceM: MIN_SAFE_HEAD_DIFFERENCE_M,
  maxDownstreamLevelM: DOWNSTREAM_CRITICAL_LEVEL_M,
  minWetlandLevelM: H_MIN_ECOLOGICAL_M,
  downstreamReleaseMarginM: DOWNSTREAM_RELEASE_MARGIN_M,
  headReleaseMarginM: HEAD_RELEASE_MARGIN_M,
  maxGateOpeningM: GATE_MAX_OPENING_M,
});

/** Factory for a fresh, un-tripped interlock state. */
export function createInitialInterlockState(): InterlockState {
  return {
    isLockedOut: false,
    tripReason: null,
    lockedSinceSec: null,
    tripCount: 0,
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Downstream-originated faults latch a lockout; ecological limits do not. */
const LATCHING_FAULTS: ReadonlySet<InterlockReasonCode> = new Set<InterlockReasonCode>([
  'INVALID_TELEMETRY',
  'TIDAL_BACKFLOW_RISK',
  'DOWNSTREAM_CAPACITY_EXCEEDED',
]);

const DIAGNOSTIC_MESSAGES: Readonly<Record<InterlockReasonCode, string>> = Object.freeze({
  CLEAR: 'All downstream safety criteria satisfied. Discharge authorised.',
  INVALID_TELEMETRY: 'Sensor telemetry invalid or unavailable. Fail-safe: gate forced CLOSED.',
  ECOLOGICAL_LIMIT_REACHED: 'Wetland at or below ecological minimum level. Discharge halted to protect biodiversity.',
  TIDAL_BACKFLOW_RISK: 'Insufficient positive head over downstream level. Backflow / tidal intrusion risk — gate CLOSED.',
  DOWNSTREAM_CAPACITY_EXCEEDED: 'Downstream Klang channel at or above critical level. Discharge prohibited to avoid compounding downstream flooding.',
  LOCKOUT_HYSTERESIS_HOLD: 'Emergency lockout latched. Awaiting downstream recession beyond hysteresis band before release.',
  INTERLOCK_RELEASED: 'Downstream conditions recovered beyond hysteresis band. Lockout released — discharge may resume.',
});

function isValidTelemetry(telemetry: InterlockTelemetry): boolean {
  const { wetlandLevelM, downstreamLevelM, requestedGateOpeningM, simTimeSec } = telemetry;
  return (
    Number.isFinite(wetlandLevelM) &&
    Number.isFinite(downstreamLevelM) &&
    Number.isFinite(requestedGateOpeningM) &&
    Number.isFinite(simTimeSec) &&
    wetlandLevelM >= 0
  );
}

/**
 * Detect every safety criterion currently violated, ordered by severity:
 * invalid telemetry → backflow → downstream capacity → ecological floor.
 */
function detectViolations(
  telemetry: InterlockTelemetry,
  criteria: DownstreamSafetyCriteria,
): InterlockReasonCode[] {
  if (!isValidTelemetry(telemetry)) {
    return ['INVALID_TELEMETRY'];
  }

  const { wetlandLevelM, downstreamLevelM } = telemetry;
  const violations: InterlockReasonCode[] = [];

  if (wetlandLevelM - downstreamLevelM < criteria.minHeadDifferenceM) {
    violations.push('TIDAL_BACKFLOW_RISK');
  }
  if (downstreamLevelM >= criteria.maxDownstreamLevelM) {
    violations.push('DOWNSTREAM_CAPACITY_EXCEEDED');
  }
  if (wetlandLevelM <= criteria.minWetlandLevelM) {
    violations.push('ECOLOGICAL_LIMIT_REACHED');
  }

  return violations;
}

/** Stricter release thresholds applied while a lockout is latched. */
function isReleaseSatisfied(
  telemetry: InterlockTelemetry,
  criteria: DownstreamSafetyCriteria,
): boolean {
  if (!isValidTelemetry(telemetry)) {
    return false;
  }
  const { wetlandLevelM, downstreamLevelM } = telemetry;
  const headDifferenceM = wetlandLevelM - downstreamLevelM;

  return (
    downstreamLevelM <= criteria.maxDownstreamLevelM - criteria.downstreamReleaseMarginM &&
    headDifferenceM >= criteria.minHeadDifferenceM + criteria.headReleaseMarginM
  );
}

function clampGateOpening(requestedM: number, criteria: DownstreamSafetyCriteria): number {
  if (!Number.isFinite(requestedM)) {
    return 0;
  }
  return Math.min(Math.max(requestedM, 0), criteria.maxGateOpeningM);
}

function buildBlockedEvaluation(
  reasonCode: InterlockReasonCode,
  violations: InterlockReasonCode[],
  activeLockout: boolean,
): DownstreamSafetyEvaluation {
  return {
    canDischarge: false,
    activeLockout,
    reasonCode,
    violations,
    diagnosticMessage: DIAGNOSTIC_MESSAGES[reasonCode],
    recommendedGateOpeningM: 0,
  };
}

function buildPermittedEvaluation(
  reasonCode: Extract<InterlockReasonCode, 'CLEAR' | 'INTERLOCK_RELEASED'>,
  telemetry: InterlockTelemetry,
  criteria: DownstreamSafetyCriteria,
): DownstreamSafetyEvaluation {
  return {
    canDischarge: true,
    activeLockout: false,
    reasonCode,
    violations: [],
    diagnosticMessage: DIAGNOSTIC_MESSAGES[reasonCode],
    recommendedGateOpeningM: clampGateOpening(telemetry.requestedGateOpeningM, criteria),
  };
}

function buildEvent(
  type: InterlockEvent['type'],
  reasonCode: InterlockReasonCode,
  telemetry: InterlockTelemetry,
): InterlockEvent {
  return {
    type,
    reasonCode,
    simTimeSec: telemetry.simTimeSec,
    wetlandLevelM: telemetry.wetlandLevelM,
    downstreamLevelM: telemetry.downstreamLevelM,
    message: `[${type}] ${DIAGNOSTIC_MESSAGES[reasonCode]}`,
  };
}

// ---------------------------------------------------------------------------
// A. Pre-discharge authorisation
// ---------------------------------------------------------------------------

/**
 * Evaluate whether the sluice gate may be OPENED.
 * MUST be called before any CLOSED → OPEN transition.
 *
 * When an `interlockState` is supplied and a lockout is latched, the stricter
 * hysteresis release thresholds apply, so the controller cannot bypass a
 * lockout simply by re-requesting an opening.
 */
export function evaluatePreDischargeSafety(
  telemetry: InterlockTelemetry,
  criteria: DownstreamSafetyCriteria = DEFAULT_SAFETY_CRITERIA,
  interlockState?: InterlockState,
): DownstreamSafetyEvaluation {
  const violations = detectViolations(telemetry, criteria);
  const primaryViolation = violations[0];

  if (primaryViolation !== undefined) {
    const latched = interlockState?.isLockedOut ?? false;
    return buildBlockedEvaluation(primaryViolation, violations, latched);
  }

  if (interlockState?.isLockedOut && !isReleaseSatisfied(telemetry, criteria)) {
    return buildBlockedEvaluation('LOCKOUT_HYSTERESIS_HOLD', [], true);
  }

  return buildPermittedEvaluation('CLEAR', telemetry, criteria);
}

// ---------------------------------------------------------------------------
// B + C. In-flight monitoring with emergency halt and hysteresis release
// ---------------------------------------------------------------------------

/**
 * Continuous downstream monitor. MUST be called on every simulation tick
 * while the gate is open (and is safe to call while closed).
 *
 * - Not locked + downstream fault  → EMERGENCY_HALT, gate 0, latch lockout.
 * - Not locked + ecological floor  → gate 0, no latch (non-downstream stop).
 * - Locked + release not satisfied → hold gate 0.
 * - Locked + release satisfied     → INTERLOCK_RELEASED, gate permitted.
 */
export function monitorActiveDischarge(
  telemetry: InterlockTelemetry,
  state: InterlockState,
  criteria: DownstreamSafetyCriteria = DEFAULT_SAFETY_CRITERIA,
): InterlockMonitorResult {
  const violations = detectViolations(telemetry, criteria);
  const latchingFault = violations.find((code) => LATCHING_FAULTS.has(code)) as
    | DownstreamFaultCode
    | undefined;

  // --- Latched lockout path ------------------------------------------------
  if (state.isLockedOut) {
    if (latchingFault === undefined && isReleaseSatisfied(telemetry, criteria)) {
      const releasedState: InterlockState = {
        ...state,
        isLockedOut: false,
        tripReason: null,
        lockedSinceSec: null,
      };

      // Release the latch, but still honour a non-latching ecological stop.
      const evaluation = violations.includes('ECOLOGICAL_LIMIT_REACHED')
        ? buildBlockedEvaluation('ECOLOGICAL_LIMIT_REACHED', violations, false)
        : buildPermittedEvaluation('INTERLOCK_RELEASED', telemetry, criteria);

      return {
        evaluation,
        nextState: releasedState,
        event: buildEvent('INTERLOCK_RELEASED', 'INTERLOCK_RELEASED', telemetry),
      };
    }

    const holdReason: InterlockReasonCode = latchingFault ?? 'LOCKOUT_HYSTERESIS_HOLD';
    return {
      evaluation: buildBlockedEvaluation(holdReason, violations, true),
      nextState: state,
      event: null,
    };
  }

  // --- Un-latched path -----------------------------------------------------
  if (latchingFault !== undefined) {
    const trippedState: InterlockState = {
      isLockedOut: true,
      tripReason: latchingFault,
      lockedSinceSec: Number.isFinite(telemetry.simTimeSec) ? telemetry.simTimeSec : null,
      tripCount: state.tripCount + 1,
    };
    return {
      evaluation: buildBlockedEvaluation(latchingFault, violations, true),
      nextState: trippedState,
      event: buildEvent('EMERGENCY_HALT', latchingFault, telemetry),
    };
  }

  if (violations.includes('ECOLOGICAL_LIMIT_REACHED')) {
    return {
      evaluation: buildBlockedEvaluation('ECOLOGICAL_LIMIT_REACHED', violations, false),
      nextState: state,
      event: null,
    };
  }

  return {
    evaluation: buildPermittedEvaluation('CLEAR', telemetry, criteria),
    nextState: state,
    event: null,
  };
}
