/**
 * @file WetlandBasinMesh.tsx
 * @description 3D model of the 125-acre Bandar Bukit Raja townpark wetland basin,
 * upstream residential catchment inflow culvert, dynamic water volume, rain
 * particles and optional Traditional Unmanaged Wetland comparison ghost plane.
 */

import { Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { H_MAX_CRITICAL_M } from '../../constants/hydrologyConstants';
import {
  levelToSceneY,
  SCENE_Y_PER_METRE,
  WETLAND_CENTER_X,
  WETLAND_DEPTH_Z,
  WETLAND_WIDTH_X,
} from './sceneCoordinates';

interface WetlandBasinMeshProps {
  wetlandLevelM: number;
  traditionalLevelM: number;
  inflowM3PerS: number;
  rainfallMmPerHr: number;
  showTraditionalGhost: boolean;
}

const BANK_HEIGHT_Y = 3.8 * SCENE_Y_PER_METRE;
const RAIN_PARTICLE_COUNT = 260;

export function WetlandBasinMesh({
  wetlandLevelM,
  traditionalLevelM,
  inflowM3PerS,
  rainfallMmPerHr,
  showTraditionalGhost,
}: WetlandBasinMeshProps) {
  const waterMeshRef = useRef<THREE.Mesh>(null);
  const ghostMeshRef = useRef<THREE.Mesh>(null);
  const inflowStreamRef = useRef<THREE.Mesh>(null);
  const rainPointsRef = useRef<THREE.Points>(null);

  const displayedLevelRef = useRef(wetlandLevelM);
  const displayedTradLevelRef = useRef(traditionalLevelM);

  // Pre-allocate raindrop particle coordinates
  const rainPositions = useMemo(() => {
    const arr = new Float32Array(RAIN_PARTICLE_COUNT * 3);
    for (let i = 0; i < RAIN_PARTICLE_COUNT; i += 1) {
      arr[i * 3] = -18 + Math.random() * 40;
      arr[i * 3 + 1] = Math.random() * 14;
      arr[i * 3 + 2] = -10 + Math.random() * 20;
    }
    return arr;
  }, []);

  // Tree clusters around the townpark perimeter
  const treePositions: ReadonlyArray<[number, number, number]> = useMemo(
    () => [
      [-12, BANK_HEIGHT_Y, -9.2],
      [-8.5, BANK_HEIGHT_Y, -9.4],
      [-4.0, BANK_HEIGHT_Y, -9.1],
      [0.5, BANK_HEIGHT_Y, -9.3],
      [-11.5, BANK_HEIGHT_Y, 9.2],
      [-7.0, BANK_HEIGHT_Y, 9.4],
      [-2.5, BANK_HEIGHT_Y, 9.2],
      [1.2, BANK_HEIGHT_Y, 9.3],
    ],
    [],
  );

  useFrame((state, delta) => {
    // Smooth water level interpolation
    displayedLevelRef.current = THREE.MathUtils.lerp(
      displayedLevelRef.current,
      wetlandLevelM,
      Math.min(1, delta * 6),
    );
    displayedTradLevelRef.current = THREE.MathUtils.lerp(
      displayedTradLevelRef.current,
      traditionalLevelM,
      Math.min(1, delta * 6),
    );

    const waterHeight = levelToSceneY(displayedLevelRef.current);
    const waveOffset = Math.sin(state.clock.elapsedTime * 2.2) * 0.025;

    if (waterMeshRef.current) {
      waterMeshRef.current.scale.y = Math.max(0.05, waterHeight + waveOffset);
      waterMeshRef.current.position.y = (waterHeight + waveOffset) / 2;
    }

    if (ghostMeshRef.current) {
      const tradY = levelToSceneY(displayedTradLevelRef.current);
      ghostMeshRef.current.position.y = tradY;
    }

    if (inflowStreamRef.current) {
      const pulse = 0.85 + 0.15 * Math.sin(state.clock.elapsedTime * 10);
      inflowStreamRef.current.scale.set(1, pulse, 1);
    }

    // Animate falling rain particles when raining
    if (rainPointsRef.current && rainfallMmPerHr > 0.2) {
      const posAttr = rainPointsRef.current.geometry.getAttribute(
        'position',
      ) as THREE.BufferAttribute;
      const fallSpeed = Math.min(28, 10 + rainfallMmPerHr * 0.22) * delta;
      for (let i = 0; i < RAIN_PARTICLE_COUNT; i += 1) {
        let y = posAttr.getY(i) - fallSpeed;
        if (y < 0.5) y = 13 + Math.random() * 2;
        posAttr.setY(i, y);
      }
      posAttr.needsUpdate = true;
    }
  });

  const criticalY = levelToSceneY(H_MAX_CRITICAL_M);
  const tradIsSpilling = traditionalLevelM > H_MAX_CRITICAL_M;

  return (
    <group>
      {/* Wetland Basin Floor (Sediment & Ecological Bed) */}
      <mesh
        position={[WETLAND_CENTER_X, -0.15, 0]}
        receiveShadow
      >
        <boxGeometry args={[WETLAND_WIDTH_X, 0.3, WETLAND_DEPTH_Z]} />
        <meshStandardMaterial color="#132a23" roughness={0.95} />
      </mesh>

      {/* Ecological Vegetated Islands on Basin Floor */}
      <mesh position={[-8.5, 0.25, -2.8]} receiveShadow castShadow>
        <cylinderGeometry args={[1.6, 2.2, 0.5, 18]} />
        <meshStandardMaterial color="#15803d" roughness={0.85} />
      </mesh>
      <mesh position={[-6.0, 0.22, 3.2]} receiveShadow castShadow>
        <cylinderGeometry args={[1.3, 1.9, 0.45, 18]} />
        <meshStandardMaterial color="#166534" roughness={0.85} />
      </mesh>

      {/* North & South Townpark Grassy Embankments */}
      <mesh
        position={[WETLAND_CENTER_X, BANK_HEIGHT_Y / 2, -(WETLAND_DEPTH_Z / 2 + 1.2)]}
        receiveShadow
        castShadow
      >
        <boxGeometry args={[WETLAND_WIDTH_X + 2, BANK_HEIGHT_Y, 2.4]} />
        <meshStandardMaterial color="#14532d" roughness={0.85} />
      </mesh>
      <mesh
        position={[WETLAND_CENTER_X, BANK_HEIGHT_Y / 2, WETLAND_DEPTH_Z / 2 + 1.2]}
        receiveShadow
        castShadow
      >
        <boxGeometry args={[WETLAND_WIDTH_X + 2, BANK_HEIGHT_Y, 2.4]} />
        <meshStandardMaterial color="#14532d" roughness={0.85} />
      </mesh>

      {/* Upstream Township Terrace & Concrete Inflow Culvert (Left / West) */}
      <group position={[-16.5, 0, 0]}>
        <mesh position={[0, BANK_HEIGHT_Y / 2, 0]} receiveShadow castShadow>
          <boxGeometry args={[5.0, BANK_HEIGHT_Y, WETLAND_DEPTH_Z + 4.8]} />
          <meshStandardMaterial color="#1e293b" roughness={0.8} />
        </mesh>

        {/* Concrete Inflow Flume Channel */}
        <mesh position={[1.5, BANK_HEIGHT_Y - 0.5, 0]} receiveShadow castShadow>
          <boxGeometry args={[2.6, 1.1, 4.2]} />
          <meshStandardMaterial color="#475569" roughness={0.7} />
        </mesh>

        {/* Animated Stormwater Inflow Cascade when Q_in > 0 */}
        {inflowM3PerS > 0.1 && (
          <mesh
            ref={inflowStreamRef}
            position={[2.7, BANK_HEIGHT_Y / 2, 0]}
            rotation={[0, 0, -0.22]}
          >
            <boxGeometry args={[0.65, BANK_HEIGHT_Y * 0.9, 3.2]} />
            <meshStandardMaterial
              color="#38bdf8"
              emissive="#0284c7"
              emissiveIntensity={0.6}
              transparent
              opacity={Math.min(0.9, 0.35 + inflowM3PerS / 120)}
            />
          </mesh>
        )}

        {/* Upstream Label */}
        <Html position={[0, BANK_HEIGHT_Y + 1.3, 0]} center distanceFactor={24} zIndexRange={[10, 0]}>
          <div className="pointer-events-none select-none rounded-lg border border-slate-700 bg-slate-900/90 px-2.5 py-1 text-center font-mono text-[11px] shadow-md backdrop-blur">
            <div className="text-[9px] text-slate-400">上游 500ha 汇水入流 (Q_in)</div>
            <div className="text-xs font-bold text-sky-400">
              {inflowM3PerS.toFixed(1)} m³/s
            </div>
          </div>
        </Html>
      </group>

      {/* stylized Townpark Trees */}
      {treePositions.map(([tx, ty, tz], idx) => (
        <group key={idx} position={[tx, ty, tz]}>
          <mesh position={[0, 0.35, 0]} castShadow>
            <cylinderGeometry args={[0.12, 0.16, 0.7, 8]} />
            <meshStandardMaterial color="#78350f" />
          </mesh>
          <mesh position={[0, 1.05, 0]} castShadow>
            <coneGeometry args={[0.65, 1.4, 10]} />
            <meshStandardMaterial color="#22c55e" roughness={0.75} />
          </mesh>
        </group>
      ))}

      {/* 3.5m Critical Spillover Perimeter Warning Strip */}
      <mesh position={[WETLAND_CENTER_X, criticalY, -(WETLAND_DEPTH_Z / 2 - 0.03)]}>
        <boxGeometry args={[WETLAND_WIDTH_X - 0.2, 0.08, 0.06]} />
        <meshStandardMaterial color="#ef4444" emissive="#ef4444" emissiveIntensity={0.8} />
      </mesh>
      <mesh position={[WETLAND_CENTER_X, criticalY, WETLAND_DEPTH_Z / 2 - 0.03]}>
        <boxGeometry args={[WETLAND_WIDTH_X - 0.2, 0.08, 0.06]} />
        <meshStandardMaterial color="#ef4444" emissive="#ef4444" emissiveIntensity={0.8} />
      </mesh>

      {/* AI Smart Wetland Dynamic Water Body */}
      <mesh
        ref={waterMeshRef}
        position={[WETLAND_CENTER_X, 1, 0]}
        receiveShadow
      >
        <boxGeometry args={[WETLAND_WIDTH_X - 0.2, 1, WETLAND_DEPTH_Z - 0.2]} />
        <meshStandardMaterial
          color={wetlandLevelM > H_MAX_CRITICAL_M ? '#ef4444' : '#0ea5e9'}
          emissive={wetlandLevelM > H_MAX_CRITICAL_M ? '#7f1d1d' : '#0369a1'}
          emissiveIntensity={0.28}
          transparent
          opacity={0.76}
          roughness={0.18}
          metalness={0.15}
        />
      </mesh>

      {/* Traditional Unmanaged Wetland Comparison Ghost Plane */}
      {showTraditionalGhost && (
        <mesh
          ref={ghostMeshRef}
          position={[WETLAND_CENTER_X, levelToSceneY(traditionalLevelM), 0]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <planeGeometry args={[WETLAND_WIDTH_X - 0.3, WETLAND_DEPTH_Z - 0.3, 8, 8]} />
          <meshBasicMaterial
            color={tradIsSpilling ? '#ef4444' : '#f97316'}
            wireframe
            transparent
            opacity={0.55}
          />
        </mesh>
      )}

      {/* Rain Particle System */}
      {rainfallMmPerHr > 0.2 && (
        <points ref={rainPointsRef}>
          <bufferGeometry>
            <bufferAttribute
              attach="attributes-position"
              args={[rainPositions, 3]}
            />
          </bufferGeometry>
          <pointsMaterial
            color="#7dd3fc"
            size={0.16}
            transparent
            opacity={Math.min(0.85, 0.25 + rainfallMmPerHr / 110)}
          />
        </points>
      )}
    </group>
  );
}
