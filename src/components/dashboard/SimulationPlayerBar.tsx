/**
 * @file SimulationPlayerBar.tsx
 * @description Mode-adaptive timeline control bar:
 *   - LIVE mode: Anchored to Malaysia real-time clock (UTC+8) with a glowing
 *     "NOW" marker, 6h hindcast + 24h predictive lookahead scrubber, and quick
 *     future-hour jump buttons (+1h, +3h, +6h, +12h).
 *   - SIMULATION mode: Full transport controls (Play/Pause, Step, Speed) with
 *     proportionally positioned tick marks (eliminating flex-between drift)
 *     and colour-coded hydrological phase & rainfall bands.
 */

import {
  Clock,
  Compass,
  FastForward,
  Pause,
  Play,
  Radio,
  RefreshCw,
  RotateCcw,
  SkipBack,
  SkipForward,
} from 'lucide-react';
import { useEffect, useMemo } from 'react';
import { LIVE_CLOCK_TICK_MS } from '../../constants/weatherConstants';
import {
  selectEffectiveFrame,
  selectTimeContext,
  TIMELINE_FRAMES_PER_HOUR,
  useSimulationStore,
} from '../../store/simulationStore';
import type { ControlPhase } from '../../types/hydrology';
import {
  formatClock,
  formatOffsetFromNow,
  formatRelativeClock,
  formatShortDate,
} from '../../utils/timeFormat';

const SPEED_OPTIONS: readonly number[] = [10, 60, 150, 300];

const PHASE_STRIP_COLOR: Readonly<Record<ControlPhase, string>> = {
  NORMAL: 'bg-emerald-500/50',
  PRE_DISCHARGE: 'bg-blue-500/75',
  PEAK_SHAVING: 'bg-amber-500/80',
  RECOVERY: 'bg-purple-500/70',
  INTERLOCK_SUSPENDED: 'bg-red-500/90',
};

export function SimulationPlayerBar() {
  const state = useSimulationStore();
  const effective = selectEffectiveFrame(state);
  const timeCtx = selectTimeContext(state);

  // 1. Live mode wall-clock ticker & initial Open-Meteo sync
  useEffect(() => {
    void useSimulationStore.getState().refreshLiveData();
    const timer = window.setInterval(() => {
      useSimulationStore.getState().tickLiveClock();
    }, LIVE_CLOCK_TICK_MS);
    return () => window.clearInterval(timer);
  }, []);

  // 2. Simulation mode playback loop
  useEffect(() => {
    if (state.appMode !== 'SIMULATION' || !state.isPlaying) return undefined;

    const intervalMs = Math.max(40, Math.round(9600 / state.playbackSpeed));
    const timer = window.setInterval(() => {
      useSimulationStore.getState().stepForward();
    }, intervalMs);

    return () => window.clearInterval(timer);
  }, [state.appMode, state.isPlaying, state.playbackSpeed]);

  const maxFrameIndex = Math.max(1, state.frames.length - 1);
  const totalHours = Math.max(1, state.summary.durationHours);

  // Proportional tick marks placed by exact percentage (0%..100%)
  const proportionalTicks = useMemo(() => {
    const stepHours = totalHours <= 12 ? 2 : 4;
    const ticks: Array<{ pct: number; label: string; isRainy: boolean }> = [];

    for (let h = 0; h <= totalHours; h += stepHours) {
      const pct = Math.min(100, (h / totalHours) * 100);
      const frameIdx = Math.min(state.frames.length - 1, h * TIMELINE_FRAMES_PER_HOUR);
      const frame = state.frames[frameIdx];
      const isRainy = (frame?.rainfallIntensityMmPerHr ?? 0) >= 1.0;

      if (state.appMode === 'LIVE') {
        const tickMs = timeCtx.seriesStartMs + h * 3_600_000;
        ticks.push({
          pct,
          label: formatClock(tickMs),
          isRainy,
        });
      } else {
        ticks.push({
          pct,
          label: `${String(h).padStart(2, '0')}:00`,
          isRainy,
        });
      }
    }
    return ticks;
  }, [state.appMode, state.frames, timeCtx.seriesStartMs, totalHours]);

  const nowMarkerPct =
    state.appMode === 'LIVE'
      ? Math.min(100, Math.max(0, (state.live.nowFrameIndex / maxFrameIndex) * 100))
      : null;

  return (
    <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-900/95 px-4 py-2 shadow-xl">
      {/* Left: Mode-specific Transport / Live Anchor Controls */}
      {state.appMode === 'LIVE' ? (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={state.jumpToNow}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition ${
              state.live.followNow
                ? 'bg-emerald-600 text-white shadow shadow-emerald-600/30'
                : 'border border-emerald-500/60 bg-emerald-950/70 text-emerald-300 hover:bg-emerald-800/70'
            }`}
          >
            <Radio className="h-3.5 w-3.5 animate-pulse" />
            {state.live.followNow ? 'Locked to NOW' : '↺ Jump to NOW'}
          </button>

          <div className="flex items-center gap-1 rounded-lg border border-slate-800 bg-slate-950 p-0.5 font-mono text-[11px]">
            {[
              { label: '-1h', delta: -TIMELINE_FRAMES_PER_HOUR },
              { label: '+1h', delta: TIMELINE_FRAMES_PER_HOUR },
              { label: '+3h', delta: TIMELINE_FRAMES_PER_HOUR * 3 },
              { label: '+6h', delta: TIMELINE_FRAMES_PER_HOUR * 6 },
              { label: '+12h', delta: TIMELINE_FRAMES_PER_HOUR * 12 },
            ].map((btn) => (
              <button
                key={btn.label}
                type="button"
                onClick={() => state.stepBy(btn.delta)}
                title={`Jump ${btn.label} (${btn.delta > 0 ? 'Forecast' : 'Hindcast'})`}
                className="rounded px-2 py-1 text-slate-300 transition hover:bg-slate-800 hover:text-cyan-300"
              >
                {btn.label}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={state.resetPlayback}
            title="Reset Simulation to 00:00"
            className="rounded-lg border border-slate-700 bg-slate-800 p-1.5 text-slate-300 transition hover:bg-slate-700 hover:text-white"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>

          <button
            type="button"
            onClick={state.stepBackward}
            title="Step Backward (-5 min)"
            className="rounded-lg border border-slate-700 bg-slate-800 p-1.5 text-slate-300 transition hover:bg-slate-700 hover:text-white"
          >
            <SkipBack className="h-3.5 w-3.5" />
          </button>

          <button
            type="button"
            onClick={state.togglePlay}
            className={`flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-bold text-white shadow transition ${
              state.isPlaying
                ? 'bg-amber-600 hover:bg-amber-500'
                : 'bg-cyan-600 hover:bg-cyan-500'
            }`}
          >
            {state.isPlaying ? (
              <>
                <Pause className="h-3.5 w-3.5" /> Pause
              </>
            ) : (
              <>
                <Play className="h-3.5 w-3.5" /> Play
              </>
            )}
          </button>

          <button
            type="button"
            onClick={state.stepForward}
            title="Step Forward (+5 min)"
            className="rounded-lg border border-slate-700 bg-slate-800 p-1.5 text-slate-300 transition hover:bg-slate-700 hover:text-white"
          >
            <SkipForward className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Center: Proportional Timeline Scrubber with Phase & Rain Strip */}
      <div className="flex min-w-[280px] flex-1 items-center gap-3">
        {/* Digital Time Readout Box */}
        <div className="shrink-0 rounded-lg border border-slate-800 bg-slate-950 px-2.5 py-1 font-mono text-xs">
          {state.appMode === 'LIVE' ? (
            <div className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 text-emerald-400" />
              <span className="font-bold text-white">
                {formatShortDate(timeCtx.cursorMs)} {formatClock(timeCtx.cursorMs)}
              </span>
              <span
                className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                  timeCtx.offsetFromNowSec === 0 || state.live.followNow
                    ? 'bg-emerald-950 text-emerald-300'
                    : timeCtx.isForecast
                      ? 'bg-amber-950 text-amber-300'
                      : 'bg-slate-800 text-slate-300'
                }`}
              >
                {formatOffsetFromNow(timeCtx.offsetFromNowSec)}
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <Compass className="h-3.5 w-3.5 text-purple-400" />
              <span className="font-bold text-cyan-300">
                {formatRelativeClock(effective.simTimeSec)}
              </span>
              <span className="text-slate-500">/ {totalHours}:00</span>
            </div>
          )}
        </div>

        {/* Scrubber Track & Proportional Tick Ruler */}
        <div className="relative flex flex-1 flex-col pt-1 pb-3.5">
          {/* Colour-coded Hydrological Phase & Rain Bar underneath slider */}
          <div className="pointer-events-none relative mb-1 flex h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
            {state.frames.map((f, idx) => (
              <div
                key={idx}
                className={`h-full flex-1 ${PHASE_STRIP_COLOR[f.smart.phase]}`}
                title={`T+${f.hourOffset}h · ${f.smart.phase} · Rain ${f.rainfallIntensityMmPerHr} mm/h`}
              />
            ))}
          </div>

          {/* Glowing NOW vertical marker in LIVE mode */}
          {nowMarkerPct !== null && (
            <div
              className="pointer-events-none absolute -top-0.5 z-10 flex flex-col items-center"
              style={{ left: `${nowMarkerPct}%`, transform: 'translateX(-50%)' }}
            >
              <span className="rounded bg-emerald-500 px-1 py-0 font-mono text-[8px] font-bold leading-tight text-slate-950 shadow">
                NOW
              </span>
              <div className="h-4 w-0.5 bg-emerald-400 shadow-[0_0_6px_#34d399]" />
            </div>
          )}

          <input
            type="range"
            min={0}
            max={maxFrameIndex}
            step={1}
            value={state.currentFrameIndex}
            onChange={(e) => state.seekToFrame(Number(e.target.value))}
            className="relative z-20 h-2 w-full cursor-pointer accent-cyan-400"
          />

          {/* Proportional Ruler Marks (exact percentage positioning — zero drift) */}
          <div className="pointer-events-none relative mt-0.5 h-3 w-full font-mono text-[10px]">
            {proportionalTicks.map((tick, idx) => (
              <span
                key={idx}
                style={{
                  left: `${tick.pct}%`,
                  transform:
                    idx === 0
                      ? 'translateX(0%)'
                      : idx === proportionalTicks.length - 1
                        ? 'translateX(-100%)'
                        : 'translateX(-50%)',
                }}
                className={`absolute top-0 whitespace-nowrap ${
                  tick.isRainy ? 'font-bold text-sky-400' : 'text-slate-400'
                }`}
              >
                {tick.label}
                {tick.isRainy ? '🌧' : ''}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Right: Speed Multipliers (SIMULATION) or Live Forecast Sync Status (LIVE) */}
      {state.appMode === 'LIVE' ? (
        <div className="flex items-center gap-2 font-mono text-[11px]">
          <span
            className={`rounded-lg border px-2.5 py-1 ${
              state.live.status === 'ONLINE'
                ? 'border-emerald-700/60 bg-emerald-950/60 text-emerald-300'
                : state.live.status === 'SYNCING'
                  ? 'border-cyan-700/60 bg-cyan-950/60 text-cyan-300'
                  : 'border-amber-700/60 bg-amber-950/60 text-amber-300'
            }`}
          >
            {state.live.status === 'ONLINE'
              ? 'Open-Meteo Live Online (-6h ~ +24h)'
              : state.live.status === 'SYNCING'
                ? 'Syncing Forecast Data...'
                : 'Offline Safe Baseline'}
          </span>
          <button
            type="button"
            onClick={() => void state.refreshLiveData()}
            title="Refresh Open-Meteo Forecast & Tidal Model"
            className="rounded-lg border border-slate-700 bg-slate-800 p-1.5 text-slate-300 transition hover:bg-slate-700 hover:text-white"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${
                state.live.status === 'SYNCING' ? 'animate-spin text-cyan-400' : ''
              }`}
            />
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-1 rounded-xl border border-slate-800 bg-slate-950 p-1 font-mono text-xs">
          <FastForward className="ml-1.5 h-3.5 w-3.5 text-slate-400" />
          <span className="mr-1 text-[10px] text-slate-400">Speed:</span>
          {SPEED_OPTIONS.map((spd) => (
            <button
              key={spd}
              type="button"
              onClick={() => state.setPlaybackSpeed(spd)}
              className={`rounded-lg px-2 py-0.5 text-[11px] font-semibold transition ${
                state.playbackSpeed === spd
                  ? 'bg-cyan-600 text-white'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-white'
              }`}
            >
              {spd}x
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
