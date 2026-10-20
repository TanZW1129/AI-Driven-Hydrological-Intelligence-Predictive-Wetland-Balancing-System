/**
 * @file verify-task1.ts
 * @description Checkpoint 1 automated verification suite for the BBR wetland
 * hydrology engine and downstream safety interlock.
 *
 * Run: npm run verify:task1
 * Exits with code 1 if any assertion fails.
 */

import {
  GATE_MAX_OPENING_M,
  H_MAX_CRITICAL_M,
  WETLAND_AREA_M2,
} from '../src/constants/hydrologyConstants';
import {
  createInitialInterlockState,
  evaluatePreDischargeSafety,
  monitorActiveDischarge,
} from '../src/core/downstreamInterlock';
import {
  calculateAvailableStorage,
  calculateEffectiveRunoffCoefficient,
  calculateGateDischarge,
  calculateRunoffInflow,
  calculateStormInflowVolume,
  stepWaterBalance,
} from '../src/core/hydrologyEngine';
import type { InterlockState, InterlockTelemetry } from '../src/types/hydrology';

// ---------------------------------------------------------------------------
// Minimal assertion harness
// ---------------------------------------------------------------------------

interface CheckResult {
  section: string;
  name: string;
  passed: boolean;
  detail: string;
}

const results: CheckResult[] = [];
let currentSection = '';

function section(title: string): void {
  currentSection = title;
  console.log(`\n\x1b[1m\x1b[36m▶ ${title}\x1b[0m`);
}

function record(name: string, passed: boolean, detail: string): void {
  results.push({ section: currentSection, name, passed, detail });
  const badge = passed ? '\x1b[32m✔ PASS\x1b[0m' : '\x1b[31m✘ FAIL\x1b[0m';
  console.log(`  ${badge}  ${name}\n         ${detail}`);
}

function expectClose(name: string, actual: number, expected: number, absTolerance: number, unit: string): void {
  const error = Math.abs(actual - expected);
  record(
    name,
    error < absTolerance,
    `actual=${actual.toFixed(4)} ${unit} | expected=${expected.toFixed(4)} ${unit} | |Δ|=${error.toExponential(2)} (tol < ${absTolerance})`,
  );
}

function expectRelative(name: string, actual: number, expected: number, relTolerance: number, unit: string): void {
  const relError = Math.abs(actual - expected) / Math.abs(expected);
  record(
    name,
    relError < relTolerance,
    `actual=${actual.toFixed(4)} ${unit} | expected≈${expected.toFixed(4)} ${unit} | rel.err=${(relError * 100).toFixed(4)}% (tol < ${relTolerance * 100}%)`,
  );
}

function expectEqual<T>(name: string, actual: T, expected: T): void {
  record(name, actual === expected, `actual=${String(actual)} | expected=${String(expected)}`);
}

function expectThrows(name: string, fn: () => unknown): void {
  try {
    fn();
    record(name, false, 'expected RangeError, but no error was thrown');
  } catch (error) {
    record(name, error instanceof RangeError, `threw ${(error as Error).name}: ${(error as Error).message}`);
  }
}

// ---------------------------------------------------------------------------
// Case 1 — Peak surface runoff inflow Q_in
// ---------------------------------------------------------------------------

section('Case 1 · Peak Surface Runoff Inflow (Rational Method)');

const qIn = calculateRunoffInflow({
  rainfallIntensityMmPerHr: 50,
  runoffCoefficient: 0.7,
  catchmentAreaHa: 500,
});
expectClose('Q_in @ i=50 mm/h, C=0.70, A=500 ha', qIn, 48.611, 0.01, 'm³/s');

expectClose('C_eff @ S=0 (dry soil)', calculateEffectiveRunoffCoefficient(0), 0.65, 1e-9, '');
expectClose('C_eff @ S=1 (saturated soil)', calculateEffectiveRunoffCoefficient(1), 0.755, 1e-9, '');
expectThrows('C_eff rejects S=1.5 (out of range)', () => calculateEffectiveRunoffCoefficient(1.5));
expectThrows('Q_in rejects negative rainfall', () =>
  calculateRunoffInflow({ rainfallIntensityMmPerHr: -5, runoffCoefficient: 0.7, catchmentAreaHa: 500 }),
);

const vIn = calculateStormInflowVolume({
  hourlyRainfallMmPerHr: [50, 50, 50],
  runoffCoefficient: 0.7,
  catchmentAreaHa: 500,
});
expectClose('V_in for 3h @ 50 mm/h', vIn, qIn * 3600 * 3, 1e-6, 'm³');

// ---------------------------------------------------------------------------
// Case 2 — Available wetland buffer volume V_avail
// ---------------------------------------------------------------------------

section('Case 2 · Available Wetland Buffer Volume');

const vAvail = calculateAvailableStorage({ currentLevelM: 2.0 });
expectClose('V_avail @ H=2.0 m, H_max=3.5 m', vAvail, 758_785.5, 1.0, 'm³');
expectClose('A_wetland (125 acres)', WETLAND_AREA_M2, 505_857, 1.0, 'm²');
expectEqual('V_avail floored at 0 when H > H_max', calculateAvailableStorage({ currentLevelM: 3.8 }), 0);

// ---------------------------------------------------------------------------
// Case 3 — Sluice gate orifice discharge Q_out
// ---------------------------------------------------------------------------

section('Case 3 · Sluice Gate Orifice Discharge & Tidal Lock');

const discharge = calculateGateDischarge({
  wetlandLevelM: 2.0,
  downstreamLevelM: 1.2,
  gateOpeningM: GATE_MAX_OPENING_M,
});
const expectedQOut = 0.62 * 10 * 2 * Math.sqrt(2 * 9.81 * 0.8);
expectRelative('Q_out @ H=2.0, H_down=1.2, O=2.0 m', discharge.dischargeRateM3PerS, 49.12, 0.01, 'm³/s');
expectClose('Q_out matches closed-form formula', discharge.dischargeRateM3PerS, expectedQOut, 1e-9, 'm³/s');
expectEqual('Tidal lock inactive (H > H_down)', discharge.isTidalLocked, false);

const locked = calculateGateDischarge({ wetlandLevelM: 2.0, downstreamLevelM: 2.8, gateOpeningM: 2.0 });
expectEqual('Tidal lock active (H_down=2.8 > H=2.0)', locked.isTidalLocked, true);
expectEqual('Q_out forced to 0 under tidal lock', locked.dischargeRateM3PerS, 0);
expectEqual('Gate forced CLOSED under tidal lock', locked.appliedGateOpeningM, 0);

const overOpen = calculateGateDischarge({ wetlandLevelM: 2.0, downstreamLevelM: 1.2, gateOpeningM: 5 });
expectEqual('Gate opening clamped to O_max=2.0 m', overOpen.appliedGateOpeningM, GATE_MAX_OPENING_M);

// ---------------------------------------------------------------------------
// Case 4 — Pre-discharge authorisation
// ---------------------------------------------------------------------------

section('Case 4 · Pre-Discharge Safety Authorisation');

const baseTelemetry: InterlockTelemetry = {
  wetlandLevelM: 2.0,
  downstreamLevelM: 1.2,
  requestedGateOpeningM: 2.0,
  simTimeSec: 0,
};

const preOk = evaluatePreDischargeSafety(baseTelemetry);
expectEqual('Normal downstream (1.2 m) → discharge authorised', preOk.canDischarge, true);
expectEqual('Authorised opening = requested 2.0 m', preOk.recommendedGateOpeningM, 2.0);

// Wetland raised to 3.0 m so that only the downstream-capacity criterion fails.
const preHighDown = evaluatePreDischargeSafety({ ...baseTelemetry, wetlandLevelM: 3.0, downstreamLevelM: 2.6 });
expectEqual('Downstream 2.6 m ≥ 2.5 m → discharge REFUSED', preHighDown.canDischarge, false);
expectEqual('Reason = DOWNSTREAM_CAPACITY_EXCEEDED', preHighDown.reasonCode, 'DOWNSTREAM_CAPACITY_EXCEEDED');
expectEqual('Gate held at 0 m', preHighDown.recommendedGateOpeningM, 0);

const preBackflow = evaluatePreDischargeSafety({ ...baseTelemetry, wetlandLevelM: 2.0, downstreamLevelM: 1.95 });
expectEqual('Head 0.05 m < ΔH_safe 0.10 m → REFUSED', preBackflow.canDischarge, false);
expectEqual('Reason = TIDAL_BACKFLOW_RISK', preBackflow.reasonCode, 'TIDAL_BACKFLOW_RISK');

const preEco = evaluatePreDischargeSafety({ ...baseTelemetry, wetlandLevelM: 1.0, downstreamLevelM: 0.5 });
expectEqual('Wetland at H_min 1.0 m → REFUSED', preEco.canDischarge, false);
expectEqual('Reason = ECOLOGICAL_LIMIT_REACHED', preEco.reasonCode, 'ECOLOGICAL_LIMIT_REACHED');

const preInvalid = evaluatePreDischargeSafety({ ...baseTelemetry, downstreamLevelM: Number.NaN });
expectEqual('NaN downstream sensor → fail-safe REFUSED', preInvalid.canDischarge, false);
expectEqual('Reason = INVALID_TELEMETRY', preInvalid.reasonCode, 'INVALID_TELEMETRY');

// ---------------------------------------------------------------------------
// Case 5 — In-flight emergency halt with hysteresis release
// ---------------------------------------------------------------------------

section('Case 5 · In-Flight Emergency Halt & Hysteresis Release');

/** Downstream surge profile (m) sampled each 60 s tick while discharging at 100%. */
const downstreamProfile = [1.5, 1.8, 2.2, 2.45, 2.55, 2.6, 2.45, 2.4, 2.36, 2.3, 2.2];
const WETLAND_LEVEL_DURING_SURGE_M = 3.0;

let state: InterlockState = createInitialInterlockState();
const trace: Array<{ t: number; down: number; gate: number; reason: string; locked: boolean }> = [];
let tripTick = -1;
let releaseTick = -1;

downstreamProfile.forEach((downstreamLevelM, tick) => {
  const { evaluation, nextState, event } = monitorActiveDischarge(
    {
      wetlandLevelM: WETLAND_LEVEL_DURING_SURGE_M,
      downstreamLevelM,
      requestedGateOpeningM: GATE_MAX_OPENING_M,
      simTimeSec: tick * 60,
    },
    state,
  );
  if (event?.type === 'EMERGENCY_HALT' && tripTick < 0) tripTick = tick;
  if (event?.type === 'INTERLOCK_RELEASED' && releaseTick < 0) releaseTick = tick;
  trace.push({
    t: tick * 60,
    down: downstreamLevelM,
    gate: evaluation.recommendedGateOpeningM,
    reason: evaluation.reasonCode,
    locked: evaluation.activeLockout,
  });
  state = nextState;
});

console.log('\n    t(s)  H_down(m)  Gate(m)  Locked  Reason');
console.log('    ----  ---------  -------  ------  ------------------------------');
trace.forEach((row) => {
  console.log(
    `    ${String(row.t).padStart(4)}  ${row.down.toFixed(2).padStart(9)}  ${row.gate.toFixed(2).padStart(7)}  ${String(row.locked).padStart(6)}  ${row.reason}`,
  );
});
console.log('');

expectEqual('Gate fully open before surge (t=0..180 s)', trace.slice(0, 4).every((r) => r.gate === 2.0), true);
expectEqual('EMERGENCY_HALT tripped on FIRST tick H_down ≥ 2.5 m (tick 4)', tripTick, 4);
expectEqual('Gate forced to 0 m on trip tick', trace[4]?.gate, 0);
expectEqual(
  'Lockout HELD inside hysteresis band (H_down 2.45 → 2.36 m)',
  trace.slice(6, 9).every((r) => r.gate === 0 && r.locked),
  true,
);
expectEqual('Lockout RELEASED once H_down ≤ 2.35 m (tick 9)', releaseTick, 9);
expectEqual('Gate restored to 2.0 m after release', trace[9]?.gate, 2.0);
expectEqual('Trip counter = 1', state.tripCount, 1);

// Pre-discharge cannot bypass a latched lockout.
const latchedState: InterlockState = { isLockedOut: true, tripReason: 'DOWNSTREAM_CAPACITY_EXCEEDED', lockedSinceSec: 0, tripCount: 1 };
const bypassAttempt = evaluatePreDischargeSafety({ ...baseTelemetry, wetlandLevelM: 3.0, downstreamLevelM: 2.45 }, undefined, latchedState);
expectEqual('Pre-check refuses re-open while latched (H_down 2.45 m)', bypassAttempt.canDischarge, false);
expectEqual('Reason = LOCKOUT_HYSTERESIS_HOLD', bypassAttempt.reasonCode, 'LOCKOUT_HYSTERESIS_HOLD');

// Tidal intrusion mid-discharge also trips the halt.
const tidal = monitorActiveDischarge(
  { wetlandLevelM: 2.0, downstreamLevelM: 1.95, requestedGateOpeningM: 2.0, simTimeSec: 0 },
  createInitialInterlockState(),
);
expectEqual('Tidal rise (head 0.05 m) mid-discharge → EMERGENCY_HALT', tidal.event?.type, 'EMERGENCY_HALT');
expectEqual('Reason = TIDAL_BACKFLOW_RISK', tidal.evaluation.reasonCode, 'TIDAL_BACKFLOW_RISK');

// ---------------------------------------------------------------------------
// Case 6 — Discrete water balance & mass conservation
// ---------------------------------------------------------------------------

section('Case 6 · Discrete Time-Step Water Balance');

const Q_OUT_TEST = 20;
const singleStep = stepWaterBalance({
  currentLevelM: 2.0,
  inflowM3PerS: qIn,
  outflowM3PerS: Q_OUT_TEST,
  timeStepSec: 3600,
});
const expectedDeltaV = (qIn - Q_OUT_TEST) * 3600;
expectClose('ΔV over 1 h (Q_in=48.61, Q_out=20)', singleStep.deltaVolumeM3, expectedDeltaV, 1e-6, 'm³');
expectClose('H_next = 2.0 + ΔV / A_wetland', singleStep.nextLevelM, 2.0 + expectedDeltaV / WETLAND_AREA_M2, 1e-9, 'm');

let level = 2.0;
for (let i = 0; i < 60; i += 1) {
  level = stepWaterBalance({ currentLevelM: level, inflowM3PerS: qIn, outflowM3PerS: Q_OUT_TEST, timeStepSec: 60 }).nextLevelM;
}
expectClose('Mass conservation: 60×60 s steps ≡ 1×3600 s step', level, singleStep.nextLevelM, 1e-9, 'm');

const drained = stepWaterBalance({ currentLevelM: 0.01, inflowM3PerS: 0, outflowM3PerS: 100, timeStepSec: 3600 });
expectEqual('Level floored at 0 m (cannot go negative)', drained.nextLevelM, 0);

const flood = stepWaterBalance({ currentLevelM: 3.4, inflowM3PerS: 100, outflowM3PerS: 0, timeStepSec: 3600 });
expectEqual(`Spillover flag when H_next > H_max (${H_MAX_CRITICAL_M} m)`, flood.exceedsCriticalLevel, true);

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

const passed = results.filter((r) => r.passed).length;
const failed = results.length - passed;

console.log('\n\x1b[1m════════════════════ CHECKPOINT 1 SUMMARY ════════════════════\x1b[0m');
console.log(`  Total checks : ${results.length}`);
console.log(`  \x1b[32mPassed       : ${passed}\x1b[0m`);
console.log(`  ${failed > 0 ? '\x1b[31m' : ''}Failed       : ${failed}\x1b[0m`);

if (failed > 0) {
  console.log('\n  Failed checks:');
  results.filter((r) => !r.passed).forEach((r) => console.log(`   - [${r.section}] ${r.name}`));
  process.exit(1);
}

console.log('\n  \x1b[32m\x1b[1m✔ ALL CHECKPOINT 1 CRITERIA SATISFIED\x1b[0m\n');
