/**
 * @file HydrographChart.tsx
 * @description Synchronized comparative hydrograph chart plotting Rainfall
 * Forecast (mm/h), AI Smart Wetland Water Level (m), Traditional Unmanaged
 * Wetland Level (m) and Downstream Tidal Level (m).
 *
 * Adapts automatically between:
 *   - LIVE mode: Real wall-clock X-axis (HH:mm MYT) with a fixed "NOW" marker
 *     and a movable lookahead cursor.
 *   - SIMULATION mode: Relative simulation hours (0h..24h).
 */

import { TrendingDown } from 'lucide-react';
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  H_MAX_CRITICAL_M,
  H_MIN_ECOLOGICAL_M,
} from '../../constants/hydrologyConstants';
import {
  selectEffectiveFrame,
  selectTimeContext,
  useSimulationStore,
} from '../../store/simulationStore';
import { formatClock, formatRelativeClock, formatShortDate } from '../../utils/timeFormat';

export function HydrographChart() {
  const state = useSimulationStore();
  const effective = selectEffectiveFrame(state);
  const timeCtx = selectTimeContext(state);

  const chartData = state.frames.map((f, index) => ({
    index,
    simTimeSec: f.simTimeSec,
    rainfall: f.rainfallIntensityMmPerHr,
    smartLevel: f.smart.waterLevelM,
    traditionalLevel: f.traditional.waterLevelM,
    downstreamLevel: f.downstreamLevelM,
    gateOpening: f.smart.gateOpeningM,
  }));

  // Clean whole-hour ticks every 2 hours
  const wholeHourTicks = state.frames
    .filter((f) => f.simTimeSec % 7_200 === 0)
    .map((f) => f.simTimeSec);

  const nowFrame =
    state.appMode === 'LIVE' ? state.frames[state.live.nowFrameIndex] : undefined;

  return (
    <div className="flex h-full flex-col rounded-xl border border-slate-800 bg-slate-900/90 p-3 shadow-xl">
      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-xs font-semibold text-white">
            <TrendingDown className="h-4 w-4 text-cyan-400" />
            {state.appMode === 'LIVE'
              ? 'Live & 24h Predictive Drainage Hydrograph (Click timeline to seek)'
              : '24h Dual-Track Hydrograph (Smart Control vs Baseline Static Weir)'}
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-3 font-mono text-[10px]">
          <span className="flex items-center gap-1 text-sky-400">
            <span className="inline-block h-2.5 w-2.5 rounded-sm bg-sky-500/70" />
            Rain (mm/h)
          </span>
          <span className="flex items-center gap-1 text-cyan-300">
            <span className="inline-block h-0.5 w-3 bg-cyan-400" />
            Smart Level (m)
          </span>
          <span className="flex items-center gap-1 text-orange-400">
            <span className="inline-block h-0.5 w-3 border-b border-dashed border-orange-400 bg-orange-400" />
            Baseline Level (m)
          </span>
          <span className="flex items-center gap-1 text-amber-300">
            <span className="inline-block h-0.5 w-3 bg-amber-400" />
            Downstream Tide (m)
          </span>
        </div>
      </div>

      <div className="min-h-0 flex-1 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={chartData}
            margin={{ top: 6, right: 8, bottom: -4, left: -16 }}
            onClick={(nextState) => {
              if (
                nextState &&
                typeof nextState.activeTooltipIndex === 'number'
              ) {
                state.seekToFrame(nextState.activeTooltipIndex);
              }
            }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
            <XAxis
              dataKey="simTimeSec"
              ticks={wholeHourTicks}
              stroke="#64748b"
              fontSize={10}
              tickFormatter={(sec: number) => {
                if (state.appMode === 'LIVE') {
                  return formatClock(timeCtx.seriesStartMs + sec * 1_000);
                }
                return `${Math.round(sec / 3_600)}h`;
              }}
            />
            <YAxis
              yAxisId="level"
              stroke="#38bdf8"
              fontSize={10}
              domain={[0, 4.2]}
              tickFormatter={(v) => `${v}m`}
            />
            <YAxis
              yAxisId="rain"
              orientation="right"
              stroke="#0284c7"
              fontSize={10}
              domain={[0, (max: number) => Math.max(40, Math.ceil(max * 1.25))]}
              tickFormatter={(v) => `${v}`}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#090d16',
                borderColor: '#334155',
                borderRadius: '0.65rem',
                fontSize: '11px',
                color: '#f8fafc',
              }}
              labelFormatter={(sec: number) => {
                if (state.appMode === 'LIVE') {
                  const ms = timeCtx.seriesStartMs + sec * 1_000;
                  return `Time: ${formatShortDate(ms)} ${formatClock(ms)} MYT`;
                }
                return `Sim Time: ${formatRelativeClock(sec)}`;
              }}
              formatter={(value: number, name: string) => {
                if (name === 'rainfall') return [`${value} mm/h`, 'Rainfall Intensity'];
                if (name === 'smartLevel') return [`${value.toFixed(2)} m`, 'Smart Water Level'];
                if (name === 'traditionalLevel')
                  return [`${value.toFixed(2)} m`, 'Baseline Water Level'];
                if (name === 'downstreamLevel')
                  return [`${value.toFixed(2)} m`, 'Downstream Tide Level'];
                return [value, name];
              }}
            />

            {/* 3.5m Critical Spillover Reference Line */}
            <ReferenceLine
              yAxisId="level"
              y={H_MAX_CRITICAL_M}
              stroke="#ef4444"
              strokeDasharray="4 4"
              label={{
                value: '3.5m Critical Spillway',
                fill: '#ef4444',
                fontSize: 9,
                position: 'insideTopLeft',
              }}
            />

            {/* 1.0m Ecological Minimum Reference Line */}
            <ReferenceLine
              yAxisId="level"
              y={H_MIN_ECOLOGICAL_M}
              stroke="#22c55e"
              strokeDasharray="3 3"
              label={{
                value: '1.0m Ecological Datum',
                fill: '#22c55e',
                fontSize: 9,
                position: 'insideBottomLeft',
              }}
            />

            {/* LIVE mode: Fixed wall-clock NOW reference line */}
            {nowFrame !== undefined && (
              <ReferenceLine
                yAxisId="level"
                x={nowFrame.simTimeSec}
                stroke="#10b981"
                strokeWidth={1.5}
                strokeDasharray="2 2"
                label={{
                  value: 'NOW',
                  fill: '#10b981',
                  fontSize: 9,
                  position: 'top',
                }}
              />
            )}

            {/* Current Scrubbed Cursor Vertical Line */}
            <ReferenceLine
              yAxisId="level"
              x={effective.simTimeSec}
              stroke="#f8fafc"
              strokeWidth={1.5}
            />

            <Bar
              yAxisId="rain"
              dataKey="rainfall"
              fill="#0284c7"
              opacity={0.45}
              radius={[2, 2, 0, 0]}
            />

            <Line
              yAxisId="level"
              type="monotone"
              dataKey="traditionalLevel"
              stroke="#f97316"
              strokeWidth={2}
              strokeDasharray="5 3"
              dot={false}
            />

            <Line
              yAxisId="level"
              type="monotone"
              dataKey="downstreamLevel"
              stroke="#f59e0b"
              strokeWidth={1.5}
              dot={false}
            />

            <Line
              yAxisId="level"
              type="monotone"
              dataKey="smartLevel"
              stroke="#22d3ee"
              strokeWidth={2.5}
              dot={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
