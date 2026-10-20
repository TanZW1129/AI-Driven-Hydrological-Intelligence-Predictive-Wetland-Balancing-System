/**
 * @file verify-task4.ts
 * @description Checkpoint 4 automated verification suite for the Digital Twin
 * Dashboard store, 3D scene coordinate mapping, Swagger injection integration
 * and interactive downstream safety interlock override.
 */

import {
  CAMERA_PRESETS,
  levelToSceneY,
} from '../src/components/3d/sceneCoordinates';
import { SAMPLE_CUSTOM_SWAGGER_PAYLOAD } from '../src/services/weather/openApiSpec';
import {
  selectEffectiveFrame,
  useSimulationStore,
} from '../src/store/simulationStore';

interface CheckResult {
  name: string;
  passed: boolean;
  detail: string;
}

const results: CheckResult[] = [];

function record(name: string, passed: boolean, detail: string): void {
  results.push({ name, passed, detail });
  const badge = passed ? '\x1b[32m✔ PASS\x1b[0m' : '\x1b[31m✘ FAIL\x1b[0m';
  console.log(`  ${badge}  ${name}\n         ${detail}`);
}

function expectEqual<T>(name: string, actual: T, expected: T): void {
  record(name, actual === expected, `actual=${String(actual)} | expected=${String(expected)}`);
}

console.log('\n\x1b[1m\x1b[36m▶ Checkpoint 4 · Store, 3D Coordinates & Interactive Safety Interlock\x1b[0m');

// 1. Verify initial store state
const store = useSimulationStore.getState();
expectEqual('Initial scenario = SCENARIO_PRE_STORM', store.activeScenario.scenarioId, 'SCENARIO_PRE_STORM');
record('Pre-computed 24h frames loaded (288 frames @ 5-min step)', store.frames.length >= 280, `frames=${store.frames.length}`);

// 2. Verify 3D coordinate mapping
expectEqual('levelToSceneY(1.0 m) = 1.2 scene units', levelToSceneY(1.0), 1.2);
expectEqual('levelToSceneY(3.5 m) = 4.2 scene units', levelToSceneY(3.5), 4.2);
expectEqual('4 camera presets configured', Object.keys(CAMERA_PRESETS).length, 4);

// 3. Verify seeking to pre-discharge frame (t = 1h -> frame index 12)
store.seekToFrame(12);
const frameAt1h = selectEffectiveFrame(useSimulationStore.getState());
expectEqual('At T+1.0h, phase is PRE_DISCHARGE', frameAt1h.phase, 'PRE_DISCHARGE');
record('At T+1.0h, sluice gate is open (2.0 m)', frameAt1h.gateOpeningM === 2.0, `gate=${frameAt1h.gateOpeningM} m`);

// 4. Verify Live Downstream Surge Injection mid-discharge triggers immediate auto-halt
store.setDownstreamOverride(true, 2.65);
const haltedFrame = selectEffectiveFrame(useSimulationStore.getState());
expectEqual('Downstream surge (2.65 m) mid-discharge trips INTERLOCK_SUSPENDED', haltedFrame.phase, 'INTERLOCK_SUSPENDED');
expectEqual('Gate immediately forced to 0 m', haltedFrame.gateOpeningM, 0);
expectEqual('Outflow Q_out forced to 0 m³/s', haltedFrame.outflowM3PerS, 0);
expectEqual('Lockout latched = true', haltedFrame.activeLockout, true);

// 5. Verify hysteresis hold inside head hysteresis band (ΔH = 0.12 m ∈ [0.10, 0.15) m)
const hysteresisDownstreamM = Number((frameAt1h.wetlandLevelM - 0.12).toFixed(3));
store.setDownstreamOverride(true, hysteresisDownstreamM);
const heldFrame = selectEffectiveFrame(useSimulationStore.getState());
expectEqual('Hysteresis holds gate closed inside hysteresis margin', heldFrame.gateOpeningM, 0);
expectEqual('Reason = LOCKOUT_HYSTERESIS_HOLD', heldFrame.interlockReasonCode, 'LOCKOUT_HYSTERESIS_HOLD');

// 6. Verify release once downstream recedes beyond hysteresis margin (ΔH = 0.30 m >= 0.15 m)
const releaseDownstreamM = Number((frameAt1h.wetlandLevelM - 0.30).toFixed(3));
store.setDownstreamOverride(true, releaseDownstreamM);
const releasedFrame = selectEffectiveFrame(useSimulationStore.getState());
expectEqual('Lockout released once downstream recedes; gate re-opens to 2.0 m', releasedFrame.gateOpeningM, 2.0);
store.setDownstreamOverride(false);

// 7. Verify Manual Override Mode still enforces downstream safety
store.setControlMode('MANUAL_OVERRIDE');
store.setManualGateTarget(1.8);
store.setDownstreamOverride(true, 2.7);
const manualBlocked = selectEffectiveFrame(useSimulationStore.getState());
expectEqual('Manual override (1.8 m) blocked when downstream = 2.7 m', manualBlocked.gateOpeningM, 0);
store.setDownstreamOverride(false);
store.setControlMode('AUTO_AI');

// 8. Verify Swagger Custom JSON injection into store
store.applyCustomJsonScenario(JSON.stringify(SAMPLE_CUSTOM_SWAGGER_PAYLOAD));
expectEqual(
  'Swagger JSON injection updates activeScenario in store',
  useSimulationStore.getState().activeScenario.scenarioId,
  'CUSTOM_MONSOON_BURST',
);

// Restore default scenario
store.selectPresetScenario('SCENARIO_PRE_STORM');

const passed = results.filter((r) => r.passed).length;
const failed = results.length - passed;
console.log(`\n  Passed: ${passed}/${results.length}`);
if (failed > 0) process.exit(1);
console.log('  \x1b[32m\x1b[1m✔ ALL CHECKPOINT 4 ASSERTIONS PASSED\x1b[0m\n');
