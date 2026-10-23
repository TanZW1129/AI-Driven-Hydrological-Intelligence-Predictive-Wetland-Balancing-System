/**
 * @file DownstreamBasinMesh.tsx
 * @description 3D model of the downstream Klang River / Klang Strait tidal
 * receiving channel with dynamic tidal elevation and the 2.5 m critical
 * downstream safety threshold marker.
 */

import { Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import * as THREE from 'three';
import { DOWNSTREAM_CRITICAL_LEVEL_M } from '../../constants/hydrologyConstants';
import {
  DOWNSTREAM_CENTER_X,
  DOWNSTREAM_DEPTH_Z,
  DOWNSTREAM_WIDTH_X,
  levelToSceneY,
} from './sceneCoordinates';

interface DownstreamBasinMeshProps {
  downstreamLevelM: number;
  wetlandLevelM: number;
}

const CHANNEL_WALL_HEIGHT_Y = levelToSceneY(3.65);

export function DownstreamBasinMesh({
  downstreamLevelM,
  wetlandLevelM,
}: DownstreamBasinMeshProps) {
  const tideWaterRef = useRef<THREE.Mesh>(null);
  const displayedDownstreamRef = useRef(downstreamLevelM);

  useFrame((state, delta) => {
    displayedDownstreamRef.current = THREE.MathUtils.lerp(
      displayedDownstreamRef.current,
      downstreamLevelM,
      Math.min(1, delta * 6),
    );

    const tideY = levelToSceneY(displayedDownstreamRef.current);
    const swell = Math.sin(state.clock.elapsedTime * 1.8 + 1.2) * 0.03;

    if (tideWaterRef.current) {
      tideWaterRef.current.scale.y = Math.max(0.05, tideY + swell);
      tideWaterRef.current.position.y = (tideY + swell) / 2;
    }
  });

  const criticalY = levelToSceneY(DOWNSTREAM_CRITICAL_LEVEL_M);
  const isCritical = downstreamLevelM >= DOWNSTREAM_CRITICAL_LEVEL_M;
  const isTidalLock = downstreamLevelM >= wetlandLevelM - 0.1;

  return (
    <group>
      {/* Channel Bed */}
      <mesh position={[DOWNSTREAM_CENTER_X, -0.15, 0]} receiveShadow>
        <boxGeometry args={[DOWNSTREAM_WIDTH_X, 0.3, DOWNSTREAM_DEPTH_Z]} />
        <meshStandardMaterial color="#1e293b" roughness={0.9} />
      </mesh>

      {/* North & South Concrete Channel Embankments */}
      <mesh
        position={[
          DOWNSTREAM_CENTER_X,
          CHANNEL_WALL_HEIGHT_Y / 2,
          -(DOWNSTREAM_DEPTH_Z / 2 + 0.9),
        ]}
        receiveShadow
        castShadow
      >
        <boxGeometry args={[DOWNSTREAM_WIDTH_X, CHANNEL_WALL_HEIGHT_Y, 1.8]} />
        <meshStandardMaterial color="#334155" roughness={0.8} />
      </mesh>
      <mesh
        position={[
          DOWNSTREAM_CENTER_X,
          CHANNEL_WALL_HEIGHT_Y / 2,
          DOWNSTREAM_DEPTH_Z / 2 + 0.9,
        ]}
        receiveShadow
        castShadow
      >
        <boxGeometry args={[DOWNSTREAM_WIDTH_X, CHANNEL_WALL_HEIGHT_Y, 1.8]} />
        <meshStandardMaterial color="#334155" roughness={0.8} />
      </mesh>

      {/* 2.5m Critical Downstream Threshold Line along Channel Walls */}
      <mesh
        position={[
          DOWNSTREAM_CENTER_X,
          criticalY,
          -(DOWNSTREAM_DEPTH_Z / 2 - 0.04),
        ]}
      >
        <boxGeometry args={[DOWNSTREAM_WIDTH_X - 0.2, 0.08, 0.06]} />
        <meshStandardMaterial
          color="#ef4444"
          emissive="#ef4444"
          emissiveIntensity={0.85}
        />
      </mesh>
      <mesh
        position={[
          DOWNSTREAM_CENTER_X,
          criticalY,
          DOWNSTREAM_DEPTH_Z / 2 - 0.04,
        ]}
      >
        <boxGeometry args={[DOWNSTREAM_WIDTH_X - 0.2, 0.08, 0.06]} />
        <meshStandardMaterial
          color="#ef4444"
          emissive="#ef4444"
          emissiveIntensity={0.85}
        />
      </mesh>

      {/* Dynamic Downstream Tidal Water Body */}
      <mesh ref={tideWaterRef} position={[DOWNSTREAM_CENTER_X, 1, 0]} receiveShadow>
        <boxGeometry
          args={[DOWNSTREAM_WIDTH_X - 0.1, 1, DOWNSTREAM_DEPTH_Z - 0.1]}
        />
        <meshStandardMaterial
          color={isCritical ? '#dc2626' : isTidalLock ? '#f59e0b' : '#0284c7'}
          emissive={isCritical ? '#7f1d1d' : '#0c4a6e'}
          emissiveIntensity={0.25}
          transparent
          opacity={0.78}
          roughness={0.22}
          metalness={0.15}
        />
      </mesh>

      {/* Downstream Tidal Gauge Floating Tag */}
      <Html
        position={[DOWNSTREAM_CENTER_X - 1.5, CHANNEL_WALL_HEIGHT_Y + 1.2, 0]}
        center
        zIndexRange={[10, 0]}
      >
        <div
          className={`pointer-events-none select-none whitespace-nowrap rounded-lg border px-3 py-1.5 text-center font-mono text-[11px] shadow-lg backdrop-blur ${
            isCritical || isTidalLock
              ? 'border-amber-500/80 bg-amber-950/90 text-amber-200'
              : 'border-slate-700 bg-slate-950/90 text-slate-200'
          }`}
        >
          <div className="text-[9px] text-slate-400">
            Downstream Tidal Level (Limit 2.5m)
          </div>
          <div className="text-xs font-bold text-amber-300">
            {downstreamLevelM.toFixed(2)} m{' '}
            {isCritical ? '⚠️ CRITICAL LIMIT' : isTidalLock ? '⚠️ TIDAL LOCK' : '✓ NORMAL'}
          </div>
        </div>
      </Html>
    </group>
  );
}
