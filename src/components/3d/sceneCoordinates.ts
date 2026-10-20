/**
 * @file sceneCoordinates.ts
 * @description Shared spatial constants and vertical elevation mapping for the
 * BBR 3D Digital Twin scene. Keeps the wetland basin, level gauge, sluice gate
 * and downstream tidal channel aligned to a single datum.
 */

import type { CameraViewPreset } from '../../store/simulationStore';

/** Scene Y units per metre of physical water depth. */
export const SCENE_Y_PER_METRE = 1.2;

/** Convert physical water level H (m above wetland datum) to 3D scene Y. */
export function levelToSceneY(levelM: number): number {
  return Math.max(0.05, levelM * SCENE_Y_PER_METRE);
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
    position: [2, 18, 26],
    target: [0, 2.0, 0],
  },
  GATE: {
    position: [7.5, 6.5, 11.5],
    target: [4.0, 2.4, 0],
  },
  WETLAND: {
    position: [-14, 12, 16],
    target: [-5.0, 2.0, 0],
  },
  DOWNSTREAM: {
    position: [22, 9, 13],
    target: [10.0, 2.0, 0],
  },
});
