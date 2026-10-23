/**
 * @file WetlandBasinMesh.tsx
 * @description 3D model of the 125-acre Bandar Bukit Raja Townpark & Wetland Eco-System,
 * featuring:
 *   - Exact normal-offset 3.5m red critical contour rings flush with every lake shoreline
 *   - Two-stage flood physics:
 *       * Stage 1 (H <= 3.5m): Water rises strictly inside the 6 organic lake basins
 *       * Stage 2 (H > 3.5m): Excess red floodwater spreads across the ENTIRE wetland
 *         park landmass and rises together over both the lakes and surrounding land!
 */

import { Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { H_MAX_CRITICAL_M } from '../../constants/hydrologyConstants';
import { levelToSceneY } from './sceneCoordinates';
import {
  createCriticalContourGeometries,
  createOuterParkContourTubeGeometry,
  createOuterParkFloodShape,
  createWetlandLakeShapes,
  MEADOW_TOP_Y,
  WetlandParkTerrain,
} from './WetlandParkTerrain';

interface WetlandBasinMeshProps {
  wetlandLevelM: number;
  traditionalLevelM: number;
  inflowM3PerS: number;
  rainfallMmPerHr: number;
  showTraditionalGhost: boolean;
}

const RAIN_PARTICLE_COUNT = 320;

export function WetlandBasinMesh({
  wetlandLevelM,
  traditionalLevelM,
  inflowM3PerS,
  rainfallMmPerHr,
  showTraditionalGhost,
}: WetlandBasinMeshProps) {
  const waterMeshRef = useRef<THREE.Mesh>(null);
  const parkFloodMeshRef = useRef<THREE.Mesh>(null);
  const parkFloodRimRef = useRef<THREE.Mesh>(null);

  const ghostInLakeGroupRef = useRef<THREE.Group>(null);
  const ghostParkFloodMeshRef = useRef<THREE.Mesh>(null);
  const ghostParkFloodRimRef = useRef<THREE.Mesh>(null);

  const lilyGroupRef = useRef<THREE.Group>(null);
  const inflowStreamRef = useRef<THREE.Mesh>(null);
  const rainPointsRef = useRef<THREE.Points>(null);

  const displayedLevelRef = useRef(wetlandLevelM);
  const displayedTradLevelRef = useRef(traditionalLevelM);

  const criticalY = levelToSceneY(H_MAX_CRITICAL_M);

  const {
    inLakeWaterGeometry,
    parkWideFloodGeometry,
    outerParkContourGeo,
    inLakeGhostSurfaceGeo,
    criticalContourGeometries,
    inLakeGhostContourGeos,
  } = useMemo(() => {
    // 1. Stage 1 In-Lake Water Volume (0m .. 3.5m) extruded from the 6 organic lake contours
    const waterShapes = createWetlandLakeShapes(-0.03);
    const waterGeo = new THREE.ExtrudeGeometry(waterShapes, {
      depth: 1.0,
      bevelEnabled: false,
      curveSegments: 24,
    });
    waterGeo.rotateX(Math.PI / 2);
    waterGeo.translate(0, 1.0, 0);

    // 2. Stage 2 Park-Wide Red Flood Sheet (> 3.5m) covering the ENTIRE wetland park landmass
    const parkFloodShape = createOuterParkFloodShape(0.998);
    const parkFloodGeo = new THREE.ExtrudeGeometry(parkFloodShape, {
      depth: 1.0,
      bevelEnabled: false,
      curveSegments: 32,
    });
    parkFloodGeo.rotateX(Math.PI / 2);
    parkFloodGeo.translate(0, 1.0, 0);

    // 3. Outer Park Perimeter Contour Ring (at local Y = 0, positioned dynamically at flood surface)
    const parkRimGeo = createOuterParkContourTubeGeometry(0, 0.998, 0.06);

    // 4. In-Lake Ghost Surface (used only when traditionalLevelM <= 3.5m)
    const ghostShapes = createWetlandLakeShapes(0.02);
    const ghostGeo = new THREE.ShapeGeometry(ghostShapes, 24);
    ghostGeo.rotateX(Math.PI / 2);

    // 5. 3.5m Critical Spillover Red Contour Rings fitting 100% flush with every lake's inner rim
    const contourGeos = createCriticalContourGeometries(criticalY - 0.005, 0.015, 0.048);

    // 6. In-Lake Ghost Perimeter Rings (at local Y = 0)
    const ghostContours = createCriticalContourGeometries(0, 0.02, 0.038);

    return {
      inLakeWaterGeometry: waterGeo,
      parkWideFloodGeometry: parkFloodGeo,
      outerParkContourGeo: parkRimGeo,
      inLakeGhostSurfaceGeo: ghostGeo,
      criticalContourGeometries: contourGeos,
      inLakeGhostContourGeos: ghostContours,
    };
  }, [criticalY]);

  // Pre-allocate raindrop particle coordinates across the 125-acre park
  const rainPositions = useMemo(() => {
    const arr = new Float32Array(RAIN_PARTICLE_COUNT * 3);
    for (let i = 0; i < RAIN_PARTICLE_COUNT; i += 1) {
      arr[i * 3] = -18 + Math.random() * 40;
      arr[i * 3 + 1] = Math.random() * 14;
      arr[i * 3 + 2] = -10 + Math.random() * 20;
    }
    return arr;
  }, []);

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
    const waveOffset = Math.sin(state.clock.elapsedTime * 2.2) * 0.012;
    const effectiveWaterY = Math.max(0.2, waterHeight + waveOffset);

    // Stage 1: In-Lake Water is capped at criticalY (3.5m) so it never forms cylinders above the lakes
    const clampedLakeY = Math.min(effectiveWaterY, criticalY);
    if (waterMeshRef.current) {
      waterMeshRef.current.scale.y = clampedLakeY;
      waterMeshRef.current.position.y = 0;
    }

    // Stage 2: When water > 3.5m, the Park-Wide Red Flood Sheet rises over the entire landmass together!
    const rawOverflowHeight = effectiveWaterY - criticalY;
    const isOvertopping = rawOverflowHeight > 0.008;
    const visualOverflowHeight = Math.min(1.15, Math.max(0.015, rawOverflowHeight));
    if (parkFloodMeshRef.current) {
      parkFloodMeshRef.current.visible = isOvertopping;
      if (isOvertopping) {
        parkFloodMeshRef.current.position.y = criticalY;
        parkFloodMeshRef.current.scale.y = visualOverflowHeight;
      }
    }
    if (parkFloodRimRef.current) {
      parkFloodRimRef.current.visible = isOvertopping;
      if (isOvertopping) {
        parkFloodRimRef.current.position.y = criticalY + visualOverflowHeight;
      }
    }

    if (lilyGroupRef.current) {
      lilyGroupRef.current.position.y =
        (isOvertopping ? criticalY + visualOverflowHeight : effectiveWaterY) + 0.025;
    }

    // Traditional Unmanaged Comparison Ghost:
    //   - If <= 3.5m: stays inside the 6 lakes
    //   - If > 3.5m: rises as a Park-Wide Red Flood Sheet over the entire landmass!
    const tradY = levelToSceneY(displayedTradLevelRef.current);
    const rawTradOverflow = tradY - criticalY;
    const tradOvertopping = rawTradOverflow > 0.008;
    const visualTradOverflow = Math.min(1.15, Math.max(0.015, rawTradOverflow));

    if (ghostInLakeGroupRef.current) {
      ghostInLakeGroupRef.current.visible = !tradOvertopping;
      ghostInLakeGroupRef.current.position.y = Math.min(tradY, criticalY);
    }
    if (ghostParkFloodMeshRef.current) {
      ghostParkFloodMeshRef.current.visible = tradOvertopping;
      if (tradOvertopping) {
        ghostParkFloodMeshRef.current.position.y = criticalY;
        ghostParkFloodMeshRef.current.scale.y = visualTradOverflow;
      }
    }
    if (ghostParkFloodRimRef.current) {
      ghostParkFloodRimRef.current.visible = tradOvertopping;
      if (tradOvertopping) {
        ghostParkFloodRimRef.current.position.y = criticalY + visualTradOverflow;
      }
    }

    if (inflowStreamRef.current) {
      const pulse = 0.88 + 0.14 * Math.sin(state.clock.elapsedTime * 10);
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
        if (y < 0.8) y = 14 + Math.random() * 2;
        posAttr.setY(i, y);
      }
      posAttr.needsUpdate = true;
    }
  });

  const wetlandIsSpilling = wetlandLevelM > H_MAX_CRITICAL_M;
  const tradIsSpilling = traditionalLevelM > H_MAX_CRITICAL_M;

  return (
    <group>
      {/* 1. Procedural 125-Acre Organic Wetland Park Terrain (3-Tier Terraced Lakes & Dry Meadow) */}
      <WetlandParkTerrain />

      {/* 2. Sculpted Eco-Stone Upstream Inflow Culvert & Waterfall Cascade (Feeds NW Pond at Z = -3.2) */}
      <group position={[-15.6, 0, -3.2]}>
        {/* Natural Stone Headwall integrated into the NW Meadow Slope */}
        <mesh position={[-0.4, MEADOW_TOP_Y / 2 + 0.1, 0]} receiveShadow castShadow>
          <boxGeometry args={[1.8, MEADOW_TOP_Y + 0.2, 3.6]} />
          <meshStandardMaterial color="#475569" roughness={0.85} flatShading />
        </mesh>

        {/* Green Turf Cap on Top of Culvert Headwall */}
        <mesh position={[-0.4, MEADOW_TOP_Y + 0.25, 0]} receiveShadow castShadow>
          <boxGeometry args={[1.9, 0.14, 3.8]} />
          <meshStandardMaterial color="#40916c" roughness={0.85} />
        </mesh>

        {/* Recessed Culvert Arch / Weir Spillway Lip */}
        <mesh position={[0.45, MEADOW_TOP_Y - 0.25, 0]} receiveShadow castShadow>
          <boxGeometry args={[0.9, 0.38, 2.2]} />
          <meshStandardMaterial color="#1e293b" roughness={0.75} />
        </mesh>

        {/* Stepped Stone Cascade Chute leading down into NW Siltation Pond */}
        <mesh
          position={[0.85, MEADOW_TOP_Y / 2, 0]}
          rotation={[0, 0, -0.45]}
          receiveShadow
          castShadow
        >
          <boxGeometry args={[1.3, MEADOW_TOP_Y * 0.82, 2.1]} />
          <meshStandardMaterial color="#334155" roughness={0.9} />
        </mesh>

        {/* Animated Stormwater Inflow Cascade when Q_in > 0 */}
        {inflowM3PerS > 0.1 && (
          <mesh
            ref={inflowStreamRef}
            position={[1.02, MEADOW_TOP_Y / 2 + 0.08, 0]}
            rotation={[0, 0, -0.45]}
          >
            <boxGeometry args={[0.4, MEADOW_TOP_Y * 0.85, 1.75]} />
            <meshStandardMaterial
              color="#38bdf8"
              emissive="#0284c7"
              emissiveIntensity={0.7}
              transparent
              opacity={Math.min(0.92, 0.42 + inflowM3PerS / 120)}
            />
          </mesh>
        )}

        {/* Upstream Q_in Readout Tag */}
        <Html position={[-0.2, MEADOW_TOP_Y + 1.35, 0]} center zIndexRange={[10, 0]}>
          <div className="pointer-events-none select-none whitespace-nowrap rounded-lg border border-slate-700 bg-slate-900/90 px-2.5 py-1 text-center font-mono text-[11px] shadow-md backdrop-blur">
            <div className="text-[9px] text-slate-400">Upstream 500ha Basin Inflow (Q_in)</div>
            <div className="text-xs font-bold text-sky-400">
              {inflowM3PerS.toFixed(1)} m³/s
            </div>
          </div>
        </Html>
      </group>

      {/* 3. Exact Normal-Offset 3.5m Critical Spillover Contour Rings (100% Flush with Lake Shorelines) */}
      <group>
        {criticalContourGeometries.map((tubeGeo, idx) => (
          <mesh key={idx} geometry={tubeGeo}>
            <meshStandardMaterial
              color="#ef4444"
              emissive="#ef4444"
              emissiveIntensity={1.15}
              roughness={0.25}
            />
          </mesh>
        ))}
      </group>

      {/* 4A. Stage 1 In-Lake Water Body (0m .. 3.5m, Contained inside the 6 Lakes) */}
      <mesh
        ref={waterMeshRef}
        position={[0, 0, 0]}
        geometry={inLakeWaterGeometry}
        receiveShadow
      >
        <meshStandardMaterial
          color={wetlandIsSpilling ? '#ef4444' : '#0284c7'}
          emissive={wetlandIsSpilling ? '#991b1b' : '#0369a1'}
          emissiveIntensity={0.42}
          transparent
          opacity={0.86}
          roughness={0.14}
          metalness={0.22}
        />
      </mesh>

      {/* 4B. Stage 2 Park-Wide Red Flood Sheet (Active when wetlandLevelM > 3.5m!)
          Rises over the ENTIRE wetland park landmass together instead of cylinders over the lakes! */}
      <mesh
        ref={parkFloodMeshRef}
        position={[0, criticalY, 0]}
        geometry={parkWideFloodGeometry}
        visible={false}
        receiveShadow
      >
        <meshStandardMaterial
          color="#ef4444"
          emissive="#991b1b"
          emissiveIntensity={0.55}
          transparent
          opacity={0.68}
          roughness={0.15}
          metalness={0.18}
        />
      </mesh>
      <mesh
        ref={parkFloodRimRef}
        position={[0, criticalY, 0]}
        geometry={outerParkContourGeo}
        visible={false}
      >
        <meshStandardMaterial
          color="#fca5a5"
          emissive="#ef4444"
          emissiveIntensity={1.25}
        />
      </mesh>

      {/* Floating Aquatic Water Lilies riding on the surface of SW Marsh Cove */}
      <group ref={lilyGroupRef} position={[-11.5, 2.05, 4.0]}>
        {(
          [
            [-0.6, 0.2],
            [0.0, -0.25],
            [0.55, 0.15],
            [-0.2, 0.45],
          ] as const
        ).map(([ox, oz], idx) => (
          <mesh
            key={idx}
            position={[ox, 0, oz]}
            rotation={[-Math.PI / 2, 0, idx * 0.8]}
          >
            <circleGeometry args={[0.22, 12]} />
            <meshStandardMaterial color="#84cc16" roughness={0.6} />
          </mesh>
        ))}
      </group>

      {/* 5. Traditional Unmanaged Wetland Comparison Ghost
          - <= 3.5m: In-lake orange translucent surface
          - >  3.5m: Park-Wide Red Flood Layer rising across the ENTIRE landmass together! */}
      {showTraditionalGhost && (
        <group>
          {/* In-Lake Ghost (when traditionalLevelM <= 3.5m) */}
          <group
            ref={ghostInLakeGroupRef}
            position={[0, Math.min(levelToSceneY(traditionalLevelM), criticalY), 0]}
          >
            <mesh geometry={inLakeGhostSurfaceGeo}>
              <meshBasicMaterial
                color={tradIsSpilling ? '#ef4444' : '#f97316'}
                transparent
                opacity={0.22}
                side={THREE.DoubleSide}
                depthWrite={false}
              />
            </mesh>
            {inLakeGhostContourGeos.map((geo, idx) => (
              <mesh key={idx} geometry={geo}>
                <meshBasicMaterial
                  color={tradIsSpilling ? '#ef4444' : '#fb923c'}
                  transparent
                  opacity={0.85}
                />
              </mesh>
            ))}
          </group>

          {/* Park-Wide Red Flood Sheet (when traditionalLevelM > 3.5m!) */}
          <mesh
            ref={ghostParkFloodMeshRef}
            position={[0, criticalY, 0]}
            geometry={parkWideFloodGeometry}
            visible={false}
          >
            <meshStandardMaterial
              color="#ef4444"
              emissive="#7f1d1d"
              emissiveIntensity={0.5}
              transparent
              opacity={0.44}
              roughness={0.2}
              depthWrite={false}
            />
          </mesh>
          <mesh
            ref={ghostParkFloodRimRef}
            position={[0, criticalY, 0]}
            geometry={outerParkContourGeo}
            visible={false}
          >
            <meshStandardMaterial
              color="#f87171"
              emissive="#ef4444"
              emissiveIntensity={1.2}
            />
          </mesh>
        </group>
      )}

      {/* 6. Dynamic Precipitation Particle System */}
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
            size={0.18}
            transparent
            opacity={Math.min(0.85, 0.25 + rainfallMmPerHr / 110)}
          />
        </points>
      )}
    </group>
  );
}
