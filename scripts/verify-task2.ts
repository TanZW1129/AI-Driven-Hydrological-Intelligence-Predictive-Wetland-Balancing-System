/**
 * @file verify-task2.ts
 * @description Checkpoint 2 automated verification suite for the BBR Weather
 * Service, Open-Meteo integration, Preset Scenarios and Swagger/OpenAPI
 * Custom Scenario Injector.
 *
 * Run: npm run verify:task2
 * Exits with code 1 if any assertion fails.
 */

import {
  BBR_LATITUDE,
  BBR_LONGITUDE,
  DEFAULT_CATCHMENT_AREA_HA,
  DOWNSTREAM_CRITICAL_LEVEL_M,
} from '../src/constants/hydrologyConstants';
import { evaluatePreDischargeSafety } from '../src/core/downstreamInterlock';
import {
  calculateEffectiveRunoffCoefficient,
  calculateStormInflowVolume,
} from '../src/core/hydrologyEngine';
import {
  SAMPLE_CUSTOM_SWAGGER_PAYLOAD,
  SAMPLE_PARAMETRIC_PAYLOAD,
  WEATHER_OPENAPI_SPEC,
} from '../src/services/weather/openApiSpec';
import { buildOpenMeteoUrl } from '../src/services/weather/openMeteoClient';
import { ScenarioValidationError } from '../src/services/weather/scenarioValidator';
import {
  buildParametricScenario,
  clearLiveWeatherCache,
  fetchCustomScenarioFromUrl,
  injectCustomScenario,
  loadLiveWeather,
  loadPresetScenario,
  summarizeScenario,
} from '../src/services/weather/weatherAdapter';

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
  // Case 1 — Live Open-Meteo API & Offline Fallback
  // -------------------------------------------------------------------------

  section('Case 1 · Open-Meteo Live API Integration & Offline Fail-Safe');

  const apiUrl = buildOpenMeteoUrl();
  record(
    'Open-Meteo URL targets BBR coordinates (3.085, 101.445)',
    apiUrl.includes(`latitude=${BBR_LATITUDE}`) && apiUrl.includes(`longitude=${BBR_LONGITUDE}`),
    apiUrl,
  );

  clearLiveWeatherCache();
  const livePayload = await loadLiveWeather({ timeoutMs: 6000 });
  const liveSummary = summarizeScenario(livePayload);
  record(
    'loadLiveWeather returns 24-hour normalized series (live or safe fallback)',
    livePayload.hourlySeries.length === 24 && livePayload.sourceType === 'LIVE_API',
    `scenarioId=${livePayload.scenarioId} | provider=${livePayload.metadata.provider} | isFallback=${livePayload.metadata.isFallback} | totalRain=${liveSummary.totalRainfallMm} mm`,
  );

  const sampleHour = livePayload.hourlySeries[0];
  console.log(
    `    Sample hour[0]: time=${sampleHour?.timeIso}, rain=${sampleHour?.precipitationMmPerHr} mm/h, ` +
      `soil=${sampleHour?.soilSaturation}, tide=${sampleHour?.downstreamLevelM} m, desc="${sampleHour?.weatherDescription}"`,
  );

  // Deterministic mock Open-Meteo response test
  clearLiveWeatherCache();
  const mockUnixTimes = Array.from({ length: 48 }, (_, i) => fixedNowMs / 1000 + i * 3600);
  const mockOpenMeteoBody = {
    latitude: BBR_LATITUDE,
    longitude: BBR_LONGITUDE,
    timezone: 'Asia/Singapore',
    hourly: {
      time: mockUnixTimes,
      precipitation: mockUnixTimes.map((_, i) => (i === 2 ? 18.5 : 0)),
      soil_moisture_0_to_7cm: mockUnixTimes.map(() => 0.27),
      temperature_2m: mockUnixTimes.map(() => 29.5),
      precipitation_probability: mockUnixTimes.map((_, i) => (i === 2 ? 85 : 10)),
      weather_code: mockUnixTimes.map((_, i) => (i === 2 ? 63 : 1)),
    },
  };

  const mockedLive = await loadLiveWeather({
    nowMs: fixedNowMs,
    forceRefresh: true,
    fetchImpl: async () =>
      new Response(JSON.stringify(mockOpenMeteoBody), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
  });
  expectEqual('Mocked Open-Meteo parsed 24 hours', mockedLive.hourlySeries.length, 24);
  expectEqual('Mocked Open-Meteo hour[2] rain = 18.5 mm/h', mockedLive.hourlySeries[2]?.precipitationMmPerHr, 18.5);
  expectClose('Soil moisture θ=0.27 m³/m³ → saturation S=0.60', mockedLive.hourlySeries[0]?.soilSaturation ?? 0, 0.6, 1e-4, '');

  // Network outage fallback test
  clearLiveWeatherCache();
  const offlineFallback = await loadLiveWeather({
    nowMs: fixedNowMs,
    forceRefresh: true,
    maxRetries: 0,
    fetchImpl: async () => {
      throw new Error('Simulated network outage');
    },
  });
  expectEqual('Offline fallback sets metadata.isFallback = true', offlineFallback.metadata.isFallback, true);
  expectEqual('Offline fallback still provides 24 safe hours', offlineFallback.hourlySeries.length, 24);

  // -------------------------------------------------------------------------
  // Case 2 — Preset Benchmark Scenarios
  // -------------------------------------------------------------------------

  section('Case 2 · Preset Extreme Disaster Scenarios');

  const clearDay = loadPresetScenario('SCENARIO_CLEAR_DAY', { nowMs: fixedNowMs });
  const clearSummary = summarizeScenario(clearDay);
  expectEqual('SCENARIO_CLEAR_DAY total rainfall = 0 mm', clearSummary.totalRainfallMm, 0);

  const preStorm = loadPresetScenario('SCENARIO_PRE_STORM', { nowMs: fixedNowMs });
  const preStormSummary = summarizeScenario(preStorm);
  expectEqual('SCENARIO_PRE_STORM calm lead-in hours 0..3 = 0 mm/h', preStorm.hourlySeries.slice(0, 4).every((h) => h.precipitationMmPerHr === 0), true);
  expectEqual('SCENARIO_PRE_STORM peak = 80 mm/h at hour 4', preStorm.hourlySeries[4]?.precipitationMmPerHr, 80);
  expectEqual('SCENARIO_PRE_STORM total rainfall = 335 mm (4×80 + 3×5)', preStormSummary.totalRainfallMm, 335);

  const cEffPreStorm = calculateEffectiveRunoffCoefficient(preStorm.hourlySeries[4]?.soilSaturation ?? 0.4);
  const vInPreStorm = calculateStormInflowVolume({
    hourlyRainfallMmPerHr: preStorm.hourlySeries.slice(0, 10).map((h) => h.precipitationMmPerHr),
    runoffCoefficient: cEffPreStorm,
    catchmentAreaHa: DEFAULT_CATCHMENT_AREA_HA,
  });
  record(
    'SCENARIO_PRE_STORM 10h storm inflow volume V_in > 800,000 m³ (triggers Pre-Discharge)',
    vInPreStorm > 800_000,
    `V_in=${Math.round(vInPreStorm).toLocaleString()} m³ (C_eff=${cEffPreStorm.toFixed(4)})`,
  );

  const flashFlood = loadPresetScenario('SCENARIO_FLASH_FLOOD_HIGH_TIDE', { nowMs: fixedNowMs });
  const flashSummary = summarizeScenario(flashFlood);
  expectEqual('SCENARIO_FLASH_FLOOD_HIGH_TIDE peak rainfall = 100 mm/h', flashSummary.peakIntensityMmPerHr, 100);
  expectClose('SCENARIO_FLASH_FLOOD_HIGH_TIDE peak downstream tide = 2.80 m at hour 3', flashSummary.maxDownstreamLevelM, 2.8, 1e-4, 'm');
  record(
    `SCENARIO_FLASH_FLOOD_HIGH_TIDE has hours above critical downstream (${DOWNSTREAM_CRITICAL_LEVEL_M} m)`,
    flashSummary.hoursDownstreamCritical >= 3,
    `hoursDownstreamCritical=${flashSummary.hoursDownstreamCritical} h`,
  );

  const highTideCheck = evaluatePreDischargeSafety({
    wetlandLevelM: 3.1,
    downstreamLevelM: flashFlood.hourlySeries[3]?.downstreamLevelM ?? 2.8,
    requestedGateOpeningM: 2.0,
    simTimeSec: 3 * 3600,
  });
  expectEqual(
    'Downstream interlock blocks discharge at hour 3 of Flash Flood + High Tide',
    highTideCheck.canDischarge,
    false,
  );
  expectEqual('Interlock reason = DOWNSTREAM_CAPACITY_EXCEEDED', highTideCheck.reasonCode, 'DOWNSTREAM_CAPACITY_EXCEEDED');

  // -------------------------------------------------------------------------
  // Case 3 — Mode A: Swagger / OpenAPI Custom JSON Injection & URL Loading
  // -------------------------------------------------------------------------

  section('Case 3 · Swagger / OpenAPI Custom JSON Injection (Mode A)');

  expectEqual('OpenAPI spec version = 3.0.3', WEATHER_OPENAPI_SPEC.openapi, '3.0.3');

  const rawJsonString = JSON.stringify(SAMPLE_CUSTOM_SWAGGER_PAYLOAD);
  const customInjected = injectCustomScenario(rawJsonString, { nowMs: fixedNowMs });
  const customSummary = summarizeScenario(customInjected);

  expectEqual('Custom JSON scenarioId preserved', customInjected.scenarioId, 'CUSTOM_MONSOON_BURST');
  expectEqual('Custom JSON sourceType = CUSTOM_SWAGGER', customInjected.sourceType, 'CUSTOM_SWAGGER');
  expectEqual('Custom JSON length = 12 hours', customInjected.hourlySeries.length, 12);
  expectEqual('Custom JSON peak rainfall = 95 mm/h at hour 5', customSummary.peakIntensityMmPerHr, 95);
  expectEqual(
    'Omitted soilSaturation & timeIso automatically derived by model',
    customInjected.metadata.derivedFields.includes('soilSaturation') &&
      customInjected.metadata.derivedFields.includes('timeIso'),
    true,
  );

  const remoteLoaded = await fetchCustomScenarioFromUrl('https://mock.bbr-twin.local/scenarios/monsoon.json', {
    nowMs: fixedNowMs,
    fetchImpl: async () =>
      new Response(rawJsonString, {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
  });
  expectEqual('Remote custom URL scenario loaded & validated', remoteLoaded.scenarioId, 'CUSTOM_MONSOON_BURST');
  expectEqual('Remote provider recorded in metadata', remoteLoaded.metadata.provider, 'custom-url:mock.bbr-twin.local');

  // -------------------------------------------------------------------------
  // Case 4 — Mode B: Parametric Visual Scenario Builder
  // -------------------------------------------------------------------------

  section('Case 4 · Parametric Visual Scenario Builder (Mode B)');

  const parametric = buildParametricScenario(SAMPLE_PARAMETRIC_PAYLOAD, { nowMs: fixedNowMs });
  const parametricSummary = summarizeScenario(parametric);
  expectEqual('Parametric scenario horizon = 24 hours', parametric.hourlySeries.length, 24);
  expectEqual('Parametric triangular storm peaks at 90 mm/h', parametricSummary.peakIntensityMmPerHr, 90);
  expectEqual('Parametric recession tail at hour 7 = 6 mm/h', parametric.hourlySeries[7]?.precipitationMmPerHr, 6);

  // -------------------------------------------------------------------------
  // Case 5 — Fail-Safe Validation & Illegal Data Rejection
  // -------------------------------------------------------------------------

  section('Case 5 · Fail-Safe Schema Validation (Illegal Data Rejection)');

  function expectValidationFailure(
    name: string,
    fn: () => unknown,
    expectedCode: ScenarioValidationError['code'],
    expectedPathSubstring?: string,
  ): void {
    try {
      fn();
      record(name, false, 'Expected ScenarioValidationError, but call succeeded');
    } catch (error) {
      const isExpectedError = error instanceof ScenarioValidationError && error.code === expectedCode;
      const paths = error instanceof ScenarioValidationError ? error.issues.map((i) => i.path).join(', ') : '';
      const pathMatched = !expectedPathSubstring || paths.includes(expectedPathSubstring);
      record(
        name,
        isExpectedError && pathMatched,
        `code=${(error as ScenarioValidationError).code} | paths=[${paths}] | msg="${(error as Error).message}"`,
      );
    }
  }

  expectValidationFailure(
    'Rejects malformed JSON syntax',
    () => injectCustomScenario('{ "scenarioId": "BAD", broken json '),
    'JSON_SYNTAX',
  );

  expectValidationFailure(
    'Rejects negative rainfall (-15 mm/h)',
    () =>
      injectCustomScenario({
        scenarioId: 'NEG_RAIN',
        scenarioName: 'Negative Rain Test',
        hourlySeries: [{ hourOffset: 0, precipitationMmPerHr: -15 }],
      }),
    'SCHEMA_VIOLATION',
    'hourlySeries.0.precipitationMmPerHr',
  );

  expectValidationFailure(
    'Rejects out-of-range soilSaturation (1.4 > 1.0)',
    () =>
      injectCustomScenario({
        scenarioId: 'BAD_SOIL',
        scenarioName: 'Bad Soil Test',
        hourlySeries: [{ hourOffset: 0, precipitationMmPerHr: 10, soilSaturation: 1.4 }],
      }),
    'SCHEMA_VIOLATION',
    'hourlySeries.0.soilSaturation',
  );

  expectValidationFailure(
    'Rejects non-contiguous hourOffset sequence (0, 2)',
    () =>
      injectCustomScenario({
        scenarioId: 'GAP_HOURS',
        scenarioName: 'Gap Hours Test',
        hourlySeries: [
          { hourOffset: 0, precipitationMmPerHr: 0 },
          { hourOffset: 2, precipitationMmPerHr: 20 },
        ],
      }),
    'SCHEMA_VIOLATION',
    'hourlySeries.1.hourOffset',
  );

  try {
    await fetchCustomScenarioFromUrl('ftp://invalid-protocol.example.com/scenario.json');
    record('Rejects non-HTTP(S) URL protocol', false, 'Expected UNSUPPORTED_URL error');
  } catch (error) {
    record(
      'Rejects non-HTTP(S) URL protocol',
      error instanceof ScenarioValidationError && error.code === 'UNSUPPORTED_URL',
      `code=${(error as ScenarioValidationError).code} | msg="${(error as Error).message}"`,
    );
  }

  // -------------------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------------------

  const passed = results.filter((r) => r.passed).length;
  const failed = results.length - passed;

  console.log('\n\x1b[1m════════════════════ CHECKPOINT 2 SUMMARY ════════════════════\x1b[0m');
  console.log(`  Total checks : ${results.length}`);
  console.log(`  \x1b[32mPassed       : ${passed}\x1b[0m`);
  console.log(`  ${failed > 0 ? '\x1b[31m' : ''}Failed       : ${failed}\x1b[0m`);

  if (failed > 0) {
    console.log('\n  Failed checks:');
    results.filter((r) => !r.passed).forEach((r) => console.log(`   - [${r.section}] ${r.name}`));
    process.exit(1);
  }

  console.log('\n  \x1b[32m\x1b[1m✔ ALL CHECKPOINT 2 CRITERIA SATISFIED\x1b[0m\n');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
