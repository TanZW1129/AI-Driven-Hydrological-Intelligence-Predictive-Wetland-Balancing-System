/**
 * @file TelemetryDiagnostic.tsx
 * @description Real-time state machine diagnostic readout, virtual IoT sensor
 * telemetry card, Manual Gate Override and Live Downstream Surge Injector for
 * testing pre-discharge authorisation and mid-discharge auto-halt.
 */

import {
   Cpu,
  Lock,
  Radio,
  RotateCcw,
  ShieldAlert,
  Sliders,
  Unlock,
} from 'lucide-react';
import {
  DOWNSTREAM_CRITICAL_LEVEL_M,
  GATE_MAX_OPENING_M,
} from '../../constants/hydrologyConstants';
import {
  selectEffectiveFrame,
  useSimulationStore,
} from '../../store/simulationStore';

export function TelemetryDiagnostic() {
  const state = useSimulationStore();
  const effective = selectEffectiveFrame(state);

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-slate-800 bg-slate-900/90 p-4 shadow-xl">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
        <div className="flex items-center gap-2">
          <Cpu className="h-4 w-4 text-cyan-400" />
          <h2 className="text-xs font-semibold text-white">
            State Machine Decision &amp; Safety Interlock Testbed
          </h2>
        </div>

        {/* Control Mode Switcher */}
        <div className="flex items-center rounded-lg border border-slate-700 bg-slate-950 p-0.5 text-[11px]">
          <button
            type="button"
            onClick={() => state.setControlMode('AUTO_AI')}
            className={`rounded-md px-2 py-0.5 font-medium transition-all ${
              state.controlMode === 'AUTO_AI'
                ? 'bg-cyan-600 text-white'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            AI Autonomous
          </button>
          <button
            type="button"
            onClick={() => state.setControlMode('MANUAL_OVERRIDE')}
            className={`rounded-md px-2 py-0.5 font-medium transition-all ${
              state.controlMode === 'MANUAL_OVERRIDE'
                ? 'bg-purple-600 text-white'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Manual Override
          </button>
        </div>
      </div>

      {/* State Machine Decision Rationale Box */}
      <div
        className={`rounded-xl border p-3 font-mono text-xs leading-relaxed ${
          !effective.canDischarge
            ? 'border-red-500/70 bg-red-950/50 text-red-200'
            : 'border-slate-800 bg-slate-950/90 text-slate-200'
        }`}
      >
        <div className="mb-1 flex items-center justify-between text-[10px] text-slate-400">
          <span className="flex items-center gap-1 font-semibold text-cyan-400">
            <Radio className="h-3 w-3 animate-pulse" /> Live Control Rationale
          </span>
          <span>Forecast 6h Rain: {effective.forecast6hRainMm} mm</span>
        </div>
        <div>{effective.decisionReason}</div>
      </div>

      {/* Interactive Downstream Safety Interlock & Manual Gate Testbed */}
      <div className="space-y-3 rounded-xl border border-slate-800/90 bg-slate-950/70 p-3">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-xs font-semibold text-amber-300">
            <Sliders className="h-3.5 w-3.5" />
            Full-Lifecycle Downstream Safety Interlock Verifier
          </span>
          {state.manualInterlockState.isLockedOut && (
            <button
              type="button"
              onClick={state.resetInterlockLatch}
              className="flex items-center gap-1 rounded bg-slate-800 px-2 py-0.5 font-mono text-[10px] text-slate-300 hover:bg-slate-700"
            >
              <RotateCcw className="h-3 w-3" /> Reset Latch Trips
            </button>
          )}
        </div>

        {/* Manual Gate Slider */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-slate-400">
              {state.controlMode === 'MANUAL_OVERRIDE'
                ? 'Manual Target Gate Opening (Requested):'
                : 'AI State Machine Target (Switch to Manual to Adjust):'}
            </span>
            <span className="font-mono font-bold text-purple-300">
              Target {effective.targetGateOpeningM.toFixed(2)}m → Actual Guarded{' '}
              <strong
                className={
                  effective.gateOpeningM > 0 ? 'text-emerald-400' : 'text-red-400'
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
              if (state.controlMode !== 'MANUAL_OVERRIDE') {
                state.setControlMode('MANUAL_OVERRIDE');
              }
              state.setManualGateTarget(Number(e.target.value));
            }}
            className="w-full accent-purple-500"
          />
        </div>

        {/* Live Downstream Surge Injector */}
        <div className="space-y-1 pt-1">
          <div className="flex items-center justify-between text-[11px]">
            <label className="flex cursor-pointer items-center gap-1.5 text-slate-300">
              <input
                type="checkbox"
                checked={state.downstreamOverrideEnabled}
                onChange={(e) =>
                  state.setDownstreamOverride(
                    e.target.checked,
                    effective.downstreamLevelM,
                  )
                }
                className="rounded accent-amber-500"
              />
              <span>Inject Downstream Surge (Simulate mid-drain storm tide / river overflow)</span>
            </label>
            <span
              className={`font-mono font-bold ${
                effective.downstreamLevelM >= DOWNSTREAM_CRITICAL_LEVEL_M
                  ? 'text-red-400'
                  : 'text-amber-300'
              }`}
            >
              H_down = {effective.downstreamLevelM.toFixed(2)} m
            </span>
          </div>

          <input
            type="range"
            min={0.6}
            max={3.1}
            step={0.05}
            value={effective.downstreamLevelM}
            onChange={(e) =>
              state.setDownstreamOverride(true, Number(e.target.value))
            }
            className="w-full accent-amber-500"
          />
          <div className="flex justify-between font-mono text-[10px] text-slate-400">
            <span>0.6m (Low Tide Safe)</span>
            <span className="text-emerald-400">≤2.35m Hysteresis Unlock</span>
            <span className="text-red-400">≥2.50m Instant Safety Trip</span>
          </div>
        </div>

        {/* Interlock Status Readout */}
        <div className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-900/90 px-2.5 py-1.5 font-mono text-[11px]">
          <span className="flex items-center gap-1.5">
            {effective.activeLockout ? (
              <Lock className="h-3.5 w-3.5 text-red-400" />
            ) : (
              <Unlock className="h-3.5 w-3.5 text-emerald-400" />
            )}
            <span className="text-slate-300">
              Interlock Status:{' '}
              <strong
                className={
                  effective.activeLockout ? 'text-red-400' : 'text-emerald-400'
                }
              >
                {effective.activeLockout ? 'LATCHED (Emergency Trip)' : 'UNLOCKED'}
              </strong>
            </span>
          </span>
          <span className="text-slate-400">
            Total Safety Trips: <strong className="text-amber-300">{state.manualInterlockState.tripCount}</strong> times
          </span>
        </div>

        {state.interlockEvents.length > 0 && (
          <div className="max-h-20 overflow-y-auto rounded-lg border border-slate-800/80 bg-slate-950 p-2 font-mono text-[10px] text-slate-300">
            {state.interlockEvents.slice(0, 3).map((evt, idx) => (
              <div
                key={idx}
                className={`flex items-center gap-1.5 ${
                  evt.type === 'EMERGENCY_HALT' ? 'text-red-300' : 'text-emerald-300'
                }`}
              >
                <ShieldAlert className="h-3 w-3 shrink-0" />
                <span className="truncate">
                  [H_down={evt.downstreamLevelM.toFixed(2)}m] {evt.message}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Virtual IoT Sensor Telemetry Strip */}
      <div className="grid grid-cols-3 gap-2 font-mono text-[10px]">
        <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-2">
          <div className="text-slate-400">Ultrasonic Level Sensor</div>
          <div className="mt-0.5 text-xs font-bold text-cyan-300">
            {effective.measuredWetlandLevelM.toFixed(3)} m
          </div>
          <div className="text-[9px] text-emerald-400">STATUS: HEALTHY</div>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-2">
          <div className="text-slate-400">Soil Moisture Sensor</div>
          <div className="mt-0.5 text-xs font-bold text-sky-300">
            {(effective.soilSaturation * 100).toFixed(1)}%
          </div>
          <div className="text-[9px] text-slate-400">TDR 0–7cm</div>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-2">
          <div className="text-slate-400">Sluice Gate Actuator</div>
          <div className="mt-0.5 text-xs font-bold text-purple-300">
            0.05 m/s
          </div>
          <div className="text-[9px] text-slate-400">Stroke 0.0–2.0m</div>
        </div>
      </div>
    </div>
  );
}
