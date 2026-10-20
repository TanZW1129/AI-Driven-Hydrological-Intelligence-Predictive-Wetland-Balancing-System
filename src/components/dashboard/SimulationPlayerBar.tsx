/**
 * @file SimulationPlayerBar.tsx
 * @description Bottom timeline playback control bar with Play/Pause, Step,
 * Reset, 24-hour interactive timeline scrubber and speed multiplier buttons.
 */

import {
  FastForward,
  Pause,
  Play,
  RotateCcw,
  SkipBack,
  SkipForward,
} from 'lucide-react';
import { useEffect } from 'react';
import {
  selectEffectiveFrame,
  useSimulationStore,
} from '../../store/simulationStore';

const SPEED_OPTIONS: readonly number[] = [10, 60, 150, 300];

function formatSimClock(simTimeSec: number): string {
  const totalMinutes = Math.floor(simTimeSec / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

export function SimulationPlayerBar() {
  const state = useSimulationStore();
  const effective = selectEffectiveFrame(state);

  // Playback interval loop
  useEffect(() => {
    if (!state.isPlaying) return undefined;

    // At 60x speed, 1 frame (5 sim minutes) advances every 160ms
    const intervalMs = Math.max(40, Math.round(9600 / state.playbackSpeed));
    const timer = window.setInterval(() => {
      useSimulationStore.getState().stepForward();
    }, intervalMs);

    return () => window.clearInterval(timer);
  }, [state.isPlaying, state.playbackSpeed]);

  const maxFrameIndex = Math.max(0, state.frames.length - 1);
  const totalHours = state.summary.durationHours;

  return (
    <footer className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-800 bg-slate-900/95 px-5 py-3 shadow-2xl">
      {/* Left: Transport Controls */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={state.resetPlayback}
          title="重置仿真到 00:00"
          className="rounded-lg border border-slate-700 bg-slate-800 p-2 text-slate-300 transition hover:bg-slate-700 hover:text-white"
        >
          <RotateCcw className="h-4 w-4" />
        </button>

        <button
          type="button"
          onClick={state.stepBackward}
          title="后退一步 (-5 min)"
          className="rounded-lg border border-slate-700 bg-slate-800 p-2 text-slate-300 transition hover:bg-slate-700 hover:text-white"
        >
          <SkipBack className="h-4 w-4" />
        </button>

        <button
          type="button"
          onClick={state.togglePlay}
          className={`flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold text-white shadow-lg transition ${
            state.isPlaying
              ? 'bg-amber-600 hover:bg-amber-500 shadow-amber-600/25'
              : 'bg-cyan-600 hover:bg-cyan-500 shadow-cyan-600/25'
          }`}
        >
          {state.isPlaying ? (
            <>
              <Pause className="h-4 w-4" /> 暂停推演
            </>
          ) : (
            <>
              <Play className="h-4 w-4" /> 播放推演
            </>
          )}
        </button>

        <button
          type="button"
          onClick={state.stepForward}
          title="前进一步 (+5 min)"
          className="rounded-lg border border-slate-700 bg-slate-800 p-2 text-slate-300 transition hover:bg-slate-700 hover:text-white"
        >
          <SkipForward className="h-4 w-4" />
        </button>
      </div>

      {/* Center: Interactive Timeline Scrubber */}
      <div className="flex min-w-[240px] flex-1 items-center gap-3">
        <div className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-1 font-mono text-xs text-cyan-300">
          T+{formatSimClock(effective.simTimeSec)}{' '}
          <span className="text-slate-500">/ {totalHours}:00</span>
        </div>

        <div className="flex flex-1 flex-col gap-1">
          <input
            type="range"
            min={0}
            max={maxFrameIndex}
            step={1}
            value={state.currentFrameIndex}
            onChange={(e) => state.seekToFrame(Number(e.target.value))}
            className="w-full cursor-pointer accent-cyan-500"
          />
          <div className="flex justify-between font-mono text-[10px] text-slate-400">
            <span>00:00 初始</span>
            <span>04:00 暴雨前夕</span>
            <span>08:00 洪峰期</span>
            <span>16:00 退水恢复</span>
            <span>{totalHours}:00 结束</span>
          </div>
        </div>
      </div>

      {/* Right: Playback Speed Multipliers */}
      <div className="flex items-center gap-1.5 rounded-xl border border-slate-800 bg-slate-950 p-1 font-mono text-xs">
        <FastForward className="ml-1.5 h-3.5 w-3.5 text-slate-400" />
        <span className="mr-1 text-[10px] text-slate-400">倍速:</span>
        {SPEED_OPTIONS.map((spd) => (
          <button
            key={spd}
            type="button"
            onClick={() => state.setPlaybackSpeed(spd)}
            className={`rounded-lg px-2 py-1 text-[11px] font-semibold transition ${
              state.playbackSpeed === spd
                ? 'bg-cyan-600 text-white'
                : 'text-slate-400 hover:bg-slate-800 hover:text-white'
            }`}
          >
            {spd}x
          </button>
        ))}
      </div>
    </footer>
  );
}
