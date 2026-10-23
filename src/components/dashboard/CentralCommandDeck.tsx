/**
 * @file CentralCommandDeck.tsx
 * @description Bottom centralized data & control command deck.
 * Consolidates KPIs, AI state-machine rationale, full-lifecycle downstream
 * safety interlock verification, custom API scenario studio, and the 24h/30h
 * hydrograph into a single clean, zero-scroll split deck below the 3D canvas.
 */

import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  Lock,
  Play,
  Radio,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Sliders,
  Terminal,
  Unlock,
  XCircle,
  Zap,
} from 'lucide-react';
import { useState } from 'react';
import {
  DOWNSTREAM_CRITICAL_LEVEL_M,
  GATE_MAX_OPENING_M,
  H_MAX_CRITICAL_M,
  H_MIN_ECOLOGICAL_M,
  MIN_SAFE_HEAD_DIFFERENCE_M,
} from '../../constants/hydrologyConstants';
import type { StormProfileShape } from '../../services/weather/weatherTypes';
import {
  selectEffectiveFrame,
  useSimulationStore,
} from '../../store/simulationStore';
import type { ControlPhase } from '../../types/hydrology';
import { HydrographChart } from './HydrographChart';

type DeckTab = 'TELEMETRY' | 'INTERLOCK' | 'CUSTOM_STUDIO';

const PHASE_BADGE: Readonly<
  Record<ControlPhase, { label: string; badgeClass: string; dotClass: string }>
> = {
  NORMAL: {
    label: 'PHASE 0 · Baseline Retention (2.0m)',
    badgeClass: 'border-emerald-500/50 bg-emerald-950/70 text-emerald-300',
    dotClass: 'bg-emerald-400',
  },
  PRE_DISCHARGE: {
    label: 'PHASE 1 · Predictive Pre-Discharge (→1.0m)',
    badgeClass: 'border-blue-500/60 bg-blue-950/70 text-blue-300',
    dotClass: 'bg-blue-400 animate-ping',
  },
  PEAK_SHAVING: {
    label: 'PHASE 2 · Peak Shaving (Gates Closed)',
    badgeClass: 'border-amber-500/60 bg-amber-950/70 text-amber-300',
    dotClass: 'bg-amber-400 animate-pulse',
  },
  RECOVERY: {
    label: 'PHASE 3 · Controlled Drainage Recovery (→2.0m)',
    badgeClass: 'border-purple-500/60 bg-purple-950/70 text-purple-300',
    dotClass: 'bg-purple-400',
  },
  INTERLOCK_SUSPENDED: {
    label: 'EMERGENCY HALT · Interlock Tripped (0m)',
    badgeClass: 'border-red-500/80 bg-red-950/85 text-red-200 animate-pulse',
    dotClass: 'bg-red-500 animate-ping',
  },
};

export function CentralCommandDeck() {
  const state = useSimulationStore();
  const effective = selectEffectiveFrame(state);
  const { summary, simulationForm } = state;

  const [activeTab, setActiveTab] = useState<DeckTab>('TELEMETRY');

  const phaseInfo = PHASE_BADGE[effective.phase];
  const headDiffM = effective.wetlandLevelM - effective.downstreamLevelM;
  const gateOpenPct = Math.round(
    (effective.gateOpeningM / GATE_MAX_OPENING_M) * 100,
  );
  const capacityPct = Math.min(
    100,
    Math.max(
      0,
      ((effective.wetlandLevelM - H_MIN_ECOLOGICAL_M) /
        (H_MAX_CRITICAL_M - H_MIN_ECOLOGICAL_M)) *
        100,
    ),
  );

  // 3-point downstream safety criteria checks
  const checkHeadOk = headDiffM >= MIN_SAFE_HEAD_DIFFERENCE_M;
  const checkDownstreamOk =
    effective.downstreamLevelM < DOWNSTREAM_CRITICAL_LEVEL_M;
  const checkEcologicalOk = effective.wetlandLevelM > H_MIN_ECOLOGICAL_M;

  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-12">
      {/* Left 5 Columns: Tabbed Telemetry, Safety Interlock & Custom Scenario Studio */}
      <div className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-slate-800 bg-slate-900/90 shadow-xl lg:col-span-5">
        {/* Tab Bar Header */}
        <div className="flex items-center justify-between border-b border-slate-800 bg-slate-950/80 px-3 py-1.5">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setActiveTab('TELEMETRY')}
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                activeTab === 'TELEMETRY'
                  ? 'bg-cyan-600 text-white shadow'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <Activity className="h-3.5 w-3.5" /> Live Telemetry &amp; KPIs
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('INTERLOCK')}
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                activeTab === 'INTERLOCK'
                  ? 'bg-amber-600 text-white shadow'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-white'
              }`}
            >
              {effective.canDischarge ? (
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
              ) : (
                <ShieldAlert className="h-3.5 w-3.5 text-red-400 animate-bounce" />
              )}
              Safety Interlock Guard
            </button>

            <button
              type="button"
              onClick={() => {
                if (state.appMode !== 'SIMULATION') {
                  state.setAppMode('SIMULATION');
                }
                setActiveTab('CUSTOM_STUDIO');
              }}
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                activeTab === 'CUSTOM_STUDIO'
                  ? 'bg-purple-600 text-white shadow'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <Sliders className="h-3.5 w-3.5" /> Custom Studio
            </button>
          </div>

          <span
            className={`hidden items-center gap-1.5 rounded-md border px-2 py-0.5 font-mono text-[10px] font-bold xl:inline-flex ${phaseInfo.badgeClass}`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${phaseInfo.dotClass}`} />
            {effective.phase}
          </span>
        </div>

        {/* Tab Body Content */}
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {/* TAB 1: TELEMETRY & KPI GRID */}
          {activeTab === 'TELEMETRY' && (
            <div className="flex h-full flex-col justify-between gap-2.5">
              {/* 2x2 Compact KPI Grid */}
              <div className="grid grid-cols-2 gap-2.5">
                {/* Tile 1: Wetland Level & Storage */}
                <div className="rounded-lg border border-slate-800 bg-slate-950/75 p-2.5">
                  <div className="flex items-center justify-between text-[11px] text-slate-400">
                    <span>125-Acre Wetland Level</span>
                    <span className="font-mono text-sky-400">
                      Filled {capacityPct.toFixed(0)}%
                    </span>
                  </div>
                  <div className="mt-1 flex items-baseline justify-between font-mono">
                    <div>
                      <span className="text-xl font-bold text-white">
                        {effective.wetlandLevelM.toFixed(2)}
                      </span>
                      <span className="ml-0.5 text-xs text-slate-400">m</span>
                    </div>
                    <span className="text-[11px] text-orange-300">
                      Baseline: {effective.traditionalLevelM.toFixed(2)}m
                    </span>
                  </div>
                  <div className="mt-1 font-mono text-[10px] text-slate-400">
                    Buffer Avail: {effective.availableBufferM3.toLocaleString()} m³
                  </div>
                </div>

                {/* Tile 2: Inflow / Outflow & Gate */}
                <div className="rounded-lg border border-slate-800 bg-slate-950/75 p-2.5">
                  <div className="flex items-center justify-between text-[11px] text-slate-400">
                    <span>Flow Balance &amp; Gates</span>
                    <span className="font-mono text-cyan-300">
                      Opening {effective.gateOpeningM.toFixed(2)}m ({gateOpenPct}%)
                    </span>
                  </div>
                  <div className="mt-1 flex items-center justify-between font-mono text-xs">
                    <span className="flex items-center gap-0.5 text-sky-300">
                      <ArrowDownRight className="h-3.5 w-3.5" />In:{' '}
                      <strong>{effective.inflowM3PerS.toFixed(1)}</strong> m³/s
                    </span>
                    <span className="flex items-center gap-0.5 text-emerald-300">
                      <ArrowUpRight className="h-3.5 w-3.5" />Out:{' '}
                      <strong>{effective.outflowM3PerS.toFixed(1)}</strong> m³/s
                    </span>
                  </div>
                  <div className="mt-1 font-mono text-[10px] text-slate-400">
                    Rain Rate: {effective.rainfallIntensityMmPerHr} mm/h · Soil Sat:{' '}
                    {(effective.soilSaturation * 100).toFixed(0)}%
                  </div>
                </div>

                {/* Tile 3: Downstream Tide & Interlock */}
                <div className="rounded-lg border border-slate-800 bg-slate-950/75 p-2.5">
                  <div className="flex items-center justify-between text-[11px] text-slate-400">
                    <span>Downstream Klang Tide</span>
                    <span
                      className={`rounded px-1.5 py-0.2 font-mono text-[10px] font-bold ${
                        effective.canDischarge
                          ? 'bg-emerald-950 text-emerald-300'
                          : 'bg-red-950 text-red-300'
                      }`}
                    >
                      {effective.canDischarge ? '✓ Permitted' : '⛔ Interlocked'}
                    </span>
                  </div>
                  <div className="mt-1 flex items-baseline justify-between font-mono">
                    <div>
                      <span
                        className={`text-xl font-bold ${
                          effective.downstreamLevelM >= DOWNSTREAM_CRITICAL_LEVEL_M
                            ? 'text-red-400'
                            : 'text-amber-300'
                        }`}
                      >
                        {effective.downstreamLevelM.toFixed(2)}
                      </span>
                      <span className="ml-0.5 text-xs text-slate-400">m</span>
                    </div>
                    <span className="text-[11px] text-slate-300">
                      ΔH: {headDiffM >= 0 ? `+${headDiffM.toFixed(2)}` : headDiffM.toFixed(2)}m
                    </span>
                  </div>
                  <div className="mt-1 truncate font-mono text-[10px] text-amber-300/90">
                    Status Code: {effective.interlockReasonCode}
                  </div>
                </div>

                {/* Tile 4: Dual-Track Mitigation Impact */}
                <div className="rounded-lg border border-slate-800 bg-slate-950/75 p-2.5">
                  <div className="flex items-center justify-between text-[11px] text-slate-400">
                    <span>Smart Mitigation Impact</span>
                    <span className="font-mono text-emerald-400">
                      Peak Cut {summary.mitigation.peakLevelReductionM.toFixed(2)}m
                    </span>
                  </div>
                  <div className="mt-1 flex items-baseline justify-between font-mono">
                    <span className="text-lg font-bold text-emerald-400">
                      +{summary.mitigation.avoidedOverflowVolumeM3.toLocaleString()}{' '}
                      <span className="text-[10px] font-normal text-slate-400">
                        m³ Overflow Avoided
                      </span>
                    </span>
                  </div>
                  <div className="mt-1 font-mono text-[10px] text-slate-400">
                    Baseline Peak: {summary.traditional.peakWaterLevelM.toFixed(2)}m · Smart Peak:{' '}
                    {summary.smart.peakWaterLevelM.toFixed(2)}m
                  </div>
                </div>
              </div>

              {/* AI State Machine Decision Rationale Strip */}
              <div
                className={`rounded-lg border px-3 py-2 font-mono text-[11px] leading-snug ${
                  !effective.canDischarge
                    ? 'border-red-500/70 bg-red-950/50 text-red-200'
                    : 'border-slate-800 bg-slate-950/90 text-slate-200'
                }`}
              >
                <div className="mb-0.5 flex items-center justify-between text-[10px] text-slate-400">
                  <span className="flex items-center gap-1 font-semibold text-cyan-400">
                    <Radio className="h-3 w-3 animate-pulse" /> {phaseInfo.label}
                  </span>
                  <span>Forecast 6h Rain: {effective.forecast6hRainMm} mm</span>
                </div>
                <div className="line-clamp-2">{effective.decisionReason}</div>
              </div>
            </div>
          )}

          {/* TAB 2: FULL-LIFECYCLE SAFETY INTERLOCK & STRESS TEST */}
          {activeTab === 'INTERLOCK' && (
            <div className="flex h-full flex-col justify-between gap-2.5">
              {/* 3-Point Safety Checklist */}
              <div className="grid grid-cols-3 gap-2 font-mono text-[10px]">
                <div
                  className={`rounded-lg border p-2 ${
                    checkHeadOk
                      ? 'border-emerald-800/70 bg-emerald-950/30 text-emerald-200'
                      : 'border-red-700/80 bg-red-950/50 text-red-200'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span>1. Head Differential</span>
                    {checkHeadOk ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                    ) : (
                      <XCircle className="h-3.5 w-3.5 text-red-400" />
                    )}
                  </div>
                  <div className="mt-0.5 text-xs font-bold">
                    ΔH = {headDiffM.toFixed(2)} m
                  </div>
                  <div className="text-[9px] opacity-75">Req. ≥ +0.10 m</div>
                </div>

                <div
                  className={`rounded-lg border p-2 ${
                    checkDownstreamOk
                      ? 'border-emerald-800/70 bg-emerald-950/30 text-emerald-200'
                      : 'border-red-700/80 bg-red-950/50 text-red-200'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span>2. Downstream River</span>
                    {checkDownstreamOk ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                    ) : (
                      <XCircle className="h-3.5 w-3.5 text-red-400" />
                    )}
                  </div>
                  <div className="mt-0.5 text-xs font-bold">
                    H_down = {effective.downstreamLevelM.toFixed(2)} m
                  </div>
                  <div className="text-[9px] opacity-75">Critical &lt; 2.50 m</div>
                </div>

                <div
                  className={`rounded-lg border p-2 ${
                    checkEcologicalOk
                      ? 'border-emerald-800/70 bg-emerald-950/30 text-emerald-200'
                      : 'border-red-700/80 bg-red-950/50 text-red-200'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span>3. Ecological Datum</span>
                    {checkEcologicalOk ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                    ) : (
                      <XCircle className="h-3.5 w-3.5 text-red-400" />
                    )}
                  </div>
                  <div className="mt-0.5 text-xs font-bold">
                    H_wet = {effective.wetlandLevelM.toFixed(2)} m
                  </div>
                  <div className="text-[9px] opacity-75">Req. &gt; 1.00 m</div>
                </div>
              </div>

              {/* Interactive Override Sliders */}
              <div className="space-y-2 rounded-lg border border-slate-800 bg-slate-950/80 p-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[11px] font-semibold text-amber-300">
                    Mid-Drain Downstream Surge · Emergency Trip Test Bench
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        if (state.appMode !== 'SIMULATION') {
                          state.setAppMode('SIMULATION');
                        }
                        state.seekToFrame(12); // T+1.0h active pre-discharge
                        state.setDownstreamOverride(true, 2.65);
                      }}
                      className="flex items-center gap-1 rounded bg-red-600/90 px-2 py-0.5 text-[10px] font-bold text-white hover:bg-red-500"
                    >
                      <Zap className="h-3 w-3" /> Inject Tidal Surge (2.65m)
                    </button>
                    {state.downstreamOverrideEnabled && (
                      <button
                        type="button"
                        onClick={() => state.setDownstreamOverride(false)}
                        className="flex items-center gap-1 rounded bg-slate-800 px-2 py-0.5 text-[10px] text-slate-300 hover:bg-slate-700"
                      >
                        <RotateCcw className="h-3 w-3" /> Reset Normal Tide
                      </button>
                    )}
                  </div>
                </div>

                {/* Downstream Surge Slider */}
                <div className="space-y-0.5">
                  <div className="flex justify-between font-mono text-[10px]">
                    <span className="text-slate-400">
                      Downstream Tide Level Injection (≤2.35m Unlock | ≥2.50m Trip):
                    </span>
                    <span className="font-bold text-amber-300">
                      {effective.downstreamLevelM.toFixed(2)} m
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.6}
                    max={3.0}
                    step={0.05}
                    value={effective.downstreamLevelM}
                    onChange={(e) => {
                      if (state.appMode !== 'SIMULATION') {
                        state.setAppMode('SIMULATION');
                      }
                      state.setDownstreamOverride(true, Number(e.target.value));
                    }}
                    className="h-1.5 w-full cursor-pointer accent-amber-500"
                  />
                </div>

                {/* Manual Gate Override Slider */}
                <div className="space-y-0.5">
                  <div className="flex justify-between font-mono text-[10px]">
                    <span className="text-slate-400">
                      Manual Gate Target Request (Guarded by Interlock):
                    </span>
                    <span className="text-purple-300">
                      Target {effective.targetGateOpeningM.toFixed(2)}m → Actual{' '}
                      <strong
                        className={
                          effective.gateOpeningM > 0
                            ? 'text-emerald-400'
                            : 'text-red-400'
                        }
                      >
                        {effective.gateOpeningM.toFixed(2)}m
                      </strong>
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={GATE_MAX_OPENING_M}
                    step={0.1}
                    value={
                      state.controlMode === 'MANUAL_OVERRIDE'
                        ? state.manualGateTargetM
                        : effective.targetGateOpeningM
                    }
                    onChange={(e) => {
                      if (state.appMode !== 'SIMULATION') {
                        state.setAppMode('SIMULATION');
                      }
                      if (state.controlMode !== 'MANUAL_OVERRIDE') {
                        state.setControlMode('MANUAL_OVERRIDE');
                      }
                      state.setManualGateTarget(Number(e.target.value));
                    }}
                    className="h-1.5 w-full cursor-pointer accent-purple-500"
                  />
                </div>
              </div>

              {/* Lockout Latch Status */}
              <div className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950 px-3 py-1.5 font-mono text-[11px]">
                <span className="flex items-center gap-1.5">
                  {effective.activeLockout ? (
                    <Lock className="h-3.5 w-3.5 text-red-400" />
                  ) : (
                    <Unlock className="h-3.5 w-3.5 text-emerald-400" />
                  )}
                  <span>
                    Interlock Latch:{' '}
                    <strong
                      className={
                        effective.activeLockout ? 'text-red-400' : 'text-emerald-400'
                      }
                    >
                      {effective.activeLockout
                        ? `LATCHED (${effective.interlockReasonCode})`
                        : 'UNLOCKED (Normal Guard)'}
                    </strong>
                  </span>
                </span>
                <span className="text-slate-400">
                  Total Trips: <strong className="text-amber-300">{state.manualInterlockState.tripCount}</strong> times
                </span>
              </div>
            </div>
          )}

          {/* TAB 3: CUSTOM SCENARIO & API STUDIO */}
          {activeTab === 'CUSTOM_STUDIO' && (
            <div className="flex h-full flex-col justify-between gap-2">
              <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-[11px]">
                <div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Peak Rainfall (mm/h)</span>
                    <span className="font-mono font-bold text-amber-300">
                      {simulationForm.peakIntensityMmPerHr} mm/h
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={160}
                    step={5}
                    value={simulationForm.peakIntensityMmPerHr}
                    onChange={(e) =>
                      state.updateSimulationForm({
                        peakIntensityMmPerHr: Number(e.target.value),
                      })
                    }
                    className="h-1.5 w-full accent-amber-500"
                  />
                </div>

                <div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Storm Start Time</span>
                    <span className="font-mono font-bold text-cyan-300">
                      T+{simulationForm.stormStartHour}:00
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={12}
                    step={1}
                    value={simulationForm.stormStartHour}
                    onChange={(e) =>
                      state.updateSimulationForm({
                        stormStartHour: Number(e.target.value),
                      })
                    }
                    className="h-1.5 w-full accent-cyan-500"
                  />
                </div>

                <div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Storm Duration</span>
                    <span className="font-mono font-bold text-cyan-300">
                      {simulationForm.stormDurationHours} hours
                    </span>
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={10}
                    step={1}
                    value={simulationForm.stormDurationHours}
                    onChange={(e) =>
                      state.updateSimulationForm({
                        stormDurationHours: Number(e.target.value),
                      })
                    }
                    className="h-1.5 w-full accent-cyan-500"
                  />
                </div>

                <div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Downstream Mean Tide</span>
                    <span className="font-mono font-bold text-amber-300">
                      {simulationForm.tideMeanLevelM.toFixed(1)} m
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.7}
                    max={2.4}
                    step={0.1}
                    value={simulationForm.tideMeanLevelM}
                    onChange={(e) =>
                      state.updateSimulationForm({
                        tideMeanLevelM: Number(e.target.value),
                      })
                    }
                    className="h-1.5 w-full accent-amber-500"
                  />
                </div>

                <div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Initial Soil Saturation</span>
                    <span className="font-mono font-bold text-sky-300">
                      {(simulationForm.initialSoilSaturation * 100).toFixed(0)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.1}
                    max={0.95}
                    step={0.05}
                    value={simulationForm.initialSoilSaturation}
                    onChange={(e) =>
                      state.updateSimulationForm({
                        initialSoilSaturation: Number(e.target.value),
                      })
                    }
                    className="h-1.5 w-full accent-sky-500"
                  />
                </div>

                <div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Hyetograph Profile</span>
                    <button
                      type="button"
                      onClick={() =>
                        state.updateSimulationForm({
                          stormProfile:
                            simulationForm.stormProfile === 'BLOCK'
                              ? ('TRIANGULAR' as StormProfileShape)
                              : ('BLOCK' as StormProfileShape),
                        })
                      }
                      className="font-mono text-[10px] font-bold text-purple-300 underline"
                    >
                      {simulationForm.stormProfile === 'BLOCK'
                        ? 'BLOCK (Uniform)'
                        : 'TRIANGULAR (Single Peak)'}
                    </button>
                  </div>
                  <div className="mt-1 flex justify-between text-[10px] text-slate-400">
                    <span>Storm Surge: +{simulationForm.surgePeakM.toFixed(1)}m</span>
                    <input
                      type="range"
                      min={0}
                      max={1.0}
                      step={0.1}
                      value={simulationForm.surgePeakM}
                      onChange={(e) =>
                        state.updateSimulationForm({
                          surgePeakM: Number(e.target.value),
                        })
                      }
                      className="h-1.5 w-24 accent-red-500"
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between gap-2 border-t border-slate-800 pt-2">
                <button
                  type="button"
                  onClick={() => state.setSwaggerModalOpen(true)}
                  className="flex items-center gap-1.5 rounded-lg border border-purple-500/60 bg-purple-950/60 px-3 py-1.5 text-xs font-semibold text-purple-200 transition hover:bg-purple-900/80"
                >
                  <Terminal className="h-3.5 w-3.5" /> Swagger / JSON Payload Injection
                </button>

                <button
                  type="button"
                  onClick={state.applySimulationForm}
                  className="flex items-center gap-1.5 rounded-lg bg-cyan-600 px-4 py-1.5 text-xs font-bold text-white shadow shadow-cyan-600/30 transition hover:bg-cyan-500"
                >
                  <Play className="h-3.5 w-3.5" /> Apply Parameters &amp; Simulate
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Right 7 Columns: Synchronized Hydrograph Chart */}
      <div className="flex min-h-0 flex-col lg:col-span-7">
        <HydrographChart />
      </div>
    </div>
  );
}
