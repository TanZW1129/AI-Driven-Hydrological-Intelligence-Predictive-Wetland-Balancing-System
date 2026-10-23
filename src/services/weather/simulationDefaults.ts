/**
 * @file simulationDefaults.ts
 * @description Single source of truth for the default custom simulation
 * scenario. The Simulation Studio form is seeded from these values, and the
 * store builds the initial simulation session from the same object, so the UI
 * form and the running simulation never drift apart.
 *
 * Default storyline: clear for hours 0–3, an 80 mm/h block storm during hours
 * 4–7, a 5 mm/h recession tail for hours 8–10, under a low slack tide
 * (0.8 ± 0.1 m). This demonstrates PRE_DISCHARGE → PEAK_SHAVING → RECOVERY.
 */

import type { ParametricScenarioInput, StormProfileShape } from './weatherTypes';

/** Flat, form-friendly representation of the parametric storm/tide builder. */
export interface SimulationFormValues {
  scenarioName: string;
  horizonHours: number;
  initialSoilSaturation: number;
  stormStartHour: number;
  stormDurationHours: number;
  peakIntensityMmPerHr: number;
  stormProfile: StormProfileShape;
  tailIntensityMmPerHr: number;
  tailDurationHours: number;
  tideMeanLevelM: number;
  tideAmplitudeM: number;
  tideHighWaterHour: number;
  surgePeakM: number;
}

export const DEFAULT_SIMULATION_FORM: Readonly<SimulationFormValues> = Object.freeze({
  scenarioName: 'Custom Convective Storm (80 mm/h @ T+4h)',
  horizonHours: 24,
  initialSoilSaturation: 0.4,
  stormStartHour: 4,
  stormDurationHours: 4,
  peakIntensityMmPerHr: 80,
  stormProfile: 'BLOCK',
  tailIntensityMmPerHr: 5,
  tailDurationHours: 3,
  tideMeanLevelM: 0.8,
  tideAmplitudeM: 0.1,
  tideHighWaterHour: 0,
  surgePeakM: 0,
});

/** Convert flat form values into the validated parametric builder contract. */
export function formValuesToParametricInput(values: SimulationFormValues): ParametricScenarioInput {
  return {
    scenarioId: 'CUSTOM_SIMULATION',
    scenarioName: values.scenarioName.trim() || DEFAULT_SIMULATION_FORM.scenarioName,
    horizonHours: values.horizonHours,
    initialSoilSaturation: values.initialSoilSaturation,
    storm: {
      startHour: values.stormStartHour,
      durationHours: values.stormDurationHours,
      peakIntensityMmPerHr: values.peakIntensityMmPerHr,
      profile: values.stormProfile,
    },
    ...(values.tailIntensityMmPerHr > 0 && values.tailDurationHours > 0
      ? {
          recessionTail: {
            intensityMmPerHr: values.tailIntensityMmPerHr,
            durationHours: values.tailDurationHours,
          },
        }
      : {}),
    tide: {
      meanLevelM: values.tideMeanLevelM,
      amplitudeM: values.tideAmplitudeM,
      highWaterHourOffset: values.tideHighWaterHour,
      ...(values.surgePeakM > 0
        ? {
            surge: {
              peakM: values.surgePeakM,
              centerHour: values.stormStartHour + Math.floor(values.stormDurationHours / 2),
              durationHours: Math.max(4, values.stormDurationHours + 2),
            },
          }
        : {}),
    },
  };
}
