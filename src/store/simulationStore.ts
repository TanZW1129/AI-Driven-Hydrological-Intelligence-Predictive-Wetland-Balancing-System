/**
 * @file simulationStore.ts
 * @description Zustand reactive store for the BBR digital twin command centre.
 *
 * Two fully decoupled operating modes share one rendering pipeline:
 *
 *   LIVE        — Real-time operation anchored to the wall clock (UTC+8).
 *                 The timeline covers a model hindcast before NOW plus an
 *                 Open-Meteo forecast-driven projection after NOW. The cursor
 *                 follows real time automatically; operators may scrub ahead
 *                 to inspect planned gate operations and projected levels.
 *
 *   SIMULATION  — Custom scenario studio. No hard-coded presets are exposed;
 *                 operators supply their own data via the parametric builder,
 *                 raw Swagger JSON, or a remote URL, then replay the run with
 *                 transport controls and interlock stress-testing tools.
 *
 * Each mode keeps its own session (scenario, frames, summary, cursor), so
 * switching modes never discards the other mode's state.
 */

import { create } from 'zustand';
import {
  DEFAULT_CATCHMENT_AREA_HA,
  GATE_MAX_OPENING_M,
} from '../constants/hydrologyConstants';
import {
  LIVE_FORECAST_HOURS,
  LIVE_LOOKBACK_HOURS,
  LIVE_REFRESH_INTERVAL_MS,
} from '../constants/weatherConstants';
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
import { floorToHour } from '../services/weather/scenarioBuilder';
import {
  DEFAULT_SIMULATION_FORM,
  formValuesToParametricInput,
  type SimulationFormValues,
} from '../services/weather/simulationDefaults';
import {
  buildOfflineLiveBaseline,
  buildParametricScenario,
  fetchCustomScenarioFromUrl,
  injectCustomScenario,
  loadLiveOperationalWeather,
} from '../services/weather/weatherAdapter';
import type { WeatherScenarioPayload } from '../services/weather/weatherTypes';
import type {
  ControlPhase,
  InterlockEvent,
  InterlockReasonCode,
  InterlockState,
} from '../types/hydrology';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type AppMode = 'LIVE' | 'SIMULATION';
export type CameraViewPreset = 'OVERVIEW' | 'GATE' | 'WETLAND' | 'DOWNSTREAM';
export type ControlMode = 'AUTO_AI' | 'MANUAL_OVERRIDE';
export type LiveSyncStatus = 'SYNCING' | 'ONLINE' | 'OFFLINE_FALLBACK';

/** Simulation frames are sampled every 5 minutes by the dual-track engine. */
export const FRAME_INTERVAL_SEC = 300;
const FRAME_INTERVAL_MS = FRAME_INTERVAL_SEC * 1_000;
const FRAMES_PER_HOUR = 3_600 / FRAME_INTERVAL_SEC;
const MS_PER_HOUR = 3_600_000;

export interface ModeSession {
  activeScenario: WeatherScenarioPayload;
  frames: SimulationFrame[];
  summary: DualTrackComparisonSummary;
  currentFrameIndex: number;
}

export interface LiveClockState {
  status: LiveSyncStatus;
  lastSyncMs: number | null;
  nowMs: number;
  nowFrameIndex: number;
  /** When true the cursor tracks the wall clock automatically. */
  followNow: boolean;
  warning: string | null;
}

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

export interface TimeContext {
  mode: AppMode;
  /** Absolute epoch of frame 0. */
  seriesStartMs: number;
  /** Absolute epoch of the frame under the cursor. */
  cursorMs: number;
  /** Seconds since the start of the series (relative simulation clock). */
  elapsedSec: number;
  /** LIVE only: cursor offset from the wall clock (s); 0 in SIMULATION. */
  offsetFromNowSec: number;
  /** LIVE only: frame index aligned with the wall clock. */
  nowFrameIndex: number;
  isForecast: boolean;
  isHindcast: boolean;
}

export interface SimulationStoreState extends ModeSession {
  appMode: AppMode;
  inactiveSessions: Record<AppMode, ModeSession | null>;
  live: LiveClockState;
  simulationForm: SimulationFormValues;

  isLoadingScenario: boolean;
  scenarioError: string | null;

  // Playback (SIMULATION only)
  isPlaying: boolean;
  playbackSpeed: number;

  // Interlock stress-test overrides (SIMULATION only)
  controlMode: ControlMode;
  manualGateTargetM: number;
  downstreamOverrideEnabled: boolean;
  downstreamOverrideLevelM: number;
  manualInterlockState: InterlockState;
  interlockEvents: InterlockEvent[];

  // 3D viewport & UI
  cameraPreset: CameraViewPreset;
  showTraditionalGhostIn3D: boolean;
  isSwaggerModalOpen: boolean;

  // Mode management
  setAppMode: (mode: AppMode) => void;

  // LIVE actions
  refreshLiveData: (nowMs?: number) => Promise<void>;
  tickLiveClock: (nowMs?: number) => void;
  jumpToNow: () => void;

  // SIMULATION scenario actions
  updateSimulationForm: (patch: Partial<SimulationFormValues>) => void;
  applySimulationForm: () => void;
  resetSimulationForm: () => void;
  applyCustomJsonScenario: (rawJson: unknown) => void;
  applyParametricScenario: (params: unknown) => void;
  applyCustomUrlScenario: (url: string) => Promise<void>;

  // Timeline
  play: () => void;
  pause: () => void;
  togglePlay: () => void;
  stepForward: () => void;
  stepBackward: () => void;
  stepBy: (frameDelta: number) => void;
  resetPlayback: () => void;
  seekToFrame: (index: number) => void;
  setPlaybackSpeed: (speed: number) => void;

  // Interlock stress testing
  setControlMode: (mode: ControlMode) => void;
  setManualGateTarget: (openingM: number) => void;
  setDownstreamOverride: (enabled: boolean, levelM?: number) => void;
  resetInterlockLatch: () => void;

  // UI
  setCameraPreset: (preset: CameraViewPreset) => void;
  toggleTraditionalGhost: () => void;
  setSwaggerModalOpen: (open: boolean) => void;
  clearError: () => void;
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

function clampIndex(index: number, frames: readonly SimulationFrame[]): number {
  if (!Number.isFinite(index)) return 0;
  return Math.min(Math.max(0, Math.round(index)), Math.max(0, frames.length - 1));
}

/** Absolute epoch (ms) of the first hourly point of a scenario. */
export function getSeriesStartMs(scenario: WeatherScenarioPayload): number {
  const iso = scenario.hourlySeries[0]?.timeIso;
  const parsed = iso !== undefined ? Date.parse(iso) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Frame index aligned with a wall-clock instant, clamped to the series. */
export function computeNowFrameIndex(
  frames: readonly SimulationFrame[],
  seriesStartMs: number,
  nowMs: number,
): number {
  return clampIndex(Math.floor((nowMs - seriesStartMs) / FRAME_INTERVAL_MS), frames);
}

function buildSession(payload: WeatherScenarioPayload, currentFrameIndex = 0): ModeSession {
  const sim = runDualTrackSimulation(payload, { dtSec: 60 });
  return {
    activeScenario: payload,
    frames: sim.frames,
    summary: sim.summary,
    currentFrameIndex: clampIndex(currentFrameIndex, sim.frames),
  };
}

function snapshotSession(state: ModeSession): ModeSession {
  return {
    activeScenario: state.activeScenario,
    frames: state.frames,
    summary: state.summary,
    currentFrameIndex: state.currentFrameIndex,
  };
}

/** Reset values for all interlock stress-test overrides. */
function clearedOverrides(): Pick<
  SimulationStoreState,
  | 'controlMode'
  | 'downstreamOverrideEnabled'
  | 'manualInterlockState'
  | 'interlockEvents'
  | 'isPlaying'
> {
  return {
    controlMode: 'AUTO_AI',
    downstreamOverrideEnabled: false,
    manualInterlockState: createInitialInterlockState(),
    interlockEvents: [],
    isPlaying: false,
  };
}

function buildInitialLiveSession(nowMs: number): ModeSession {
  const windowStartMs = floorToHour(nowMs) - LIVE_LOOKBACK_HOURS * MS_PER_HOUR;
  const baseline = buildOfflineLiveBaseline(
    windowStartMs,
    LIVE_LOOKBACK_HOURS + LIVE_FORECAST_HOURS,
    nowMs,
    'Awaiting first Open-Meteo synchronisation.',
  );
  const session = buildSession(baseline);
  session.currentFrameIndex = computeNowFrameIndex(session.frames, windowStartMs, nowMs);
  return session;
}

function buildSimulationSession(form: SimulationFormValues): ModeSession {
  return buildSession(buildParametricScenario(formValuesToParametricInput(form)));
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

const bootNowMs = Date.now();
const initialLiveSession = buildInitialLiveSession(bootNowMs);

/** Monotonic token used to discard out-of-order live refresh responses. */
let liveRequestToken = 0;

export const useSimulationStore = create<SimulationStoreState>((set, get) => {
  /** Activate a new SIMULATION session (switching mode if necessary). */
  const activateSimulationSession = (session: ModeSession, extra: Partial<SimulationStoreState> = {}) => {
    const state = get();
    const inactiveSessions = { ...state.inactiveSessions };
    if (state.appMode === 'LIVE') {
      inactiveSessions.LIVE = snapshotSession(state);
    }
    inactiveSessions.SIMULATION = null;
    set({
      ...session,
      ...clearedOverrides(),
      appMode: 'SIMULATION',
      inactiveSessions,
      scenarioError: null,
      ...extra,
    });
  };

  return {
    ...initialLiveSession,
    appMode: 'LIVE',
    inactiveSessions: { LIVE: null, SIMULATION: null },
    live: {
      status: 'SYNCING',
      lastSyncMs: null,
      nowMs: bootNowMs,
      nowFrameIndex: initialLiveSession.currentFrameIndex,
      followNow: true,
      warning: null,
    },
    simulationForm: { ...DEFAULT_SIMULATION_FORM },

    isLoadingScenario: false,
    scenarioError: null,

    isPlaying: false,
    playbackSpeed: 60,

    controlMode: 'AUTO_AI',
    manualGateTargetM: 1.5,
    downstreamOverrideEnabled: false,
    downstreamOverrideLevelM: 1.4,
    manualInterlockState: createInitialInterlockState(),
    interlockEvents: [],

    cameraPreset: 'OVERVIEW',
    showTraditionalGhostIn3D: true,
    isSwaggerModalOpen: false,

    // -----------------------------------------------------------------------
    // Mode management
    // -----------------------------------------------------------------------

    setAppMode: (mode) => {
      const state = get();
      if (state.appMode === mode) return;

      const inactiveSessions = { ...state.inactiveSessions };
      inactiveSessions[state.appMode] = snapshotSession(state);

      if (mode === 'SIMULATION') {
        const session = inactiveSessions.SIMULATION ?? buildSimulationSession(state.simulationForm);
        inactiveSessions.SIMULATION = null;
        set({
          ...session,
          ...clearedOverrides(),
          appMode: 'SIMULATION',
          inactiveSessions,
          scenarioError: null,
          isSwaggerModalOpen: false,
        });
        return;
      }

      const liveSession = inactiveSessions.LIVE ?? buildInitialLiveSession(Date.now());
      inactiveSessions.LIVE = null;
      const nowMs = Date.now();
      const nowFrameIndex = computeNowFrameIndex(
        liveSession.frames,
        getSeriesStartMs(liveSession.activeScenario),
        nowMs,
      );
      set({
        ...liveSession,
        currentFrameIndex: nowFrameIndex,
        ...clearedOverrides(),
        appMode: 'LIVE',
        inactiveSessions,
        scenarioError: null,
        isSwaggerModalOpen: false,
        live: { ...state.live, nowMs, nowFrameIndex, followNow: true },
      });

      const { lastSyncMs } = get().live;
      if (lastSyncMs === null || nowMs - lastSyncMs >= LIVE_REFRESH_INTERVAL_MS) {
        void get().refreshLiveData(nowMs);
      }
    },

    // -----------------------------------------------------------------------
    // LIVE actions
    // -----------------------------------------------------------------------

    refreshLiveData: async (nowMsArg) => {
      const token = ++liveRequestToken;
      const nowMs = nowMsArg ?? Date.now();
      set((s) => ({ live: { ...s.live, status: 'SYNCING' } }));

      const payload = await loadLiveOperationalWeather({ nowMs });
      if (token !== liveRequestToken) return; // superseded by a newer request

      const session = buildSession(payload);
      const seriesStartMs = getSeriesStartMs(payload);
      const nowFrameIndex = computeNowFrameIndex(session.frames, seriesStartMs, nowMs);
      const isFallback = payload.metadata.isFallback;
      const nextLive: Partial<LiveClockState> = {
        status: isFallback ? 'OFFLINE_FALLBACK' : 'ONLINE',
        lastSyncMs: nowMs,
        nowMs,
        nowFrameIndex,
        warning: isFallback ? (payload.metadata.warnings[0] ?? 'Open-Meteo unavailable.') : null,
      };

      const state = get();
      if (state.appMode === 'LIVE') {
        // Preserve the operator's view: follow NOW, or keep the same absolute instant.
        let cursor = nowFrameIndex;
        if (!state.live.followNow) {
          const previousStartMs = getSeriesStartMs(state.activeScenario);
          const cursorMs = previousStartMs + state.currentFrameIndex * FRAME_INTERVAL_MS;
          cursor = clampIndex((cursorMs - seriesStartMs) / FRAME_INTERVAL_MS, session.frames);
        }
        set({
          ...session,
          currentFrameIndex: cursor,
          live: { ...state.live, ...nextLive },
        });
      } else {
        set({
          inactiveSessions: {
            ...state.inactiveSessions,
            LIVE: { ...session, currentFrameIndex: nowFrameIndex },
          },
          live: { ...state.live, ...nextLive, followNow: true },
        });
      }
    },

    tickLiveClock: (nowMsArg) => {
      const nowMs = nowMsArg ?? Date.now();
      const state = get();
      const liveSession = state.appMode === 'LIVE' ? state : state.inactiveSessions.LIVE;
      if (!liveSession) return;

      const nowFrameIndex = computeNowFrameIndex(
        liveSession.frames,
        getSeriesStartMs(liveSession.activeScenario),
        nowMs,
      );

      if (state.appMode === 'LIVE') {
        set({
          live: { ...state.live, nowMs, nowFrameIndex },
          ...(state.live.followNow ? { currentFrameIndex: nowFrameIndex } : {}),
        });
      } else {
        set({ live: { ...state.live, nowMs, nowFrameIndex } });
      }

      const { lastSyncMs, status } = get().live;
      const stale = lastSyncMs === null || nowMs - lastSyncMs >= LIVE_REFRESH_INTERVAL_MS;
      if (state.appMode === 'LIVE' && stale && status !== 'SYNCING') {
        void get().refreshLiveData(nowMs);
      }
    },

    jumpToNow: () => {
      const state = get();
      if (state.appMode !== 'LIVE') return;
      const nowMs = Date.now();
      const nowFrameIndex = computeNowFrameIndex(
        state.frames,
        getSeriesStartMs(state.activeScenario),
        nowMs,
      );
      set({
        currentFrameIndex: nowFrameIndex,
        live: { ...state.live, nowMs, nowFrameIndex, followNow: true },
      });
    },

    // -----------------------------------------------------------------------
    // SIMULATION scenario actions
    // -----------------------------------------------------------------------

    updateSimulationForm: (patch) =>
      set((s) => ({ simulationForm: { ...s.simulationForm, ...patch } })),

    applySimulationForm: () => {
      const session = buildSimulationSession(get().simulationForm);
      activateSimulationSession(session, { isSwaggerModalOpen: false });
    },

    resetSimulationForm: () => set({ simulationForm: { ...DEFAULT_SIMULATION_FORM } }),

    applyCustomJsonScenario: (rawJson) => {
      const session = buildSession(injectCustomScenario(rawJson));
      activateSimulationSession(session, { isSwaggerModalOpen: false });
    },

    applyParametricScenario: (params) => {
      const session = buildSession(buildParametricScenario(params));
      activateSimulationSession(session, { isSwaggerModalOpen: false });
    },

    applyCustomUrlScenario: async (url) => {
      set({ isLoadingScenario: true, scenarioError: null });
      try {
        const payload = await fetchCustomScenarioFromUrl(url);
        activateSimulationSession(buildSession(payload), {
          isLoadingScenario: false,
          isSwaggerModalOpen: false,
        });
      } catch (error) {
        set({ isLoadingScenario: false, scenarioError: (error as Error).message });
        throw error;
      }
    },

    // -----------------------------------------------------------------------
    // Timeline
    // -----------------------------------------------------------------------

    play: () => {
      const { appMode, currentFrameIndex, frames } = get();
      if (appMode !== 'SIMULATION') return;
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
      const { currentFrameIndex, frames, isPlaying } = get();
      const nextIndex = Math.min(currentFrameIndex + 1, frames.length - 1);
      set({
        currentFrameIndex: nextIndex,
        isPlaying: nextIndex < frames.length - 1 ? isPlaying : false,
      });
    },

    stepBackward: () => {
      const { currentFrameIndex } = get();
      set({ currentFrameIndex: Math.max(0, currentFrameIndex - 1), isPlaying: false });
    },

    stepBy: (frameDelta) => {
      const { currentFrameIndex, seekToFrame } = get();
      seekToFrame(currentFrameIndex + frameDelta);
    },

    resetPlayback: () => {
      set({
        currentFrameIndex: 0,
        isPlaying: false,
        manualInterlockState: createInitialInterlockState(),
      });
    },

    seekToFrame: (index) => {
      const state = get();
      const clamped = clampIndex(index, state.frames);
      if (state.appMode === 'LIVE') {
        set({
          currentFrameIndex: clamped,
          live: { ...state.live, followNow: clamped === state.live.nowFrameIndex },
        });
      } else {
        set({ currentFrameIndex: clamped });
      }
    },

    setPlaybackSpeed: (speed) => set({ playbackSpeed: speed }),

    // -----------------------------------------------------------------------
    // Interlock stress testing (SIMULATION only)
    // -----------------------------------------------------------------------

    setControlMode: (mode) => {
      if (get().appMode !== 'SIMULATION') return;
      set({ controlMode: mode, manualInterlockState: createInitialInterlockState() });
    },

    setManualGateTarget: (openingM) => {
      const state = get();
      if (state.appMode !== 'SIMULATION') return;
      const clamped = Math.min(Math.max(openingM, 0), GATE_MAX_OPENING_M);
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

      set({
        manualGateTargetM: clamped,
        manualInterlockState: monitor.nextState,
        interlockEvents: monitor.event
          ? [monitor.event, ...state.interlockEvents].slice(0, 15)
          : state.interlockEvents,
      });
    },

    setDownstreamOverride: (enabled, levelM) => {
      const state = get();
      if (state.appMode !== 'SIMULATION') return;
      const baseFrame = state.frames[state.currentFrameIndex];
      const nextLevel = levelM ?? baseFrame?.downstreamLevelM ?? 1.4;

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

      set({
        downstreamOverrideEnabled: true,
        downstreamOverrideLevelM: nextLevel,
        manualInterlockState: monitor.nextState,
        interlockEvents: monitor.event
          ? [monitor.event, ...state.interlockEvents].slice(0, 15)
          : state.interlockEvents,
      });
    },

    resetInterlockLatch: () => set({ manualInterlockState: createInitialInterlockState() }),

    // -----------------------------------------------------------------------
    // UI
    // -----------------------------------------------------------------------

    setCameraPreset: (preset) => set({ cameraPreset: preset }),
    toggleTraditionalGhost: () =>
      set((s) => ({ showTraditionalGhostIn3D: !s.showTraditionalGhostIn3D })),
    setSwaggerModalOpen: (open) => set({ isSwaggerModalOpen: open }),
    clearError: () => set({ scenarioError: null }),
  };
});

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------

/** Wall-clock / relative time context for the frame under the cursor. */
export function selectTimeContext(state: SimulationStoreState): TimeContext {
  const seriesStartMs = getSeriesStartMs(state.activeScenario);
  const frame = state.frames[state.currentFrameIndex] ?? state.frames[0];
  const elapsedSec = frame?.simTimeSec ?? 0;
  const cursorMs = seriesStartMs + elapsedSec * 1_000;

  if (state.appMode === 'LIVE') {
    const isFollowingNow =
      state.live.followNow || state.currentFrameIndex === state.live.nowFrameIndex;
    const effectiveCursorMs = isFollowingNow ? state.live.nowMs : cursorMs;
    const offsetFromNowSec = isFollowingNow
      ? 0
      : Math.round((cursorMs - state.live.nowMs) / 1_000);
    return {
      mode: 'LIVE',
      seriesStartMs,
      cursorMs: effectiveCursorMs,
      elapsedSec,
      offsetFromNowSec,
      nowFrameIndex: state.live.nowFrameIndex,
      isForecast: state.currentFrameIndex > state.live.nowFrameIndex,
      isHindcast: state.currentFrameIndex < state.live.nowFrameIndex,
    };
  }

  return {
    mode: 'SIMULATION',
    seriesStartMs,
    cursorMs,
    elapsedSec,
    offsetFromNowSec: 0,
    nowFrameIndex: -1,
    isForecast: false,
    isHindcast: false,
  };
}

/** Number of frames per hour (exposed for timeline step controls). */
export const TIMELINE_FRAMES_PER_HOUR = FRAMES_PER_HOUR;

/**
 * Derive the effective real-time telemetry state for the current frame,
 * blending any active Manual Gate Override or Downstream Surge Override
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

  const phase: ControlPhase = preEval.canDischarge ? frame.smart.phase : 'INTERLOCK_SUSPENDED';

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
