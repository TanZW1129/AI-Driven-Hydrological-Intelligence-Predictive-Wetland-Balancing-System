/**
 * @file simulationStore.ts
 * @description Zustand reactive store coordinating weather scenarios, dual-track
 * hydrological simulation, 3D viewport camera presets, manual gate overrides
 * and live downstream safety interlock enforcement.
 */

import { create } from 'zustand';
import {
  DEFAULT_CATCHMENT_AREA_HA,
  GATE_MAX_OPENING_M,
} from '../constants/hydrologyConstants';
import {
  createInitialInterlockState,
  evaluatePreDischargeSafety,
  monitorActiveDischarge,
} from '../core/downstreamInterlock';
import {
  runDualTrackSimulation,
  type DualTrackComparisonSummary,
  type SimulationFrame,
} from '../core/dualTrackSimulator';
import {
  calculateAvailableStorage,
  calculateEffectiveRunoffCoefficient,
  calculateGateDischarge,
  calculateRunoffInflow,
} from '../core/hydrologyEngine';
import {
  buildParametricScenario,
  fetchCustomScenarioFromUrl,
  injectCustomScenario,
  loadLiveWeather,
  loadPresetScenario,
} from '../services/weather/weatherAdapter';
import type {
  PresetScenarioId,
  WeatherScenarioPayload,
} from '../services/weather/weatherTypes';
import type {
  ControlPhase,
  InterlockEvent,
  InterlockReasonCode,
  InterlockState,
} from '../types/hydrology';

export type CameraViewPreset = 'OVERVIEW' | 'GATE' | 'WETLAND' | 'DOWNSTREAM';
export type ControlMode = 'AUTO_AI' | 'MANUAL_OVERRIDE';

export interface EffectiveFrameState {
  simTimeSec: number;
  hourOffset: number;
  rainfallIntensityMmPerHr: number;
  soilSaturation: number;
  wetlandLevelM: number;
  measuredWetlandLevelM: number;
  traditionalLevelM: number;
  traditionalOutflowM3PerS: number;
  traditionalIsSpilling: boolean;
  downstreamLevelM: number;
  inflowM3PerS: number;
  outflowM3PerS: number;
  gateOpeningM: number;
  targetGateOpeningM: number;
  phase: ControlPhase;
  decisionReason: string;
  canDischarge: boolean;
  activeLockout: boolean;
  interlockReasonCode: InterlockReasonCode;
  interlockDiagnostic: string;
  availableBufferM3: number;
  forecast6hRainMm: number;
  isSpilling: boolean;
}

export interface SimulationStoreState {
  // Scenario state
  activeScenario: WeatherScenarioPayload;
  isLoadingScenario: boolean;
  scenarioError: string | null;

  // Dual-track simulation output
  frames: SimulationFrame[];
  summary: DualTrackComparisonSummary;

  // Playback state
  isPlaying: boolean;
  playbackSpeed: number; // 1, 10, 60, 300
  currentFrameIndex: number;

  // Interactive overrides (Manual Gate + Live Downstream Surge Test)
  controlMode: ControlMode;
  manualGateTargetM: number;
  downstreamOverrideEnabled: boolean;
  downstreamOverrideLevelM: number;
  manualInterlockState: InterlockState;
  interlockEvents: InterlockEvent[];

  // 3D Viewport & UI state
  cameraPreset: CameraViewPreset;
  showTraditionalGhostIn3D: boolean;
  isSwaggerModalOpen: boolean;

  // Actions
  selectPresetScenario: (presetId: PresetScenarioId) => void;
  selectLiveWeather: () => Promise<void>;
  applyCustomJsonScenario: (rawJson: unknown) => void;
  applyParametricScenario: (params: unknown) => void;
  applyCustomUrlScenario: (url: string) => Promise<void>;

  play: () => void;
  pause: () => void;
  togglePlay: () => void;
  stepForward: () => void;
  stepBackward: () => void;
  resetPlayback: () => void;
  seekToFrame: (index: number) => void;
  setPlaybackSpeed: (speed: number) => void;

  setControlMode: (mode: ControlMode) => void;
  setManualGateTarget: (openingM: number) => void;
  setDownstreamOverride: (enabled: boolean, levelM?: number) => void;
  resetInterlockLatch: () => void;

  setCameraPreset: (preset: CameraViewPreset) => void;
  toggleTraditionalGhost: () => void;
  setSwaggerModalOpen: (open: boolean) => void;
  clearError: () => void;
}

// Initial default scenario: SCENARIO_PRE_STORM
const initialScenario = loadPresetScenario('SCENARIO_PRE_STORM');
const initialSim = runDualTrackSimulation(initialScenario, { dtSec: 60 });

function applyScenarioPayload(
  payload: WeatherScenarioPayload,
): Pick<
  SimulationStoreState,
  | 'activeScenario'
  | 'frames'
  | 'summary'
  | 'currentFrameIndex'
  | 'isPlaying'
  | 'scenarioError'
  | 'manualInterlockState'
> {
  const sim = runDualTrackSimulation(payload, { dtSec: 60 });
  return {
    activeScenario: payload,
    frames: sim.frames,
    summary: sim.summary,
    currentFrameIndex: 0,
    isPlaying: false,
    scenarioError: null,
    manualInterlockState: createInitialInterlockState(),
  };
}

export const useSimulationStore = create<SimulationStoreState>((set, get) => ({
  activeScenario: initialScenario,
  isLoadingScenario: false,
  scenarioError: null,

  frames: initialSim.frames,
  summary: initialSim.summary,

  isPlaying: false,
  playbackSpeed: 60,
  currentFrameIndex: 0,

  controlMode: 'AUTO_AI',
  manualGateTargetM: 1.5,
  downstreamOverrideEnabled: false,
  downstreamOverrideLevelM: 1.4,
  manualInterlockState: createInitialInterlockState(),
  interlockEvents: [],

  cameraPreset: 'OVERVIEW',
  showTraditionalGhostIn3D: true,
  isSwaggerModalOpen: false,

  selectPresetScenario: (presetId) => {
    const payload = loadPresetScenario(presetId);
    set({
      ...applyScenarioPayload(payload),
      downstreamOverrideEnabled: false,
    });
  },

  selectLiveWeather: async () => {
    set({ isLoadingScenario: true, scenarioError: null });
    try {
      const payload = await loadLiveWeather({ forceRefresh: true });
      set({
        ...applyScenarioPayload(payload),
        isLoadingScenario: false,
        downstreamOverrideEnabled: false,
      });
    } catch (error) {
      set({
        isLoadingScenario: false,
        scenarioError: (error as Error).message,
      });
    }
  },

  applyCustomJsonScenario: (rawJson) => {
    const payload = injectCustomScenario(rawJson);
    set({
      ...applyScenarioPayload(payload),
      isSwaggerModalOpen: false,
      downstreamOverrideEnabled: false,
    });
  },

  applyParametricScenario: (params) => {
    const payload = buildParametricScenario(params);
    set({
      ...applyScenarioPayload(payload),
      isSwaggerModalOpen: false,
      downstreamOverrideEnabled: false,
    });
  },

  applyCustomUrlScenario: async (url) => {
    set({ isLoadingScenario: true, scenarioError: null });
    try {
      const payload = await fetchCustomScenarioFromUrl(url);
      set({
        ...applyScenarioPayload(payload),
        isLoadingScenario: false,
        isSwaggerModalOpen: false,
        downstreamOverrideEnabled: false,
      });
    } catch (error) {
      set({
        isLoadingScenario: false,
        scenarioError: (error as Error).message,
      });
      throw error;
    }
  },

  play: () => {
    const { currentFrameIndex, frames } = get();
    if (currentFrameIndex >= frames.length - 1) {
      set({ currentFrameIndex: 0, isPlaying: true });
    } else {
      set({ isPlaying: true });
    }
  },

  pause: () => set({ isPlaying: false }),

  togglePlay: () => {
    const { isPlaying, play, pause } = get();
    if (isPlaying) pause();
    else play();
  },

  stepForward: () => {
    const { currentFrameIndex, frames } = get();
    const nextIndex = Math.min(currentFrameIndex + 1, frames.length - 1);
    set({
      currentFrameIndex: nextIndex,
      isPlaying: nextIndex < frames.length - 1 ? get().isPlaying : false,
    });
  },

  stepBackward: () => {
    const { currentFrameIndex } = get();
    set({ currentFrameIndex: Math.max(0, currentFrameIndex - 1), isPlaying: false });
  },

  resetPlayback: () => {
    set({
      currentFrameIndex: 0,
      isPlaying: false,
      manualInterlockState: createInitialInterlockState(),
    });
  },

  seekToFrame: (index) => {
    const { frames } = get();
    const clamped = Math.min(Math.max(0, index), frames.length - 1);
    set({ currentFrameIndex: clamped });
  },

  setPlaybackSpeed: (speed) => set({ playbackSpeed: speed }),

  setControlMode: (mode) => {
    set({
      controlMode: mode,
      manualInterlockState: createInitialInterlockState(),
    });
  },

  setManualGateTarget: (openingM) => {
    const clamped = Math.min(Math.max(openingM, 0), GATE_MAX_OPENING_M);
    const state = get();
    const baseFrame = state.frames[state.currentFrameIndex];
    if (!baseFrame) {
      set({ manualGateTargetM: clamped });
      return;
    }

    const downLevel = state.downstreamOverrideEnabled
      ? state.downstreamOverrideLevelM
      : baseFrame.downstreamLevelM;

    const monitor = monitorActiveDischarge(
      {
        wetlandLevelM: baseFrame.smart.waterLevelM,
        downstreamLevelM: downLevel,
        requestedGateOpeningM: clamped,
        simTimeSec: baseFrame.simTimeSec,
      },
      state.manualInterlockState,
    );

    const events = monitor.event
      ? [monitor.event, ...state.interlockEvents].slice(0, 15)
      : state.interlockEvents;

    set({
      manualGateTargetM: clamped,
      manualInterlockState: monitor.nextState,
      interlockEvents: events,
    });
  },

  setDownstreamOverride: (enabled, levelM) => {
    const state = get();
    const baseFrame = state.frames[state.currentFrameIndex];
    const nextLevel = levelM ?? (baseFrame?.downstreamLevelM ?? 1.4);

    if (!enabled || !baseFrame) {
      set({
        downstreamOverrideEnabled: enabled,
        downstreamOverrideLevelM: nextLevel,
        manualInterlockState: createInitialInterlockState(),
      });
      return;
    }

    const requestedGate =
      state.controlMode === 'MANUAL_OVERRIDE'
        ? state.manualGateTargetM
        : baseFrame.smart.targetGateOpeningM;

    const monitor = monitorActiveDischarge(
      {
        wetlandLevelM: baseFrame.smart.waterLevelM,
        downstreamLevelM: nextLevel,
        requestedGateOpeningM: requestedGate,
        simTimeSec: baseFrame.simTimeSec,
      },
      state.manualInterlockState,
    );

    const events = monitor.event
      ? [monitor.event, ...state.interlockEvents].slice(0, 15)
      : state.interlockEvents;

    set({
      downstreamOverrideEnabled: true,
      downstreamOverrideLevelM: nextLevel,
      manualInterlockState: monitor.nextState,
      interlockEvents: events,
    });
  },

  resetInterlockLatch: () => {
    set({ manualInterlockState: createInitialInterlockState() });
  },

  setCameraPreset: (preset) => set({ cameraPreset: preset }),
  toggleTraditionalGhost: () =>
    set((s) => ({ showTraditionalGhostIn3D: !s.showTraditionalGhostIn3D })),
  setSwaggerModalOpen: (open) => set({ isSwaggerModalOpen: open }),
  clearError: () => set({ scenarioError: null }),
}));

/**
 * Derive the effective real-time telemetry state for the current frame,
 * blending any active Manual Gate Override or Live Downstream Surge Override
 * through the Downstream Safety Interlock.
 */
export function selectEffectiveFrame(state: SimulationStoreState): EffectiveFrameState {
  const frame = state.frames[state.currentFrameIndex] ?? state.frames[0]!;
  const downstreamLevelM = state.downstreamOverrideEnabled
    ? state.downstreamOverrideLevelM
    : frame.downstreamLevelM;

  // Fast path: pure AI timeline without overrides
  if (state.controlMode === 'AUTO_AI' && !state.downstreamOverrideEnabled) {
    return {
      simTimeSec: frame.simTimeSec,
      hourOffset: frame.hourOffset,
      rainfallIntensityMmPerHr: frame.rainfallIntensityMmPerHr,
      soilSaturation: frame.soilSaturation,
      wetlandLevelM: frame.smart.waterLevelM,
      measuredWetlandLevelM: frame.smart.measuredWaterLevelM,
      traditionalLevelM: frame.traditional.waterLevelM,
      traditionalOutflowM3PerS: frame.traditional.outflowM3PerS,
      traditionalIsSpilling: frame.traditional.isSpilling,
      downstreamLevelM: frame.downstreamLevelM,
      inflowM3PerS: frame.smart.inflowM3PerS,
      outflowM3PerS: frame.smart.outflowM3PerS,
      gateOpeningM: frame.smart.gateOpeningM,
      targetGateOpeningM: frame.smart.targetGateOpeningM,
      phase: frame.smart.phase,
      decisionReason: frame.smart.decisionReason,
      canDischarge: frame.smart.canDischarge,
      activeLockout: frame.smart.activeLockout,
      interlockReasonCode: frame.smart.interlockReasonCode,
      interlockDiagnostic: frame.smart.interlockDiagnostic,
      availableBufferM3: frame.smart.availableBufferM3,
      forecast6hRainMm: frame.smart.forecast6hRainMm,
      isSpilling: frame.smart.isSpilling,
    };
  }

  // Interactive override path: re-evaluate interlock & gate hydraulics live
  const requestedGateM =
    state.controlMode === 'MANUAL_OVERRIDE'
      ? state.manualGateTargetM
      : frame.smart.targetGateOpeningM;

  const preEval = evaluatePreDischargeSafety(
    {
      wetlandLevelM: frame.smart.waterLevelM,
      downstreamLevelM,
      requestedGateOpeningM: requestedGateM,
      simTimeSec: frame.simTimeSec,
    },
    undefined,
    state.manualInterlockState,
  );

  const appliedGateM = preEval.canDischarge ? preEval.recommendedGateOpeningM : 0;

  const discharge = calculateGateDischarge({
    wetlandLevelM: frame.smart.waterLevelM,
    downstreamLevelM,
    gateOpeningM: appliedGateM,
  });

  const cEff = calculateEffectiveRunoffCoefficient(frame.soilSaturation);
  const qIn = calculateRunoffInflow({
    rainfallIntensityMmPerHr: frame.rainfallIntensityMmPerHr,
    runoffCoefficient: cEff,
    catchmentAreaHa: DEFAULT_CATCHMENT_AREA_HA,
  });

  const phase: ControlPhase = !preEval.canDischarge
    ? 'INTERLOCK_SUSPENDED'
    : state.controlMode === 'MANUAL_OVERRIDE'
      ? frame.smart.phase
      : frame.smart.phase;

  const decisionReason = !preEval.canDischarge
    ? `[安全联锁强制拦截] ${preEval.diagnosticMessage}`
    : state.controlMode === 'MANUAL_OVERRIDE'
      ? `[人工干预模式] 操作员请求开度 ${requestedGateM.toFixed(2)} m，下游安全校验通过，执行开度 ${appliedGateM.toFixed(2)} m。`
      : frame.smart.decisionReason;

  return {
    simTimeSec: frame.simTimeSec,
    hourOffset: frame.hourOffset,
    rainfallIntensityMmPerHr: frame.rainfallIntensityMmPerHr,
    soilSaturation: frame.soilSaturation,
    wetlandLevelM: frame.smart.waterLevelM,
    measuredWetlandLevelM: frame.smart.measuredWaterLevelM,
    traditionalLevelM: frame.traditional.waterLevelM,
    traditionalOutflowM3PerS: frame.traditional.outflowM3PerS,
    traditionalIsSpilling: frame.traditional.isSpilling,
    downstreamLevelM,
    inflowM3PerS: Math.round(qIn * 100) / 100,
    outflowM3PerS: Math.round(discharge.dischargeRateM3PerS * 100) / 100,
    gateOpeningM: appliedGateM,
    targetGateOpeningM: requestedGateM,
    phase,
    decisionReason,
    canDischarge: preEval.canDischarge,
    activeLockout: preEval.activeLockout,
    interlockReasonCode: preEval.reasonCode,
    interlockDiagnostic: preEval.diagnosticMessage,
    availableBufferM3: Math.round(
      calculateAvailableStorage({ currentLevelM: frame.smart.waterLevelM }),
    ),
    forecast6hRainMm: frame.smart.forecast6hRainMm,
    isSpilling: frame.smart.isSpilling,
  };
}
