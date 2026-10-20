/**
 * @file HydrographChart.tsx
 * @description 24-hour comparative hydrograph chart plotting Rainfall Forecast
 * (mm/h), AI Smart Wetland Water Level (m), Traditional Unmanaged Wetland
 * Level (m) and Downstream Tidal Level (m), synchronized with the 3D timeline.
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
  useSimulationStore,
} from '../../store/simulationStore';

export function HydrographChart() {
  const state = useSimulationStore();
  const effective = selectEffectiveFrame(state);

  const chartData = state.frames.map((f, index) => ({
    index,
    hourOffset: f.hourOffset,
    rainfall: f.rainfallIntensityMmPerHr,
    smartLevel: f.smart.waterLevelM,
    traditionalLevel: f.traditional.waterLevelM,
    downstreamLevel: f.downstreamLevelM,
    gateOpening: f.smart.gateOpeningM,
  }));

  return (
    <div className="flex flex-col rounded-2xl border border-slate-800 bg-slate-900/90 p-4 shadow-xl">
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-xs font-semibold text-white">
            <TrendingDown className="h-4 w-4 text-cyan-400" />
            24h 双轨水文历时对比曲线 (AI 智控调蓄 vs 传统固定溢流堰)
          </h2>
          <p className="text-[11px] text-slate-400">
            点击图表任意时间点可同步跳转 3D 沙盘进度 · 红线 3.5m 为泛滥溢流警戒标高
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 font-mono text-[10px]">
          <span className="flex items-center gap-1 text-sky-400">
            <span className="inline-block h-2.5 w-2.5 rounded-sm bg-sky-500/70" />
            雨强(mm/h)
          </span>
          <span className="flex items-center gap-1 text-cyan-300">
            <span className="inline-block h-0.5 w-3 bg-cyan-400" />
            AI智控水位(m)
          </span>
          <span className="flex items-center gap-1 text-orange-400">
            <span className="inline-block h-0.5 w-3 border-b border-dashed border-orange-400 bg-orange-400" />
            传统无控水位(m)
          </span>
          <span className="flex items-center gap-1 text-amber-300">
            <span className="inline-block h-0.5 w-3 bg-amber-400" />
            下游潮位(m)
          </span>
        </div>
      </div>

      <div className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={chartData}
            margin={{ top: 8, right: 12, bottom: 0, left: -14 }}
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
              dataKey="hourOffset"
              stroke="#64748b"
              fontSize={10}
              tickFormatter={(v) => `${v}h`}
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
              labelFormatter={(label) => `仿真时刻: T+${label} 小时`}
              formatter={(value: number, name: string) => {
                if (name === 'rainfall') return [`${value} mm/h`, '降雨强度'];
                if (name === 'smartLevel') return [`${value.toFixed(2)} m`, 'AI 智控水位'];
                if (name === 'traditionalLevel')
                  return [`${value.toFixed(2)} m`, '传统无控水位'];
                if (name === 'downstreamLevel')
                  return [`${value.toFixed(2)} m`, '下游外河潮位'];
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
                value: '3.5m 临界溢流线',
                fill: '#ef4444',
                fontSize: 10,
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
                value: '1.0m 生态底线',
                fill: '#22c55e',
                fontSize: 9,
                position: 'insideBottomLeft',
              }}
            />

            {/* Current Playback Time Vertical Cursor */}
            <ReferenceLine
              yAxisId="level"
              x={effective.hourOffset}
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
