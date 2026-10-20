/**
 * @file SluiceGateMesh.tsx
 * @description 3D model of the motorized dual-bay vertical lift sluice gate
 * separating the 125-acre wetland from the downstream Klang tidal channel.
 *
 * Includes:
 *   - Concrete dam wall & centre pier
 *   - Overhead hoist bridge & hydraulic lift cylinders
 *   - Dual steel gate leaves animated by actual opening O_gate ∈ [0, 2.0 m]
 *   - Turbulent discharge water jet when Q_out > 0
 *   - Overhead 3D safety / phase beacon with flashing red interlock alert
 */

import { Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import * as THREE from 'three';
import { GATE_MAX_OPENING_M } from '../../constants/hydrologyConstants';
import type { ControlPhase, InterlockReasonCode } from '../../types/hydrology';
import {
  GATE_DAM_X,
  SCENE_Y_PER_METRE,
  WETLAND_DEPTH_Z,
} from './sceneCoordinates';

interface SluiceGateMeshProps {
  gateOpeningM: number;
  targetGateOpeningM: number;
  outflowM3PerS: number;
  phase: ControlPhase;
  canDischarge: boolean;
  interlockReasonCode: InterlockReasonCode;
}

const DAM_HEIGHT_Y = 3.9 * SCENE_Y_PER_METRE;
const GATE_LEAF_HEIGHT_Y = GATE_MAX_OPENING_M * SCENE_Y_PER_METRE;
const BAY_OFFSETS_Z: readonly [number, number] = [-2.1, 2.1];

const PHASE_BEACON_COLORS: Readonly<Record<ControlPhase, string>> = {
  NORMAL: '#22c55e',
  PRE_DISCHARGE: '#3b82f6',
  PEAK_SHAVING: '#f59e0b',
  RECOVERY: '#a855f7',
  INTERLOCK_SUSPENDED: '#ef4444',
};

export function SluiceGateMesh({
  gateOpeningM,
  targetGateOpeningM,
  outflowM3PerS,
  phase,
  canDischarge,
  interlockReasonCode,
}: SluiceGateMeshProps) {
  const leftLeafRef = useRef<THREE.Mesh>(null);
  const rightLeafRef = useRef<THREE.Mesh>(null);
  const dischargeJetRef = useRef<THREE.Group>(null);
  const beaconRef = useRef<THREE.Mesh>(null);

  const displayedOpeningRef = useRef(gateOpeningM);

  useFrame((state, delta) => {
    displayedOpeningRef.current = THREE.MathUtils.lerp(
      displayedOpeningRef.current,
      gateOpeningM,
      Math.min(1, delta * 8),
    );

    const liftY = displayedOpeningRef.current * SCENE_Y_PER_METRE;
    const leafCenterY = GATE_LEAF_HEIGHT_Y / 2 + liftY;

    if (leftLeafRef.current) leftLeafRef.current.position.y = leafCenterY;
    if (rightLeafRef.current) rightLeafRef.current.position.y = leafCenterY;

    if (dischargeJetRef.current) {
      const pulse = 0.9 + 0.12 * Math.sin(state.clock.elapsedTime * 16);
      dischargeJetRef.current.scale.set(pulse, 1, 1);
    }

    // Pulse red beacon rapidly when interlock is suspended
    if (beaconRef.current) {
      const mat = beaconRef.current.material as THREE.MeshStandardMaterial;
      if (phase === 'INTERLOCK_SUSPENDED' || !canDischarge) {
        mat.emissiveIntensity = 0.6 + 0.9 * Math.abs(Math.sin(state.clock.elapsedTime * 8));
      } else {
        mat.emissiveIntensity = 0.9;
      }
    }
  });

  const beaconColor = !canDischarge ? '#ef4444' : PHASE_BEACON_COLORS[phase];
  const openingPct = Math.round((gateOpeningM / GATE_MAX_OPENING_M) * 100);

  return (
    <group position={[GATE_DAM_X, 0, 0]}>
      {/* North & South Concrete Wing Walls */}
      <mesh position={[0, DAM_HEIGHT_Y / 2, -6.5]} receiveShadow castShadow>
        <boxGeometry args={[1.6, DAM_HEIGHT_Y, 4.6]} />
        <meshStandardMaterial color="#475569" roughness={0.75} />
      </mesh>
      <mesh position={[0, DAM_HEIGHT_Y / 2, 6.5]} receiveShadow castShadow>
        <boxGeometry args={[1.6, DAM_HEIGHT_Y, 4.6]} />
        <meshStandardMaterial color="#475569" roughness={0.75} />
      </mesh>

      {/* Outer & Centre Sluice Gate Piers */}
      {[-4.0, 0, 4.0].map((pierZ) => (
        <mesh
          key={pierZ}
          position={[0, (DAM_HEIGHT_Y + 1.4) / 2, pierZ]}
          receiveShadow
          castShadow
        >
          <boxGeometry args={[2.0, DAM_HEIGHT_Y + 1.4, 0.85]} />
          <meshStandardMaterial color="#64748b" roughness={0.65} />
        </mesh>
      ))}

      {/* Concrete Upper Breast Wall (above 2.0m gate opening up to dam crest) */}
      <mesh
        position={[
          0,
          GATE_LEAF_HEIGHT_Y + (DAM_HEIGHT_Y - GATE_LEAF_HEIGHT_Y) / 2,
          0,
        ]}
        receiveShadow
        castShadow
      >
        <boxGeometry
          args={[1.2, DAM_HEIGHT_Y - GATE_LEAF_HEIGHT_Y, 7.4]}
        />
        <meshStandardMaterial color="#475569" roughness={0.75} />
      </mesh>

      {/* Overhead Hoist Gantry Deck */}
      <mesh position={[0, DAM_HEIGHT_Y + 1.55, 0]} receiveShadow castShadow>
        <boxGeometry args={[2.4, 0.35, 9.2]} />
        <meshStandardMaterial color="#1e293b" metalness={0.5} roughness={0.4} />
      </mesh>

      {/* Motorized Hoist Gearboxes above each gate bay */}
      {BAY_OFFSETS_Z.map((bayZ) => (
        <group key={bayZ} position={[0, DAM_HEIGHT_Y + 1.95, bayZ]}>
          <mesh castShadow>
            <boxGeometry args={[1.1, 0.55, 1.3]} />
            <meshStandardMaterial color="#0f172a" metalness={0.7} roughness={0.3} />
          </mesh>
          {/* Threaded hoist spindle */}
          <mesh position={[0, -1.2, 0]}>
            <cylinderGeometry args={[0.08, 0.08, 2.8, 12]} />
            <meshStandardMaterial color="#cbd5e1" metalness={0.85} roughness={0.2} />
          </mesh>
        </group>
      ))}

      {/* Dual Vertical Lift Steel Gate Leaves */}
      <mesh
        ref={leftLeafRef}
        position={[0, GATE_LEAF_HEIGHT_Y / 2, BAY_OFFSETS_Z[0]]}
        castShadow
      >
        <boxGeometry args={[0.32, GATE_LEAF_HEIGHT_Y, 3.1]} />
        <meshStandardMaterial color="#0284c7" metalness={0.65} roughness={0.35} />
      </mesh>

      <mesh
        ref={rightLeafRef}
        position={[0, GATE_LEAF_HEIGHT_Y / 2, BAY_OFFSETS_Z[1]]}
        castShadow
      >
        <boxGeometry args={[0.32, GATE_LEAF_HEIGHT_Y, 3.1]} />
        <meshStandardMaterial color="#0284c7" metalness={0.65} roughness={0.35} />
      </mesh>

      {/* Discharge Water Jet & Whitewater Foam when Q_out > 0 */}
      {outflowM3PerS > 0.05 && gateOpeningM > 0.02 && (
        <group ref={dischargeJetRef} position={[1.1, 0, 0]}>
          {BAY_OFFSETS_Z.map((bayZ) => {
            const jetHeight = Math.max(0.25, Math.min(gateOpeningM, 1.4) * SCENE_Y_PER_METRE);
            return (
              <mesh
                key={bayZ}
                position={[0.6, jetHeight / 2 + 0.05, bayZ]}
                rotation={[0, 0, -0.08]}
              >
                <boxGeometry args={[2.6, jetHeight, 2.8]} />
                <meshStandardMaterial
                  color="#7dd3fc"
                  emissive="#38bdf8"
                  emissiveIntensity={0.75}
                  transparent
                  opacity={Math.min(0.92, 0.45 + outflowM3PerS / 70)}
                />
              </mesh>
            );
          })}
        </group>
      )}

      {/* Overhead 3D Status Beacon Sphere */}
      <mesh ref={beaconRef} position={[0, DAM_HEIGHT_Y + 2.65, 0]}>
        <sphereGeometry args={[0.42, 24, 24]} />
        <meshStandardMaterial
          color={beaconColor}
          emissive={beaconColor}
          emissiveIntensity={0.9}
        />
      </mesh>

      {/* Floating Sluice Gate Status Badge */}
      <Html
        position={[0, DAM_HEIGHT_Y + 3.65, 0]}
        center
        distanceFactor={22}
        zIndexRange={[10, 0]}
      >
        <div
          className={`pointer-events-none select-none whitespace-nowrap rounded-lg border px-2.5 py-1 text-center font-mono text-[11px] shadow-xl backdrop-blur ${
            !canDischarge || phase === 'INTERLOCK_SUSPENDED'
              ? 'border-red-500/80 bg-red-950/90 text-red-200'
              : 'border-slate-600/80 bg-slate-950/90 text-slate-100'
          }`}
        >
          <div className="text-[9px] uppercase tracking-wider text-slate-400">
            双孔电动水闸 ({openingPct}%)
          </div>
          <div className="text-xs font-bold">
            开度 {gateOpeningM.toFixed(2)}m → 目标 {targetGateOpeningM.toFixed(1)}m
          </div>
          <div className="text-[10px] text-emerald-300">
            Q_out: {outflowM3PerS.toFixed(1)} m³/s ({interlockReasonCode})
          </div>
        </div>
      </Html>

      {/* Outer retaining wall segments closing the wetland perimeter */}
      <mesh
        position={[0, DAM_HEIGHT_Y / 2, -(WETLAND_DEPTH_Z / 2 + 0.5)]}
        receiveShadow
      >
        <boxGeometry args={[1.6, DAM_HEIGHT_Y, 1.2]} />
        <meshStandardMaterial color="#334155" />
      </mesh>
      <mesh
        position={[0, DAM_HEIGHT_Y / 2, WETLAND_DEPTH_Z / 2 + 0.5]}
        receiveShadow
      >
        <boxGeometry args={[1.6, DAM_HEIGHT_Y, 1.2]} />
        <meshStandardMaterial color="#334155" />
      </mesh>
    </group>
  );
}
