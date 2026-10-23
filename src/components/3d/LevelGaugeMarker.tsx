/**
 * @file LevelGaugeMarker.tsx
 * @description 3D ultrasonic level gauge tower inside the wetland basin with
 * glowing threshold rings at H_min (1.0 m), H_normal (2.0 m) and H_max (3.5 m).
 */

import { Html } from '@react-three/drei';
import {
  H_MAX_CRITICAL_M,
  H_MIN_ECOLOGICAL_M,
  H_NORMAL_OPERATING_M,
} from '../../constants/hydrologyConstants';
import { levelToSceneY } from './sceneCoordinates';
import { GAUGE_TOWER_POS } from './WetlandParkTerrain';

interface LevelGaugeMarkerProps {
  currentLevelM: number;
  position?: [number, number, number];
}

const THRESHOLD_RINGS: ReadonlyArray<{
  levelM: number;
  label: string;
  color: string;
}> = [
  { levelM: H_MIN_ECOLOGICAL_M, label: '1.0m Ecological Datum', color: '#22c55e' },
  { levelM: H_NORMAL_OPERATING_M, label: '2.0m Baseline', color: '#38bdf8' },
  { levelM: H_MAX_CRITICAL_M, label: '3.5m Spillway Threshold', color: '#ef4444' },
];

export function LevelGaugeMarker({
  currentLevelM,
  position = GAUGE_TOWER_POS,
}: LevelGaugeMarkerProps) {
  const towerHeight = levelToSceneY(4.15);
  const currentY = levelToSceneY(currentLevelM);

  return (
    <group position={position}>
      {/* Concrete base */}
      <mesh position={[0, 0.15, 0]} receiveShadow castShadow>
        <cylinderGeometry args={[0.45, 0.55, 0.3, 16]} />
        <meshStandardMaterial color="#334155" roughness={0.8} />
      </mesh>

      {/* Vertical stainless steel gauge mast */}
      <mesh position={[0, towerHeight / 2, 0]} castShadow>
        <cylinderGeometry args={[0.1, 0.1, towerHeight, 16]} />
        <meshStandardMaterial color="#94a3b8" metalness={0.6} roughness={0.3} />
      </mesh>

      {/* Ultrasonic sensor head at top */}
      <mesh position={[0, towerHeight + 0.2, 0]} castShadow>
        <boxGeometry args={[0.55, 0.3, 0.55]} />
        <meshStandardMaterial color="#0f172a" metalness={0.5} roughness={0.4} />
      </mesh>

      {/* Glowing threshold rings */}
      {THRESHOLD_RINGS.map((ring) => {
        const y = levelToSceneY(ring.levelM);
        return (
          <group key={ring.label} position={[0, y, 0]}>
            <mesh rotation={[Math.PI / 2, 0, 0]}>
              <torusGeometry args={[0.32, 0.045, 12, 28]} />
              <meshStandardMaterial
                color={ring.color}
                emissive={ring.color}
                emissiveIntensity={0.8}
              />
            </mesh>
          </group>
        );
      })}

      {/* Floating current water level indicator ring */}
      <mesh position={[0, currentY, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.46, 0.06, 12, 32]} />
        <meshStandardMaterial
          color="#f8fafc"
          emissive="#38bdf8"
          emissiveIntensity={1.1}
        />
      </mesh>

      {/* Floating HTML readout above the ultrasonic mast */}
      <Html
        position={[0, towerHeight + 0.9, 0]}
        center
        zIndexRange={[10, 0]}
      >
        <div className="pointer-events-none select-none whitespace-nowrap rounded-lg border border-cyan-500/50 bg-slate-950/90 px-2.5 py-1 text-center font-mono text-[11px] shadow-lg backdrop-blur">
          <div className="text-[9px] uppercase tracking-wider text-slate-400">
            Ultrasonic Level Gauge
          </div>
          <div className="text-xs font-bold text-cyan-300">
            {currentLevelM.toFixed(2)} m
          </div>
        </div>
      </Html>
    </group>
  );
}
