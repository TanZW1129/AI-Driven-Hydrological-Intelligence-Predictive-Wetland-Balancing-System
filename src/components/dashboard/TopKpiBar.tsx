/**
 * @file TopKpiBar.tsx
 * @description Enterprise command center KPI bar displaying current control
 * phase, wetland storage capacity, inflow/outflow balance, downstream interlock
 * status and quantified flood mitigation impact.
 */

import {
  Activity,
  AlertOctagon,
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  Droplets,
  Gauge,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import {
  DOWNSTREAM_CRITICAL_LEVEL_M,
  GATE_MAX_OPENING_M,
  H_MAX_CRITICAL_M,
  H_MIN_ECOLOGICAL_M,
} from '../../constants/hydrologyConstants';
import {
  selectEffectiveFrame,
  useSimulationStore,
} from '../../store/simulationStore';
import type { ControlPhase } from '../../types/hydrology';

const PHASE_META: Readonly<
  Record<
    ControlPhase,
    { label: string; sublabel: string; badgeClass: string; dotClass: string }
  >
> = {
  NORMAL: {
    label: 'PHASE 0 · 常态生态维持',
    sublabel: 'Normal Mode (2.0m Baseline)',
    badgeClass: 'border-emerald-500/50 bg-emerald-950/60 text-emerald-300',
    dotClass: 'bg-emerald-400',
  },
  PRE_DISCHARGE: {
    label: 'PHASE 1 · 预测性主动预泄洪',
    sublabel: 'Proactive Pre-Discharge (→1.0m)',
    badgeClass: 'border-blue-500/60 bg-blue-950/60 text-blue-300',
    dotClass: 'bg-blue-400 animate-ping',
  },
  PEAK_SHAVING: {
    label: 'PHASE 2 · 暴雨削峰滞洪',
    sublabel: 'Peak-Shaving Detention (Gates 0%)',
    badgeClass: 'border-amber-500/60 bg-amber-950/60 text-amber-300',
    dotClass: 'bg-amber-400 animate-pulse',
  },
  RECOVERY: {
    label: 'PHASE 3 · 洪后受控恢复',
    sublabel: 'Post-Storm Recovery (→2.0m)',
    badgeClass: 'border-purple-500/60 bg-purple-950/60 text-purple-300',
    dotClass: 'bg-purple-400',
  },
  INTERLOCK_SUSPENDED: {
    label: 'SAFE HALT · 下游联锁熔断挂起',
    sublabel: 'Downstream Interlock Lockout (0m)',
    badgeClass: 'border-red-500/80 bg-red-950/80 text-red-200 animate-pulse',
    dotClass: 'bg-red-500 animate-ping',
  },
};

export function TopKpiBar() {
  const state = useSimulationStore();
  const effective = selectEffectiveFrame(state);
  const { summary } = state;

  const phaseInfo = PHASE_META[effective.phase];
  const capacityPct = Math.min(
    100,
    Math.max(
      0,
      ((effective.wetlandLevelM - H_MIN_ECOLOGICAL_M) /
        (H_MAX_CRITICAL_M - H_MIN_ECOLOGICAL_M)) *
        100,
    ),
  );
  const headDiffM = effective.wetlandLevelM - effective.downstreamLevelM;
  const gateOpenPct = Math.round((effective.gateOpeningM / GATE_MAX_OPENING_M) * 100);

  return (
    <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
      {/* KPI 1: Current Operating Phase */}
      <div className="flex flex-col justify-between rounded-xl border border-slate-800 bg-slate-900/90 p-3.5 shadow">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-medium text-slate-400">
            系统运行阶段 (Control Phase)
          </span>
          <Activity className="h-4 w-4 text-cyan-400" />
        </div>
        <div className="my-1.5">
          <div
            className={`inline-flex items-center gap-2 rounded-lg border px-2.5 py-1 text-xs font-bold ${phaseInfo.badgeClass}`}
          >
            <span className={`h-2 w-2 rounded-full ${phaseInfo.dotClass}`} />
            {phaseInfo.label}
          </div>
        </div>
        <div className="flex items-center justify-between font-mono text-[11px] text-slate-400">
          <span>{phaseInfo.sublabel}</span>
          <span className="text-cyan-400">
            {state.controlMode === 'AUTO_AI' ? 'AI自主' : '人工干预'}
          </span>
        </div>
      </div>

      {/* KPI 2: Wetland Water Level & Available Buffer */}
      <div className="flex flex-col justify-between rounded-xl border border-slate-800 bg-slate-900/90 p-3.5 shadow">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-medium text-slate-400">
            125英亩湿地水位 &amp; 剩余库容
          </span>
          <Gauge className="h-4 w-4 text-sky-400" />
        </div>
        <div className="my-1 flex items-baseline justify-between font-mono">
          <div>
            <span className="text-2xl font-bold text-white">
              {effective.wetlandLevelM.toFixed(2)}
            </span>
            <span className="ml-1 text-xs text-slate-400">m</span>
            <span className="ml-2 text-xs text-orange-300">
              (传统: {effective.traditionalLevelM.toFixed(2)}m)
            </span>
          </div>
          <span className="text-xs font-semibold text-sky-400">
            {capacityPct.toFixed(0)}% 蓄满度
          </span>
        </div>
        <div className="space-y-1">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
            <div
              className={`h-full transition-all duration-300 ${
                effective.wetlandLevelM > 3.2
                  ? 'bg-red-500'
                  : effective.wetlandLevelM < 1.3
                    ? 'bg-blue-400'
                    : 'bg-sky-400'
              }`}
              style={{ width: `${capacityPct}%` }}
            />
          </div>
          <div className="flex justify-between font-mono text-[10px] text-slate-400">
            <span>可用缓冲: {effective.availableBufferM3.toLocaleString()} m³</span>
            <span>警戒线: 3.50m</span>
          </div>
        </div>
      </div>

      {/* KPI 3: Inflow (Q_in) vs Outflow (Q_out) & Gate Opening */}
      <div className="flex flex-col justify-between rounded-xl border border-slate-800 bg-slate-900/90 p-3.5 shadow">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-medium text-slate-400">
            进出水流量平衡 &amp; 电动水闸
          </span>
          <Droplets className="h-4 w-4 text-cyan-400" />
        </div>
        <div className="my-1 grid grid-cols-2 gap-2 font-mono">
          <div className="rounded-lg bg-slate-950/80 px-2.5 py-1">
            <div className="flex items-center gap-1 text-[10px] text-slate-400">
              <ArrowDownRight className="h-3 w-3 text-sky-400" /> 入流 Q_in
            </div>
            <div className="text-sm font-bold text-sky-300">
              {effective.inflowM3PerS.toFixed(1)} <span className="text-[10px]">m³/s</span>
            </div>
          </div>
          <div className="rounded-lg bg-slate-950/80 px-2.5 py-1">
            <div className="flex items-center gap-1 text-[10px] text-slate-400">
              <ArrowUpRight className="h-3 w-3 text-emerald-400" /> 出流 Q_out
            </div>
            <div className="text-sm font-bold text-emerald-300">
              {effective.outflowM3PerS.toFixed(1)} <span className="text-[10px]">m³/s</span>
            </div>
          </div>
        </div>
        <div className="flex items-center justify-between font-mono text-[10px] text-slate-400">
          <span>
            水闸开度: <strong className="text-white">{effective.gateOpeningM.toFixed(2)}m</strong> ({gateOpenPct}%)
          </span>
          <span>当前雨强: {effective.rainfallIntensityMmPerHr} mm/h</span>
        </div>
      </div>

      {/* KPI 4: Downstream Tidal Level & Safety Interlock */}
      <div className="flex flex-col justify-between rounded-xl border border-slate-800 bg-slate-900/90 p-3.5 shadow">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-medium text-slate-400">
            下游巴生潮位 &amp; 绝对安全联锁
          </span>
          {effective.canDischarge ? (
            <ShieldCheck className="h-4 w-4 text-emerald-400" />
          ) : (
            <ShieldAlert className="h-4 w-4 text-red-400 animate-bounce" />
          )}
        </div>
        <div className="my-1 flex items-baseline justify-between font-mono">
          <div>
            <span
              className={`text-2xl font-bold ${
                effective.downstreamLevelM >= DOWNSTREAM_CRITICAL_LEVEL_M
                  ? 'text-red-400'
                  : 'text-amber-300'
              }`}
            >
              {effective.downstreamLevelM.toFixed(2)}
            </span>
            <span className="ml-1 text-xs text-slate-400">m</span>
          </div>
          <span
            className={`rounded px-2 py-0.5 text-[10px] font-bold ${
              effective.canDischarge
                ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                : 'bg-red-950 text-red-200 border border-red-700'
            }`}
          >
            {effective.canDischarge ? '✓ 允许安全排水' : '⛔ 联锁闭锁禁排'}
          </span>
        </div>
        <div className="flex items-center justify-between font-mono text-[10px] text-slate-400">
          <span>水头差 ΔH: {headDiffM >= 0 ? `+${headDiffM.toFixed(2)}` : headDiffM.toFixed(2)}m</span>
          <span className="truncate text-amber-300" title={effective.interlockReasonCode}>
            {effective.interlockReasonCode}
          </span>
        </div>
      </div>

      {/* KPI 5: Dual-Track Flood Mitigation Summary */}
      <div className="flex flex-col justify-between rounded-xl border border-slate-800 bg-slate-900/90 p-3.5 shadow">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-medium text-slate-400">
            AI 智控 vs 传统湿地减灾成效
          </span>
          {summary.smart.totalOverflowVolumeM3 === 0 ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
          ) : (
            <AlertOctagon className="h-4 w-4 text-amber-400" />
          )}
        </div>
        <div className="my-1 flex items-baseline justify-between font-mono">
          <div>
            <span className="text-xl font-bold text-emerald-400">
              +{summary.mitigation.avoidedOverflowVolumeM3.toLocaleString()}
            </span>
            <span className="ml-1 text-xs text-slate-400">m³ 避免溢流</span>
          </div>
        </div>
        <div className="flex items-center justify-between font-mono text-[10px] text-slate-400">
          <span>
            传统峰值:{' '}
            <strong
              className={
                summary.traditional.peakWaterLevelM > H_MAX_CRITICAL_M
                  ? 'text-red-400'
                  : 'text-slate-200'
              }
            >
              {summary.traditional.peakWaterLevelM.toFixed(2)}m
            </strong>
          </span>
          <span>
            AI峰值:{' '}
            <strong className="text-emerald-300">
              {summary.smart.peakWaterLevelM.toFixed(2)}m
            </strong>{' '}
            (削峰 {summary.mitigation.peakLevelReductionM.toFixed(2)}m)
          </span>
        </div>
      </div>
    </section>
  );
}
