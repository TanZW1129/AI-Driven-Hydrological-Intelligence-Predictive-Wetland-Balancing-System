/**
 * @file WetlandSceneCanvas.tsx
 * @description Main 3D Digital Twin viewport container combining the 125-acre
 * wetland basin, ultrasonic gauge tower, motorized dual-bay sluice gate and
 * downstream Klang tidal channel with HUD camera preset controls.
 */

import { Canvas } from '@react-three/fiber';
import { Camera, Eye, EyeOff, Layers } from 'lucide-react';
import { Suspense } from 'react';
import {
  selectEffectiveFrame,
  useSimulationStore,
  type CameraViewPreset,
} from '../../store/simulationStore';
import { CameraController } from './CameraController';
import { DownstreamBasinMesh } from './DownstreamBasinMesh';
import { LevelGaugeMarker } from './LevelGaugeMarker';
import { CAMERA_PRESETS } from './sceneCoordinates';
import { SluiceGateMesh } from './SluiceGateMesh';
import { WetlandBasinMesh } from './WetlandBasinMesh';

const PRESET_BUTTONS: ReadonlyArray<{ id: CameraViewPreset; label: string }> = [
  { id: 'OVERVIEW', label: '全景概览' },
  { id: 'GATE', label: '聚焦水闸' },
  { id: 'WETLAND', label: '125英亩湿地' },
  { id: 'DOWNSTREAM', label: '下游海潮' },
];

export function WetlandSceneCanvas() {
  const state = useSimulationStore();
  const effective = selectEffectiveFrame(state);

  return (
    <div className="relative h-full min-h-[420px] w-full overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 shadow-2xl">
      {/* Top-Left HUD Overlay: Scene Title & Legend */}
      <div className="pointer-events-none absolute left-3.5 top-3.5 z-10 flex flex-col gap-1.5">
        <div className="flex items-center gap-2 rounded-xl border border-slate-700/80 bg-slate-900/85 px-3 py-1.5 backdrop-blur">
          <Layers className="h-4 w-4 text-cyan-400" />
          <span className="text-xs font-semibold text-white">
            BBR 125英亩湿地 — 3D 实时数字孪生沙盘
          </span>
          <span className="rounded bg-cyan-950 px-1.5 py-0.5 font-mono text-[10px] text-cyan-300">
            T+{effective.hourOffset.toFixed(1)}h
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 rounded-xl border border-slate-800/80 bg-slate-950/80 px-3 py-1.5 font-mono text-[10px] text-slate-300 backdrop-blur">
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-full bg-emerald-400" />
            1.0m 生态底线
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-full bg-sky-400" />
            2.0m 常态
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-full bg-red-500" />
            3.5m 溢流红线
          </span>
          {state.showTraditionalGhostIn3D && (
            <span className="flex items-center gap-1 text-orange-300">
              <span className="inline-block h-2 w-2 border border-orange-400" />
              传统无控水位 ({effective.traditionalLevelM.toFixed(2)}m)
            </span>
          )}
        </div>
      </div>

      {/* Top-Right HUD Overlay: Camera Presets & Ghost Toggle */}
      <div className="absolute right-3.5 top-3.5 z-10 flex flex-wrap items-center gap-1.5">
        <div className="flex items-center gap-1 rounded-xl border border-slate-700/80 bg-slate-900/85 p-1 backdrop-blur">
          <Camera className="ml-1.5 h-3.5 w-3.5 text-slate-400" />
          {PRESET_BUTTONS.map((btn) => (
            <button
              key={btn.id}
              type="button"
              onClick={() => state.setCameraPreset(btn.id)}
              className={`rounded-lg px-2.5 py-1 text-[11px] font-medium transition-all ${
                state.cameraPreset === btn.id
                  ? 'bg-cyan-600 text-white shadow'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              {btn.label}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={state.toggleTraditionalGhost}
          title="在 3D 沙盘中显示/隐藏传统无控湿地水位网格对比"
          className={`flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-[11px] font-medium backdrop-blur transition-all ${
            state.showTraditionalGhostIn3D
              ? 'border-orange-500/60 bg-orange-950/70 text-orange-200'
              : 'border-slate-700/80 bg-slate-900/85 text-slate-400 hover:text-white'
          }`}
        >
          {state.showTraditionalGhostIn3D ? (
            <Eye className="h-3.5 w-3.5" />
          ) : (
            <EyeOff className="h-3.5 w-3.5" />
          )}
          传统水位对比网
        </button>
      </div>

      {/* Bottom-Left HUD Hint */}
      <div className="pointer-events-none absolute bottom-3 left-3.5 z-10 rounded-lg bg-slate-950/75 px-2.5 py-1 font-mono text-[10px] text-slate-400 backdrop-blur">
        鼠标左键: 360°旋转 · 右键: 平移 · 滚轮: 缩放 · 水流方向: 左(上游) → 右(巴生海峡)
      </div>

      {/* Three.js WebGL Canvas */}
      <Canvas
        shadows
        dpr={[1, 2]}
        camera={{
          position: CAMERA_PRESETS.OVERVIEW.position,
          fov: 42,
          near: 0.5,
          far: 180,
        }}
      >
        <color attach="background" args={['#060b16']} />
        <fog attach="fog" args={['#060b16', 38, 95]} />

        <ambientLight intensity={0.65} />
        <directionalLight
          position={[16, 28, 18]}
          intensity={1.35}
          castShadow
          shadow-mapSize={[1024, 1024]}
        />
        <hemisphereLight args={['#38bdf8', '#0f172a', 0.45]} />

        <Suspense fallback={null}>
          {/* Reference Sub-floor Grid */}
          <gridHelper
            args={[64, 32, '#1e293b', '#0f172a']}
            position={[2, -0.31, 0]}
          />

          {/* 1. Upstream Catchment & 125-Acre Wetland Basin */}
          <WetlandBasinMesh
            wetlandLevelM={effective.wetlandLevelM}
            traditionalLevelM={effective.traditionalLevelM}
            inflowM3PerS={effective.inflowM3PerS}
            rainfallMmPerHr={effective.rainfallIntensityMmPerHr}
            showTraditionalGhost={state.showTraditionalGhostIn3D}
          />

          {/* 2. Ultrasonic Water Level Gauge Tower */}
          <LevelGaugeMarker currentLevelM={effective.wetlandLevelM} />

          {/* 3. Motorized Dual-Bay Sluice Gate & Beacon */}
          <SluiceGateMesh
            gateOpeningM={effective.gateOpeningM}
            targetGateOpeningM={effective.targetGateOpeningM}
            outflowM3PerS={effective.outflowM3PerS}
            phase={effective.phase}
            canDischarge={effective.canDischarge}
            interlockReasonCode={effective.interlockReasonCode}
          />

          {/* 4. Downstream Klang River / Strait Tidal Channel */}
          <DownstreamBasinMesh
            downstreamLevelM={effective.downstreamLevelM}
            wetlandLevelM={effective.wetlandLevelM}
          />

          {/* 5. Orbit & Preset Camera Controller */}
          <CameraController preset={state.cameraPreset} />
        </Suspense>
      </Canvas>
    </div>
  );
}
