/**
 * @file presetScenarios.ts
 * @description Built-in benchmark disaster scenarios. Each preset is declared
 * as parametric input and synthesised through the same validated builder used
 * by the visual scenario builder, guaranteeing identical data semantics.
 */

import { composeParametricScenario } from './scenarioBuilder';
import { validateParametricScenario } from './scenarioValidator';
import type { ParametricScenarioInput, PresetScenarioId, WeatherScenarioPayload } from './weatherTypes';

interface PresetDefinition extends ParametricScenarioInput {
  scenarioId: PresetScenarioId;
  scenarioName: string;
  description: string;
}

export const PRESET_SCENARIO_DEFINITIONS: Readonly<Record<PresetScenarioId, PresetDefinition>> = Object.freeze({
  SCENARIO_CLEAR_DAY: {
    scenarioId: 'SCENARIO_CLEAR_DAY',
    scenarioName: 'Normal Clear Day',
    description: '24 h without rainfall under a normal astronomical tide (1.2–1.6 m). Expected: hold 2.0 m baseline.',
    horizonHours: 24,
    initialSoilSaturation: 0.3,
    tide: { meanLevelM: 1.4, amplitudeM: 0.2, highWaterHourOffset: 0 },
  },
  SCENARIO_PRE_STORM: {
    scenarioId: 'SCENARIO_PRE_STORM',
    scenarioName: 'Predicted Heavy Storm in 4h',
    description:
      'Clear for hours 0–3, then an 80 mm/h extreme storm for hours 4–7 followed by 5 mm/h light rain (hours 8–10). ' +
      'Downstream at low slack tide (0.7–0.9 m). Expected: PRE_DISCHARGE down to 1.0 m before rain, then PEAK_SHAVING.',
    horizonHours: 24,
    initialSoilSaturation: 0.4,
    storm: { startHour: 4, durationHours: 4, peakIntensityMmPerHr: 80, profile: 'BLOCK' },
    recessionTail: { intensityMmPerHr: 5, durationHours: 3 },
    tide: { meanLevelM: 0.8, amplitudeM: 0.1, highWaterHourOffset: 0 },
  },
  SCENARIO_FLASH_FLOOD_HIGH_TIDE: {
    scenarioId: 'SCENARIO_FLASH_FLOOD_HIGH_TIDE',
    scenarioName: '1-in-100 Year Flash Flood + High Tide',
    description:
      'Active 100 mm/h storm for hours 0–4 on saturated soil, coinciding with a Klang Strait spring high tide plus ' +
      'storm surge peaking at 2.8 m (hour 3). Expected: downstream interlock blocks all discharge; full detention.',
    horizonHours: 24,
    initialSoilSaturation: 0.85,
    storm: { startHour: 0, durationHours: 5, peakIntensityMmPerHr: 100, profile: 'BLOCK' },
    recessionTail: { intensityMmPerHr: 10, durationHours: 2 },
    tide: {
      meanLevelM: 1.9,
      amplitudeM: 0.5,
      highWaterHourOffset: 3,
      surge: { peakM: 0.4, centerHour: 3, durationHours: 8 },
    },
  },
});

/** Build a preset scenario payload. */
export function buildPresetScenario(
  scenarioId: PresetScenarioId,
  options: { nowMs: number; startTimeIso?: string },
): WeatherScenarioPayload {
  const definition = PRESET_SCENARIO_DEFINITIONS[scenarioId];
  const validated = validateParametricScenario({
    ...definition,
    ...(options.startTimeIso !== undefined ? { startTimeIso: options.startTimeIso } : {}),
  });

  return composeParametricScenario(validated, {
    sourceType: 'PRESET',
    provider: 'preset-library',
    nowMs: options.nowMs,
    defaultScenarioId: definition.scenarioId,
    defaultScenarioName: definition.scenarioName,
  });
}
