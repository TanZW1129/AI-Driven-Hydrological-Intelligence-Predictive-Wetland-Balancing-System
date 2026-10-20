/**
 * @file verify-task4.ts
 * @description Checkpoint 4 & Redesign automated verification suite for:
 *   - Dual-Mode decoupling (LIVE Real-Time Operation vs. SIMULATION API Studio)
 *   - Real-time wall-clock anchoring (NOW), 30h window (-6h hindcast + 24h forecast)
 *     and future-hour lookahead scrubbing (+6h)
 *   - 3D scene coordinate mapping & camera presets
 *   - Custom parametric form synthesis & Swagger JSON injection
 *   - Interactive downstream safety interlock emergency halt & hysteresis release
 */

import {
  CAMERA_PRESETS,
  levelToSceneY,
} from '../src/components/3d/sceneCoordinates';
import { SAMPLE_CUSTOM_SWAGGER_PAYLOAD } from '../src/services/weather/openApiSpec';
import {
  selectEffectiveFrame,
  selectTimeContext,
  TIMELINE_FRAMES_PER_HOUR,
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

console.log('\n\x1b[1m\x1b[36m▶ Checkpoint 4 · Dual-Mode Store, Real-Time Lookahead, 3D & Safety Interlock\x1b[0m');

// ---------------------------------------------------------------------------
// Part A: LIVE Real-Time Operational Mode
// ---------------------------------------------------------------------------
const initialStore = useSimulationStore.getState();
expectEqual('Default boot mode = LIVE (Real-Time Operation)', initialStore.appMode, 'LIVE');
expectEqual('LIVE mode locked to NOW by default (followNow = true)', initialStore.live.followNow, true);
expectEqual(
  'LIVE cursor frame aligned with nowFrameIndex',
  initialStore.currentFrameIndex,
  initialStore.live.nowFrameIndex,
);
record(
  'LIVE 30h operational window loaded (360 frames @ 5-min step)',
  initialStore.frames.length === 360,
  `frames=${initialStore.frames.length}`,
);

// Scrub +6 hours into the future in LIVE mode
initialStore.stepBy(6 * TIMELINE_FRAMES_PER_HOUR);
const lookaheadState = useSimulationStore.getState();
const lookaheadTimeCtx = selectTimeContext(lookaheadState);
expectEqual('Scrubbing +6h in LIVE mode unlocks followNow', lookaheadState.live.followNow, false);
expectEqual('Scrubbing +6h marks timeContext.isForecast = true', lookaheadTimeCtx.isForecast, true);
record(
  'Lookahead offsetFromNowSec > +5h (18,000s)',
  lookaheadTimeCtx.offsetFromNowSec > 18_000,
  `offsetFromNowSec=${lookaheadTimeCtx.offsetFromNowSec}s`,
);

// Jump back to NOW
lookaheadState.jumpToNow();
const snappedState = useSimulationStore.getState();
expectEqual('jumpToNow() restores followNow = true', snappedState.live.followNow, true);
expectEqual(
  'jumpToNow() snaps cursor back to nowFrameIndex',
  snappedState.currentFrameIndex,
  snappedState.live.nowFrameIndex,
);

// ---------------------------------------------------------------------------
// Part B: Custom SIMULATION Studio Mode & 3D Coordinates
// ---------------------------------------------------------------------------
useSimulationStore.getState().setAppMode('SIMULATION');
const store = useSimulationStore.getState();
expectEqual('Switched to SIMULATION studio mode', store.appMode, 'SIMULATION');
expectEqual('Default custom scenario = CUSTOM_SIMULATION', store.activeScenario.scenarioId, 'CUSTOM_SIMULATION');
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

// 9. Verify custom parametric form update & re-synthesis
store.updateSimulationForm({ peakIntensityMmPerHr: 110, stormStartHour: 3 });
store.applySimulationForm();
expectEqual(
  'Custom parametric form re-synthesizes scenario (peak rain = 110 mm/h at T+3h)',
  useSimulationStore.getState().activeScenario.hourlySeries[3]?.precipitationMmPerHr,
  110,
);

// Restore default state
store.resetSimulationForm();
store.applySimulationForm();
store.setAppMode('LIVE');

const passed = results.filter((r) => r.passed).length;
const failed = results.length - passed;
console.log(`\n  Passed: ${passed}/${results.length}`);
if (failed > 0) process.exit(1);
console.log('  \x1b[32m\x1b[1m✔ ALL CHECKPOINT 4 & REDESIGN ASSERTIONS PASSED\x1b[0m\n');
