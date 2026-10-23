/**
 * @file sceneCoordinates.ts
 * @description Shared spatial constants and vertical elevation mapping for the
 * BBR 3D Digital Twin scene. Keeps the wetland basin, level gauge, sluice gate
 * and downstream tidal channel aligned to a single landscape datum.
 */

import type { CameraViewPreset } from '../../store/simulationStore';

/** Scene Y units per metre of physical water depth. */
export const SCENE_Y_PER_METRE = 0.55;

/** Base Y elevation of 0.0m hydrological datum in 3D scene units. */
export const SCENE_WATER_BASE_Y = 0.95;

/**
 * Convert physical water level H (m above wetland datum) to 3D scene Y.
 *   - H = 1.0m (Eco Min)      -> Y = 1.50
 *   - H = 2.0m (Normal)       -> Y = 2.05
 *   - H = 2.5m (Tide Limit)   -> Y = 2.33
 *   - H = 3.5m (Flood Redline)-> Y = 2.88
 *   - Meadow Top (3.73m eq.)  -> Y = 3.00
 */
export function levelToSceneY(levelM: number): number {
  return Math.max(0.15, SCENE_WATER_BASE_Y + levelM * SCENE_Y_PER_METRE);
}

/** X coordinate of the sluice gate dam centreline. */
export const GATE_DAM_X = 4.0;

/** Wetland basin bounds (left of the dam). */
export const WETLAND_CENTER_X = -5.0;
export const WETLAND_WIDTH_X = 18.0; // spans x = -14 .. +4
export const WETLAND_DEPTH_Z = 16.0; // spans z = -8 .. +8

/** Downstream channel bounds (right of the dam). */
export const DOWNSTREAM_CENTER_X = 13.5;
export const DOWNSTREAM_WIDTH_X = 17.0; // spans x = +5 .. +22
export const DOWNSTREAM_DEPTH_Z = 10.0; // spans z = -5 .. +5

/** Camera preset positions and look-at targets. */
export const CAMERA_PRESETS: Readonly<
  Record<CameraViewPreset, { position: [number, number, number]; target: [number, number, number] }>
> = Object.freeze({
  OVERVIEW: {
    position: [-1.5, 20.5, 25.5],
    target: [-3.2, 2.1, 0],
  },
  GATE: {
    position: [9.5, 7.8, 9.5],
    target: [3.8, 2.2, 0],
  },
  WETLAND: {
    position: [-10.0, 14.8, 16.0],
    target: [-4.8, 2.3, -0.4],
  },
  DOWNSTREAM: {
    position: [20.0, 8.5, 11.0],
    target: [8.8, 1.8, 0],
  },
});
