/**
 * @file verify-task3.ts
 * @description Checkpoint 3 automated verification suite for the BBR Digital Twin:
 * IoT Sensor Simulator, 3-Phase State Machine and Dual-Track Simulation Comparator.
 *
 * Run: npm run verify:task3
 * Exits with code 1 if any assertion fails.
 */

import { H_MAX_CRITICAL_M } from '../src/constants/hydrologyConstants';
import {
  calculateTraditionalWeirDischarge,
  runDualTrackSimulation,
} from '../src/core/dualTrackSimulator';
import { SmartWetlandStateMachine } from '../src/core/stateMachine';
import {
  DEFAULT_GATE_SLEW_RATE_M_PER_S,
  IoTDeviceSimulator,
  stepActuatorOpening,
} from '../src/services/iot/sensorSimulator';
import { loadPresetScenario } from '../src/services/weather/weatherAdapter';
import type { HourlyWeatherPoint } from '../src/services/weather/weatherTypes';

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

function expectEqual<T>(name: string, actual: T, expected: T): void {
  record(name, actual === expected, `actual=${String(actual)} | expected=${String(expected)}`);
}

function expectClose(
  name: string,
  actual: number,
  expected: number,
  absTolerance: number,
  unit: string,
): void {
  const error = Math.abs(actual - expected);
  record(
    name,
    error < absTolerance,
    `actual=${actual.toFixed(4)} ${unit} | expected=${expected.toFixed(4)} ${unit} | |Δ|=${error.toExponential(2)}`,
  );
}

async function main(): Promise<void> {
  const fixedNowMs = Date.UTC(2026, 9, 20, 8, 0, 0);

  // -------------------------------------------------------------------------
  // Case 1 — IoT Sensor & Actuator Mechanical Kinetics
  // -------------------------------------------------------------------------

  section('Case 1 · IoT Sensor Telemetry & Actuator Kinetics');

  // Verify slew rate kinetics: 0.05 m/s
  // In 20 seconds, travel = 20 * 0.05 = 1.0 m
  const step1 = stepActuatorOpening(0.0, 2.0, 20, DEFAULT_GATE_SLEW_RATE_M_PER_S);
  expectEqual('Actuator reaches 1.0 m after 20s @ 0.05 m/s', step1.newOpeningM, 1.0);
  expectEqual('Actuator reports isMoving = true during transit', step1.isMoving, true);
  expectEqual('Estimated remaining time to 2.0 m = 20.0s', step1.timeToTargetSec, 20);

  // In another 20 seconds, reaches 2.0 m target
  const step2 = stepActuatorOpening(1.0, 2.0, 20, DEFAULT_GATE_SLEW_RATE_M_PER_S);
  expectEqual('Actuator reaches 2.0 m after 40s total', step2.newOpeningM, 2.0);
  expectEqual('Actuator reports isMoving = false when setpoint reached', step2.isMoving, false);
  expectEqual('Estimated remaining time = 0s', step2.timeToTargetSec, 0);

  // IoT Simulator device integration
  const iot = new IoTDeviceSimulator(0, DEFAULT_GATE_SLEW_RATE_M_PER_S, true);
  iot.commandGateOpening(1.5);
  const telemetry = iot.step(10, 10, 2.05, 1.35, 0.55);

  expectClose('Gate actuator advances by 0.5 m in 10s', telemetry.gateActuator.currentOpeningM, 0.5, 0.01, 'm');
  expectEqual('Gate actuator target = 1.5 m', telemetry.gateActuator.targetOpeningM, 1.5);
  record(
    'Ultrasonic level sensor reading is within realistic noise band (±0.02 m)',
    Math.abs(telemetry.wetlandLevel.value - 2.05) < 0.02,
    `raw=2.0500 m | measured=${telemetry.wetlandLevel.value.toFixed(4)} m | noise=${telemetry.wetlandLevel.noiseOffset.toFixed(4)} m`,
  );
  expectEqual('Sensor health status = HEALTHY', telemetry.wetlandLevel.status, 'HEALTHY');

  // -------------------------------------------------------------------------
  // Case 2 — 3-Phase State Machine Phase Transitions
  // -------------------------------------------------------------------------

  section('Case 2 · 3-Phase State Machine Phase Transitions');

  const sm = new SmartWetlandStateMachine();

  // Test NORMAL mode: 0 mm forecast, H=2.0m
  const forecastClear: HourlyWeatherPoint[] = Array.from({ length: 12 }, (_, i) => ({
    timeIso: new Date(fixedNowMs + i * 3600_000).toISOString(),
    hourOffset: i,
    precipitationMmPerHr: 0,
    soilSaturation: 0.4,
    downstreamLevelM: 1.4,
  }));

  const decisionNormal = sm.evaluate({
    simTimeSec: 0,
    wetlandLevelM: 2.0,
    downstreamLevelM: 1.4,
    currentRainfallMmPerHr: 0,
    soilSaturation: 0.4,
    forecastSeries: forecastClear,
  });
  expectEqual('Phase is NORMAL when forecast is clear', decisionNormal.phase, 'NORMAL');
  expectEqual('Normal mode target gate opening = 0 m', decisionNormal.targetGateOpeningM, 0);

  // Test PRE_DISCHARGE mode: storm arriving in 4 hours
  const forecastStorm: HourlyWeatherPoint[] = Array.from({ length: 12 }, (_, i) => ({
    timeIso: new Date(fixedNowMs + i * 3600_000).toISOString(),
    hourOffset: i,
    precipitationMmPerHr: i >= 3 && i <= 6 ? 80 : 0, // 80 mm/h for 4 hours
    soilSaturation: 0.5,
    downstreamLevelM: 0.8,
  }));

  const decisionPreDischarge = sm.evaluate({
    simTimeSec: 0,
    wetlandLevelM: 2.0,
    downstreamLevelM: 0.8,
    currentRainfallMmPerHr: 0,
    soilSaturation: 0.5,
    forecastSeries: forecastStorm,
  });
  expectEqual('Phase transitions to PRE_DISCHARGE before storm arrives', decisionPreDischarge.phase, 'PRE_DISCHARGE');
  expectEqual('Pre-discharge targets 2.0 m gate opening', decisionPreDischarge.targetGateOpeningM, 2.0);
  record(
    'Pre-discharge identifies forecast 6h rainfall > 30 mm',
    decisionPreDischarge.forecast6hRainfallMm >= 30,
    `6hRainfall=${decisionPreDischarge.forecast6hRainfallMm} mm`,
  );

  // Test PEAK_SHAVING mode: active heavy rain (i = 80 mm/h)
  const decisionPeak = sm.evaluate({
    simTimeSec: 4 * 3600,
    wetlandLevelM: 1.0,
    downstreamLevelM: 1.5,
    currentRainfallMmPerHr: 80,
    soilSaturation: 0.8,
    forecastSeries: forecastStorm.slice(4),
  });
  expectEqual('Phase transitions to PEAK_SHAVING during active storm (80 mm/h)', decisionPeak.phase, 'PEAK_SHAVING');
  expectEqual('Peak-shaving commands gate closed (0 m)', decisionPeak.targetGateOpeningM, 0);

  // Test RECOVERY mode: rain stopped (i = 0 mm/h), wetland level high (H = 2.6 m)
  const decisionRecovery = sm.evaluate({
    simTimeSec: 9 * 3600,
    wetlandLevelM: 2.6,
    downstreamLevelM: 1.3,
    currentRainfallMmPerHr: 0,
    soilSaturation: 0.7,
    forecastSeries: forecastClear,
  });
  expectEqual('Phase transitions to RECOVERY after storm with H > 2.0 m', decisionRecovery.phase, 'RECOVERY');
  record(
    'Recovery commands controlled gate opening (> 0 m)',
    decisionRecovery.targetGateOpeningM > 0,
    `targetGateOpening=${decisionRecovery.targetGateOpeningM} m`,
  );

  // Test Downstream Emergency Interlock Override
  const decisionInterlock = sm.evaluate({
    simTimeSec: 9 * 3600 + 60,
    wetlandLevelM: 2.6,
    downstreamLevelM: 2.7, // High downstream surge > 2.5 m
    currentRainfallMmPerHr: 0,
    soilSaturation: 0.7,
    forecastSeries: forecastClear,
  });
  expectEqual('Downstream surge (2.7 m) trips INTERLOCK_SUSPENDED', decisionInterlock.phase, 'INTERLOCK_SUSPENDED');
  expectEqual('Gate forced immediately to 0 m', decisionInterlock.targetGateOpeningM, 0);

  // -------------------------------------------------------------------------
  // Case 3 — Traditional Weir Physics
  // -------------------------------------------------------------------------

  section('Case 3 · Traditional Weir Outflow Physics');

  const qWeirBelow = calculateTraditionalWeirDischarge(1.9, 1.2);
  expectEqual('Weir outflow = 0 when H (1.9 m) <= crest (2.0 m)', qWeirBelow, 0);

  const qWeirTidalLock = calculateTraditionalWeirDischarge(2.4, 2.5);
  expectEqual('Weir outflow = 0 when downstream (2.5 m) > wetland (2.4 m)', qWeirTidalLock, 0);

  const qWeirAbove = calculateTraditionalWeirDischarge(2.5, 1.2);
  const expectedWeir = 1.84 * 10.0 * Math.pow(0.5, 1.5);
  expectClose('Weir outflow @ H=2.5 m matches broad-crested formula', qWeirAbove, expectedWeir, 0.01, 'm³/s');

  // -------------------------------------------------------------------------
  // Case 4 — 12-Hour Accelerated Simulation: SCENARIO_PRE_STORM
  // -------------------------------------------------------------------------

  section('Case 4 · 12-Hour Accelerated Simulation (SCENARIO_PRE_STORM)');

  const preStormScenario = loadPresetScenario('SCENARIO_PRE_STORM', { nowMs: fixedNowMs });
  const { frames, summary } = runDualTrackSimulation(preStormScenario, {
    dtSec: 60,
    maxHours: 12,
  });

  console.log('\n    ═══ 12-Hour Comparative Simulation Results ═══');
  console.log(`    Scenario              : ${summary.scenarioName}`);
  console.log(`    Simulated Duration    : ${summary.durationHours} hours (${frames.length} sampled frames)`);
  console.log(`    Total Rainfall        : ${summary.totalRainfallMm} mm`);
  console.log('    ──────────────────────────────────────────────');
  console.log(`    Traditional Peak Level: ${summary.traditional.peakWaterLevelM.toFixed(3)} m (Critical: ${H_MAX_CRITICAL_M.toFixed(1)} m)`);
  console.log(`    Traditional Overflow  : ${summary.traditional.totalOverflowVolumeM3.toLocaleString()} m³ (${summary.traditional.spilloverHours} hours spillover)`);
  console.log('    ──────────────────────────────────────────────');
  console.log(`    Smart Twin Peak Level : ${summary.smart.peakWaterLevelM.toFixed(3)} m (SAFELY BELOW ${H_MAX_CRITICAL_M.toFixed(1)} m)`);
  console.log(`    Smart Twin Overflow   : ${summary.smart.totalOverflowVolumeM3.toLocaleString()} m³ (${summary.smart.spilloverHours} hours spillover)`);
  console.log(`    Avoided Flood Volume  : ${summary.mitigation.avoidedOverflowVolumeM3.toLocaleString()} m³`);
  console.log(`    Peak Level Reduction  : ${summary.mitigation.peakLevelReductionM.toFixed(3)} m`);
  console.log(`    Gate Operations Count : ${summary.smart.gateOperationsCount} actuations`);
  console.log('    Phase Distribution    :', summary.smart.phaseDistribution);
  console.log('');

  // Assertions
  record(
    `Traditional baseline spills over critical flood level (${H_MAX_CRITICAL_M} m)`,
    summary.traditional.peakWaterLevelM > H_MAX_CRITICAL_M,
    `peak=${summary.traditional.peakWaterLevelM.toFixed(3)} m`,
  );
  record(
    `Traditional baseline accumulates urban overflow volume > 50,000 m³`,
    summary.traditional.totalOverflowVolumeM3 > 50_000,
    `overflow=${summary.traditional.totalOverflowVolumeM3.toLocaleString()} m³`,
  );
  record(
    `Smart digital twin maintains water level strictly below critical flood level (${H_MAX_CRITICAL_M} m)`,
    summary.smart.peakWaterLevelM < H_MAX_CRITICAL_M,
    `peak=${summary.smart.peakWaterLevelM.toFixed(3)} m (safe margin: ${(H_MAX_CRITICAL_M - summary.smart.peakWaterLevelM).toFixed(3)} m)`,
  );
  expectEqual('Smart digital twin completely eliminates spillover (0 hours flooding)', summary.smart.spilloverHours, 0);
  expectEqual('Smart digital twin zero overflow volume', summary.smart.totalOverflowVolumeM3, 0);
  expectEqual('Comparative summary confirms floodEliminated = true', summary.mitigation.floodEliminated, true);

  // Check that smart wetland drew down before hour 4
  const preDischargeFrame = frames.find((f) => f.hourOffset === 3.5);
  record(
    'Smart wetland draws down toward 1.0 m before storm arrives (at t=3.5h)',
    (preDischargeFrame?.smart.waterLevelM ?? 2.0) <= 1.15,
    `level=${preDischargeFrame?.smart.waterLevelM} m at t=3.5h`,
  );

  // -------------------------------------------------------------------------
  // Case 5 — 12-Hour Simulation: SCENARIO_FLASH_FLOOD_HIGH_TIDE
  // -------------------------------------------------------------------------

  section('Case 5 · 12-Hour Flash Flood + High Tide Tidal Interlock');

  const flashFloodScenario = loadPresetScenario('SCENARIO_FLASH_FLOOD_HIGH_TIDE', { nowMs: fixedNowMs });
  const flashSim = runDualTrackSimulation(flashFloodScenario, {
    dtSec: 60,
    maxHours: 12,
  });

  const interlockHours = flashSim.summary.smart.phaseDistribution.INTERLOCK_SUSPENDED ?? 0;
  record(
    'High tide conditions (2.8 m) actively trigger INTERLOCK_SUSPENDED phase',
    interlockHours > 0,
    `interlockDuration=${interlockHours} hours`,
  );

  // -------------------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------------------

  const passed = results.filter((r) => r.passed).length;
  const failed = results.length - passed;

  console.log('\n\x1b[1m════════════════════ CHECKPOINT 3 SUMMARY ════════════════════\x1b[0m');
  console.log(`  Total checks : ${results.length}`);
  console.log(`  \x1b[32mPassed       : ${passed}\x1b[0m`);
  console.log(`  ${failed > 0 ? '\x1b[31m' : ''}Failed       : ${failed}\x1b[0m`);

  if (failed > 0) {
    console.log('\n  Failed checks:');
    results.filter((r) => !r.passed).forEach((r) => console.log(`   - [${r.section}] ${r.name}`));
    process.exit(1);
  }

  console.log('\n  \x1b[32m\x1b[1m✔ ALL CHECKPOINT 3 CRITERIA SATISFIED\x1b[0m\n');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
