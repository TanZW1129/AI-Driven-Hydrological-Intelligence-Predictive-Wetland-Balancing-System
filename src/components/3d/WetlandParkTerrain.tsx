/**
 * @file WetlandParkTerrain.tsx
 * @description Procedural 3D organic landscape model for the 125-acre Bandar
 * Bukit Raja (BBR) Townpark & Wetland Eco-System.
 *
 * Engineered with a multi-tier hydro-topographical elevation datum:
 *   - Layer 0 (Y = 0.85): Shallow wetland sediment bed
 *   - Layer 1 (Y = 0.00..1.52): Inner riparian pebble & mud shelf (exposed at 1.0m low pool, Y = 1.50)
 *   - Layer 2 (Y = 1.52..2.15): Middle wetland marsh terrace (cradles 2.0m normal water level, Y = 2.05)
 *   - Layer 3 (Y = 2.15..2.88): Main park meadow platform flush with the 3.5m critical flood redline (Y = 2.88)
 *   - Above Y = 2.88 (> 3.5m): Excess floodwater spills out of the lakes and rises as a unified
 *     park-wide red flood layer across the entire landmass together.
 */

import { useMemo } from 'react';
import * as THREE from 'three';

/**
 * Top elevation of the main wetland park meadow in 3D scene units.
 * Aligned exactly with the 3.50m critical spillover redline (levelToSceneY(3.5) = 2.875),
 * so water <= 3.5m stays inside the lakes, and water > 3.5m floods across the entire landmass.
 */
export const MEADOW_TOP_Y = 2.875;

/** Elevation of the pedestrian timber boardwalk & observation deck. */
export const BOARDWALK_DECK_Y = 2.98;

/** Shared 3D coordinates of the ultrasonic level gauge tower in the central lagoon. */
export const GAUGE_TOWER_POS: [number, number, number] = [-5.2, 0, -1.95];

// ---------------------------------------------------------------------------
// Shared Organic Lake Bezier Definitions (Synchronized across Terrain & Water)
// ---------------------------------------------------------------------------
interface BezierSegment2D {
  cp1: [number, number];
  cp2: [number, number];
  end: [number, number];
}

interface LakeContourDef {
  id: string;
  cx: number;
  cz: number;
  lockEastGateEdge?: boolean;
  start: [number, number];
  segments: readonly BezierSegment2D[];
}

export const WETLAND_LAKE_DEFS: readonly LakeContourDef[] = [
  // 1. Central Main Lagoon (Clean, balanced oval/bean lake in the heart of the park)
  {
    id: 'centerLagoon',
    cx: -5.2,
    cz: -0.8,
    start: [-8.5, -0.9],
    segments: [
      { cp1: [-8.4, -2.5], cp2: [-6.6, -3.1], end: [-4.8, -3.0] },
      { cp1: [-3.0, -2.9], cp2: [-1.7, -2.0], end: [-1.8, -0.6] },
      { cp1: [-1.9, 0.8], cp2: [-3.4, 1.4], end: [-5.4, 1.3] },
      { cp1: [-7.2, 1.2], cp2: [-8.6, 0.4], end: [-8.5, -0.9] },
    ],
  },
  // 2. East Sluice Forebay Basin (Smoothly feeds the dual-bay sluice gate at X = 3.95)
  {
    id: 'eastForebay',
    cx: 1.8,
    cz: 0.0,
    lockEastGateEdge: true,
    start: [3.95, -2.35],
    segments: [
      { cp1: [2.2, -2.35], cp2: [0.4, -1.85], end: [-0.25, -0.8] },
      { cp1: [-0.55, -0.2], cp2: [-0.55, 0.2], end: [-0.25, 0.8] },
      { cp1: [0.4, 1.85], cp2: [2.2, 2.35], end: [3.95, 2.35] },
      { cp1: [3.95, 0.8], cp2: [3.95, -0.8], end: [3.95, -2.35] },
    ],
  },
  // 3. North-East Forested Polishing Pond
  {
    id: 'nePond',
    cx: 1.3,
    cz: -5.4,
    start: [-0.6, -5.5],
    segments: [
      { cp1: [-0.5, -6.6], cp2: [1.2, -6.9], end: [2.7, -6.3] },
      { cp1: [3.5, -5.8], cp2: [3.5, -4.5], end: [2.3, -4.1] },
      { cp1: [1.0, -3.8], cp2: [-0.7, -4.3], end: [-0.6, -5.5] },
    ],
  },
  // 4. North-West Inflow Siltation Basin (Receives Upstream Cascade)
  {
    id: 'nwPond',
    cx: -12.5,
    cz: -3.2,
    start: [-14.7, -3.3],
    segments: [
      { cp1: [-14.6, -4.6], cp2: [-12.2, -4.9], end: [-10.6, -3.9] },
      { cp1: [-9.9, -3.2], cp2: [-10.2, -1.9], end: [-11.8, -1.7] },
      { cp1: [-13.4, -1.5], cp2: [-14.8, -2.1], end: [-14.7, -3.3] },
    ],
  },
  // 5. South-West Ecological Marsh Cove
  {
    id: 'swCove',
    cx: -11.5,
    cz: 4.0,
    start: [-13.8, 3.8],
    segments: [
      { cp1: [-13.6, 2.4], cp2: [-11.2, 2.1], end: [-9.6, 3.0] },
      { cp1: [-8.8, 3.7], cp2: [-9.1, 5.2], end: [-10.9, 5.6] },
      { cp1: [-12.6, 5.9], cp2: [-14.0, 5.0], end: [-13.8, 3.8] },
    ],
  },
  // 6. South Deep Retention Lagoon
  {
    id: 'southLagoon',
    cx: -3.8,
    cz: 5.0,
    start: [-7.2, 4.8],
    segments: [
      { cp1: [-7.0, 3.5], cp2: [-3.6, 3.3], end: [-0.8, 4.0] },
      { cp1: [0.3, 4.5], cp2: [0.0, 6.0], end: [-2.1, 6.5] },
      { cp1: [-4.5, 6.9], cp2: [-7.4, 6.1], end: [-7.2, 4.8] },
    ],
  },
];

/**
 * Sample evenly spaced 2D points along a lake's Bezier boundary and offset
 * every vertex by an exact perpendicular distance `insetDist` toward the lake interior.
 * Guarantees 100% uniform shoreline fit on both circular and elongated lakes.
 */
function getOffsetLakePoints(
  def: LakeContourDef,
  insetDist = 0,
  numSamples = 96,
): THREE.Vector2[] {
  const basePath = new THREE.Path();
  basePath.moveTo(def.start[0], def.start[1]);
  for (const seg of def.segments) {
    basePath.bezierCurveTo(
      seg.cp1[0],
      seg.cp1[1],
      seg.cp2[0],
      seg.cp2[1],
      seg.end[0],
      seg.end[1],
    );
  }
  basePath.closePath();

  const rawPts = basePath.getSpacedPoints(numSamples);
  const pts = rawPts.slice(0, numSamples);
  if (Math.abs(insetDist) < 1e-4) {
    return pts;
  }

  const n = pts.length;
  return pts.map((pt, i) => {
    const prev = pts[(i - 1 + n) % n] ?? pt;
    const next = pts[(i + 1) % n] ?? pt;
    const dx = next.x - prev.x;
    const dy = next.y - prev.y;
    const len = Math.hypot(dx, dy) || 1;
    const tx = dx / len;
    const ty = dy / len;

    // Candidate unit normal (-ty, tx); ensure it points inward toward (def.cx, def.cz)
    let nx = -ty;
    let ny = tx;
    const toCenterX = def.cx - pt.x;
    const toCenterY = def.cz - pt.y;
    if (nx * toCenterX + ny * toCenterY < 0) {
      nx = -nx;
      ny = -ny;
    }

    if (def.lockEastGateEdge && pt.x >= 3.88) {
      return new THREE.Vector2(3.95, pt.y + ny * insetDist * 0.4);
    }

    return new THREE.Vector2(pt.x + nx * insetDist, pt.y + ny * insetDist);
  });
}

/** Build 2D THREE.Path holes for the wetland lakes with an exact perpendicular inward offset. */
export function createWetlandLakePaths(insetDist = 0): THREE.Path[] {
  return WETLAND_LAKE_DEFS.map((def) => {
    const pts = getOffsetLakePoints(def, insetDist, 96);
    const path = new THREE.Path();
    const first = pts[0];
    if (first) {
      path.moveTo(first.x, first.y);
      for (let i = 1; i < pts.length; i += 1) {
        const p = pts[i];
        if (p) path.lineTo(p.x, p.y);
      }
      path.closePath();
    }
    return path;
  });
}

/** Build 2D THREE.Shape instances for the wetland lakes (used for organic in-lake water). */
export function createWetlandLakeShapes(insetDist = -0.03): THREE.Shape[] {
  return WETLAND_LAKE_DEFS.map((def) => {
    const pts = getOffsetLakePoints(def, insetDist, 96);
    const shape = new THREE.Shape();
    const first = pts[0];
    if (first) {
      shape.moveTo(first.x, first.y);
      for (let i = 1; i < pts.length; i += 1) {
        const p = pts[i];
        if (p) shape.lineTo(p.x, p.y);
      }
      shape.closePath();
    }
    return shape;
  });
}

/**
 * Build closed 3D glowing contour tube geometries that fit 100% flush along each lake's
 * exact shoreline boundary at the 3.5m critical elevation Y.
 */
export function createCriticalContourGeometries(
  criticalY: number,
  insetDist = 0.015,
  tubeRadius = 0.048,
): THREE.TubeGeometry[] {
  return WETLAND_LAKE_DEFS.map((def) => {
    const pts2D = getOffsetLakePoints(def, insetDist, 96);
    const pts3D = pts2D.map((p) => new THREE.Vector3(p.x, criticalY, p.y));
    const curve = new THREE.CatmullRomCurve3(pts3D, true, 'centripetal', 0.5);
    return new THREE.TubeGeometry(curve, 96, tubeRadius, 8, true);
  });
}

/**
 * Build the outer contour THREE.Shape of the entire 125-acre wetland park landmass
 * (with optional radial scale around the park centre, and NO holes when used for >3.5m park-wide flood layer).
 */
export function createOuterParkFloodShape(
  scale = 1.0,
  holes: THREE.Path[] = [],
): THREE.Shape {
  const cx = -6.0;
  const cz = 0.0;
  const sp = (x: number, z: number): [number, number] => [
    cx + (x - cx) * scale,
    cz + (z - cz) * scale,
  ];

  const shape = new THREE.Shape();
  shape.moveTo(...sp(-16.2, -9.0));
  shape.bezierCurveTo(
    ...sp(-11.5, -11.2),
    ...sp(-1.5, -11.2),
    ...sp(4.0, -8.6),
  );
  shape.bezierCurveTo(...sp(4.2, -4.5), ...sp(4.2, 4.5), ...sp(4.0, 8.6));
  shape.bezierCurveTo(
    ...sp(-1.5, 11.2),
    ...sp(-11.5, 11.2),
    ...sp(-16.2, 9.0),
  );
  shape.bezierCurveTo(
    ...sp(-18.6, 4.5),
    ...sp(-18.6, -4.5),
    ...sp(-16.2, -9.0),
  );
  shape.closePath();
  if (holes.length > 0) {
    shape.holes.push(...holes);
  }
  return shape;
}

/**
 * Build a closed 3D glowing contour tube around the OUTER boundary of the entire wetland
 * park landmass (used to highlight park-wide flood inundation when water > 3.5m).
 */
export function createOuterParkContourTubeGeometry(
  elevationY: number,
  scale = 0.996,
  tubeRadius = 0.065,
): THREE.TubeGeometry {
  const outerShape = createOuterParkFloodShape(scale);
  const rawPts = outerShape.getSpacedPoints(120);
  const pts2D = rawPts.slice(0, 120);
  const pts3D = pts2D.map((p) => new THREE.Vector3(p.x, elevationY, p.y));
  const curve = new THREE.CatmullRomCurve3(pts3D, true, 'centripetal', 0.5);
  return new THREE.TubeGeometry(curve, 120, tubeRadius, 8, true);
}

// ---------------------------------------------------------------------------
// Botanical Asset: Multi-Tiered Conifer Pine (Evergreen Conifer)
// ---------------------------------------------------------------------------
interface ConiferTreeProps {
  position: [number, number, number];
  scale?: number;
  rotation?: number;
  tint?: string;
}

export function ConiferTree({
  position,
  scale = 1,
  rotation = 0,
  tint = '#15803d',
}: ConiferTreeProps) {
  return (
    <group position={position} scale={[scale, scale, scale]} rotation={[0, rotation, 0]}>
      {/* Wood Trunk */}
      <mesh position={[0, 0.45, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.08, 0.13, 0.9, 8]} />
        <meshStandardMaterial color="#5c3a21" roughness={0.9} />
      </mesh>

      {/* Tier 1 (Bottom Crown) */}
      <mesh position={[0, 1.05, 0]} castShadow receiveShadow>
        <coneGeometry args={[0.8, 1.1, 8]} />
        <meshStandardMaterial color={tint} roughness={0.8} />
      </mesh>

      {/* Tier 2 (Middle Crown) */}
      <mesh position={[0, 1.65, 0]} castShadow receiveShadow>
        <coneGeometry args={[0.6, 0.95, 8]} />
        <meshStandardMaterial color="#166534" roughness={0.8} />
      </mesh>

      {/* Tier 3 (Top Crown) */}
      <mesh position={[0, 2.18, 0]} castShadow receiveShadow>
        <coneGeometry args={[0.4, 0.8, 8]} />
        <meshStandardMaterial color="#14532d" roughness={0.75} />
      </mesh>
    </group>
  );
}

// ---------------------------------------------------------------------------
// Botanical Asset: Lush Broadleaf Canopy Tree (Tropical Rainforest Canopy)
// ---------------------------------------------------------------------------
interface BroadleafTreeProps {
  position: [number, number, number];
  scale?: number;
  rotation?: number;
  crownColor?: string;
}

export function BroadleafTree({
  position,
  scale = 1,
  rotation = 0,
  crownColor = '#22c55e',
}: BroadleafTreeProps) {
  return (
    <group position={position} scale={[scale, scale, scale]} rotation={[0, rotation, 0]}>
      {/* Trunk */}
      <mesh position={[0, 0.6, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.09, 0.14, 1.2, 8]} />
        <meshStandardMaterial color="#4a2e18" roughness={0.9} />
      </mesh>

      {/* Multi-cluster organic foliage */}
      <group position={[0, 1.45, 0]}>
        <mesh position={[0, 0, 0]} castShadow receiveShadow>
          <sphereGeometry args={[0.7, 8, 8]} />
          <meshStandardMaterial color={crownColor} roughness={0.85} flatShading />
        </mesh>
        <mesh position={[0.26, 0.28, 0.15]} castShadow receiveShadow>
          <sphereGeometry args={[0.5, 8, 8]} />
          <meshStandardMaterial color="#4ade80" roughness={0.85} flatShading />
        </mesh>
        <mesh position={[-0.24, 0.2, -0.18]} castShadow receiveShadow>
          <sphereGeometry args={[0.54, 8, 8]} />
          <meshStandardMaterial color="#16a34a" roughness={0.85} flatShading />
        </mesh>
      </group>
    </group>
  );
}

// ---------------------------------------------------------------------------
// Waterfront Reeds / Shrubbery Clump (Riparian Shrub Clump)
// ---------------------------------------------------------------------------
interface ShrubClumpProps {
  position: [number, number, number];
  scale?: number;
  color?: string;
}

export function ShrubClump({
  position,
  scale = 1,
  color = '#4d7c0f',
}: ShrubClumpProps) {
  return (
    <group position={position} scale={[scale, scale, scale]}>
      <mesh position={[0, 0.18, 0]} castShadow receiveShadow>
        <sphereGeometry args={[0.38, 7, 7]} />
        <meshStandardMaterial color={color} roughness={0.9} flatShading />
      </mesh>
      <mesh position={[0.26, 0.12, 0.1]} castShadow receiveShadow>
        <sphereGeometry args={[0.28, 7, 7]} />
        <meshStandardMaterial color="#65a30d" roughness={0.9} flatShading />
      </mesh>
      <mesh position={[-0.2, 0.1, -0.12]} castShadow receiveShadow>
        <sphereGeometry args={[0.3, 7, 7]} />
        <meshStandardMaterial color="#3f6212" roughness={0.9} flatShading />
      </mesh>
    </group>
  );
}

// ---------------------------------------------------------------------------
// Geological Asset: Natural Shoreline Boulders (Riparian Rock Cluster)
// ---------------------------------------------------------------------------
interface RockClusterProps {
  position: [number, number, number];
  scale?: number;
  rotation?: number;
  tint?: string;
}

export function RockCluster({
  position,
  scale = 1,
  rotation = 0,
  tint = '#78716c',
}: RockClusterProps) {
  return (
    <group position={position} scale={[scale, scale, scale]} rotation={[0, rotation, 0]}>
      <mesh position={[0, 0.26, 0]} castShadow receiveShadow>
        <dodecahedronGeometry args={[0.55, 0]} />
        <meshStandardMaterial color={tint} roughness={0.88} flatShading />
      </mesh>
      <mesh position={[0.48, 0.18, 0.18]} castShadow receiveShadow>
        <dodecahedronGeometry args={[0.38, 0]} />
        <meshStandardMaterial color="#57534e" roughness={0.92} flatShading />
      </mesh>
      <mesh position={[-0.42, 0.16, -0.18]} castShadow receiveShadow>
        <dodecahedronGeometry args={[0.34, 0]} />
        <meshStandardMaterial color="#854d0e" roughness={0.9} flatShading />
      </mesh>
    </group>
  );
}

// ---------------------------------------------------------------------------
// Landscape Architecture: Elliptical Stepped Contour Knoll (Stepped Eco-Knoll)
// ---------------------------------------------------------------------------
interface KnollTier {
  radiusX: number;
  radiusZ: number;
  height: number;
  color: string;
}

interface SteppedKnollProps {
  position: [number, number, number];
  tiers: readonly KnollTier[];
  rotation?: number;
}

export function SteppedKnoll({ position, tiers, rotation = 0 }: SteppedKnollProps) {
  let accumY = 0;

  return (
    <group position={position} rotation={[0, rotation, 0]}>
      {tiers.map((tier, idx) => {
        const tierCenterY = accumY + tier.height / 2;
        accumY += tier.height;
        const aspectZ = tier.radiusZ / tier.radiusX;

        return (
          <mesh
            key={idx}
            position={[0, tierCenterY, 0]}
            scale={[1, 1, aspectZ]}
            receiveShadow
            castShadow
          >
            <cylinderGeometry
              args={[
                tier.radiusX * 0.9,
                tier.radiusX,
                tier.height,
                28,
              ]}
            />
            <meshStandardMaterial
              color={tier.color}
              roughness={0.86}
              flatShading
            />
          </mesh>
        );
      })}
    </group>
  );
}

// ---------------------------------------------------------------------------
// Park Infrastructure: Timber Boardwalk & Observation Pier (Timber Boardwalk Deck)
// Seated along the North Bank of Center Lagoon without covering the 3.5m Red Ring!
// ---------------------------------------------------------------------------
export function ParkBoardwalk() {
  const pilings: ReadonlyArray<[number, number]> = [
    [-7.5, -3.55],
    [-6.4, -3.5],
    [-5.8, -3.45],
    [-4.6, -3.45],
  ];

  return (
    <group>
      {/* Segment 1: North bank timber walkway along the shore ridge */}
      <mesh
        position={[-6.8, BOARDWALK_DECK_Y, -3.55]}
        rotation={[0, 0.12, 0]}
        receiveShadow
        castShadow
      >
        <boxGeometry args={[2.2, 0.12, 0.95]} />
        <meshStandardMaterial color="#92400e" roughness={0.72} />
      </mesh>

      {/* Scenic Observation Deck seated right behind the North Shore Red Contour Ring */}
      <mesh position={[-5.2, BOARDWALK_DECK_Y, -3.55]} receiveShadow castShadow>
        <boxGeometry args={[2.0, 0.15, 1.1]} />
        <meshStandardMaterial color="#78350f" roughness={0.75} />
      </mesh>

      {/* Slender Steel Cantilever Sensor Arm reaching over the red contour ring to the Gauge Tower */}
      <mesh position={[-5.2, BOARDWALK_DECK_Y, -2.55]} receiveShadow castShadow>
        <boxGeometry args={[0.28, 0.07, 1.05]} />
        <meshStandardMaterial color="#475569" metalness={0.65} roughness={0.35} />
      </mesh>

      {/* Platform Safety Railings */}
      <group position={[-5.2, BOARDWALK_DECK_Y + 0.25, -3.55]}>
        <mesh position={[-0.95, 0, 0]}>
          <boxGeometry args={[0.06, 0.36, 1.05]} />
          <meshStandardMaterial color="#451a03" roughness={0.65} />
        </mesh>
        <mesh position={[0.95, 0, 0]}>
          <boxGeometry args={[0.06, 0.36, 1.05]} />
          <meshStandardMaterial color="#451a03" roughness={0.65} />
        </mesh>
      </group>

      {/* Timber Pilings */}
      {pilings.map(([px, pz], idx) => (
        <mesh
          key={idx}
          position={[px, BOARDWALK_DECK_Y / 2, pz]}
          receiveShadow
          castShadow
        >
          <cylinderGeometry args={[0.08, 0.1, BOARDWALK_DECK_Y, 8]} />
          <meshStandardMaterial color="#451a03" roughness={0.9} />
        </mesh>
      ))}

      {/*Timber Footbridge spanning the green land bridge between Center Lagoon & East Forebay */}
      <mesh position={[-1.0, BOARDWALK_DECK_Y - 0.04, -0.6]} receiveShadow castShadow>
        <boxGeometry args={[1.3, 0.12, 0.9]} />
        <meshStandardMaterial color="#78350f" roughness={0.75} />
      </mesh>

      {/* Solar Park Bollard Lantern on the Observation Deck */}
      <group position={[-4.3, BOARDWALK_DECK_Y + 0.06, -3.2]}>
        <mesh position={[0, 0.3, 0]}>
          <cylinderGeometry args={[0.04, 0.05, 0.6, 8]} />
          <meshStandardMaterial color="#334155" metalness={0.7} />
        </mesh>
        <mesh position={[0, 0.65, 0]}>
          <boxGeometry args={[0.16, 0.18, 0.16]} />
          <meshStandardMaterial
            color="#fef08a"
            emissive="#fde047"
            emissiveIntensity={0.85}
          />
        </mesh>
      </group>
    </group>
  );
}

// ---------------------------------------------------------------------------
// Organic Main Wetland Park Ground & 3-Tier Terraced Lake Basins
// ---------------------------------------------------------------------------
export function WetlandParkTerrain() {
  const {
    layer1Geo,
    layer2Geo,
    layer3MeadowGeo,
    lakebedGeometry,
  } = useMemo(() => {
    // Layer 1: Inner Ecological Basin Shelf (Y = 0.00 .. 1.52, exposed at 1.0m low pool Y=1.50)
    // Uniform perpendicular inward offset of 0.34 scene units
    const shapeL1 = createOuterParkFloodShape(1.0, createWetlandLakePaths(0.34));
    const geoL1 = new THREE.ExtrudeGeometry(shapeL1, {
      depth: 1.52,
      bevelEnabled: false,
      curveSegments: 24,
    });
    geoL1.rotateX(Math.PI / 2);
    geoL1.translate(0, 1.52, 0);

    // Layer 2: Middle Riparian Marsh Terrace (Y = 1.52 .. 2.15, cradles 2.0m normal pool Y=2.05)
    // Uniform perpendicular inward offset of 0.16 scene units
    const shapeL2 = createOuterParkFloodShape(1.0, createWetlandLakePaths(0.16));
    const geoL2 = new THREE.ExtrudeGeometry(shapeL2, {
      depth: 0.63,
      bevelEnabled: false,
      curveSegments: 24,
    });
    geoL2.rotateX(Math.PI / 2);
    geoL2.translate(0, 2.15, 0);

    // Layer 3: Upper Park Meadow Platform (Y = 2.15 .. 2.875, flush with 3.5m flood redline!)
    // Exact 0.00 offset with bevelEnabled: false so the 3.5m red contour ring fits 100% flush!
    const shapeL3 = createOuterParkFloodShape(1.0, createWetlandLakePaths(0.0));
    const geoL3 = new THREE.ExtrudeGeometry(shapeL3, {
      depth: MEADOW_TOP_Y - 2.15,
      bevelEnabled: false,
      curveSegments: 24,
    });
    geoL3.rotateX(Math.PI / 2);
    geoL3.translate(0, MEADOW_TOP_Y, 0);

    // Flat organic lakebed underlying the lake depressions (Y = 0.70 .. 0.95)
    const bedGeo = new THREE.BoxGeometry(21.5, 0.25, 18.5);

    return {
      layer1Geo: geoL1,
      layer2Geo: geoL2,
      layer3MeadowGeo: geoL3,
      lakebedGeometry: bedGeo,
    };
  }, []);

  // Elliptical Stepped Contour Knolls seated ON TOP of the meadow (Y = 2.86)
  // Verified 100% disjoint from all 6 lake cutouts!
  const knolls = useMemo(
    () => [
      // 1. North-Central Stepped Hill (North Shore Stepped Eco-Knoll)
      {
        position: [-5.2, 2.86, -6.5] as [number, number, number],
        tiers: [
          { radiusX: 3.1, radiusZ: 1.9, height: 0.58, color: '#2d6a4f' },
          { radiusX: 2.2, radiusZ: 1.32, height: 0.52, color: '#40916c' },
          { radiusX: 1.3, radiusZ: 0.78, height: 0.48, color: '#52b788' },
        ],
        rotation: 0.08,
      },
      // 2. Central Dividing Peninsula Hill (Central Peninsula Knoll)
      {
        position: [-4.4, 2.86, 2.35] as [number, number, number],
        tiers: [
          { radiusX: 2.3, radiusZ: 0.8, height: 0.5, color: '#2d6a4f' },
          { radiusX: 1.6, radiusZ: 0.56, height: 0.44, color: '#40916c' },
          { radiusX: 0.92, radiusZ: 0.34, height: 0.4, color: '#52b788' },
        ],
        rotation: -0.05,
      },
      // 3. West Dividing Ridge (West Dividing Ridge)
      {
        position: [-12.0, 2.86, 0.35] as [number, number, number],
        tiers: [
          { radiusX: 2.1, radiusZ: 1.3, height: 0.58, color: '#2d6a4f' },
          { radiusX: 1.4, radiusZ: 0.85, height: 0.48, color: '#40916c' },
        ],
        rotation: 0.15,
      },
      // 4. North-East Conifer Ridge (North-East Highland Ridge)
      {
        position: [1.4, 2.86, -8.1] as [number, number, number],
        tiers: [
          { radiusX: 2.1, radiusZ: 1.0, height: 0.58, color: '#1b4332' },
          { radiusX: 1.35, radiusZ: 0.65, height: 0.48, color: '#2d6a4f' },
        ],
        rotation: -0.1,
      },
      // 5. South-East Sluice Approach Knoll (South-East Sluice Knoll)
      {
        position: [1.6, 2.86, 5.2] as [number, number, number],
        tiers: [
          { radiusX: 2.0, radiusZ: 1.55, height: 0.58, color: '#2d6a4f' },
          { radiusX: 1.3, radiusZ: 0.98, height: 0.48, color: '#40916c' },
        ],
        rotation: 0.12,
      },
      // 6. South-West Meadow Knoll (South-West Meadow Knoll)
      {
        position: [-11.2, 2.86, 7.5] as [number, number, number],
        tiers: [
          { radiusX: 2.2, radiusZ: 1.15, height: 0.5, color: '#2d6a4f' },
          { radiusX: 1.4, radiusZ: 0.72, height: 0.42, color: '#52b788' },
        ],
        rotation: 0.18,
      },
    ],
    [],
  );

  // Conifer Pines anchored on knoll terraces & dry meadow
  const coniferTrees = useMemo(
    () => [
      // Group A: North Stepped Hill (Knoll 1)
      { pos: [-5.2, 4.44, -6.5], scale: 1.08, rot: 0.2 },
      { pos: [-4.1, 3.96, -6.2], scale: 0.88, rot: 1.2 },
      { pos: [-6.3, 3.96, -6.8], scale: 0.92, rot: 2.1 },
      { pos: [-3.4, 3.44, -7.1], scale: 0.82, rot: 0.7 },

      // Group B: Dense Conifer Grove around North-East Pond (Reference Image Signature!)
      { pos: [1.4, 3.92, -8.1], scale: 1.12, rot: 0.1 },
      { pos: [0.4, 3.44, -7.9], scale: 0.9, rot: 1.4 },
      { pos: [2.4, 3.44, -8.2], scale: 0.86, rot: 2.5 },
      { pos: [-1.1, 2.88, -5.6], scale: 0.95, rot: 0.9 },
      { pos: [3.55, 2.88, -5.4], scale: 0.92, rot: 1.7 },
      { pos: [2.8, 2.88, -3.4], scale: 0.85, rot: 0.4 },
      { pos: [1.1, 2.88, -3.3], scale: 0.88, rot: 2.2 },

      // Group C: Central Dividing Peninsula (Knoll 2)
      { pos: [-4.4, 4.2, 2.35], scale: 0.96, rot: 0.5 },
      { pos: [-3.2, 3.8, 2.25], scale: 0.78, rot: 1.8 },
      { pos: [-5.6, 3.36, 2.42], scale: 0.8, rot: 3.1 },

      // Group D: West Dividing Ridge (Knoll 3)
      { pos: [-12.0, 3.92, 0.35], scale: 0.98, rot: 0.4 },
      { pos: [-10.8, 3.44, 0.1], scale: 0.82, rot: 1.9 },
      { pos: [-13.2, 3.44, 0.65], scale: 0.85, rot: 2.7 },

      // Group E: South-East Sluice Approach Knoll (Knoll 5)
      { pos: [1.6, 3.92, 5.2], scale: 1.0, rot: 0.6 },
      { pos: [2.5, 3.44, 4.6], scale: 0.84, rot: 1.5 },
      { pos: [0.7, 3.44, 5.8], scale: 0.86, rot: 2.4 },

      // Group F: Perimeter Park Meadow Conifers
      { pos: [-13.8, 2.88, -6.9], scale: 1.05, rot: 0.3 },
      { pos: [-10.2, 2.88, -7.6], scale: 1.1, rot: 1.1 },
      { pos: [-11.2, 3.78, 7.5], scale: 0.95, rot: 0.8 },
      { pos: [-6.5, 2.88, 8.1], scale: 1.1, rot: 1.7 },
      { pos: [-2.5, 2.88, 8.2], scale: 1.05, rot: 2.8 },
    ],
    [],
  );

  // Broadleaf Canopy Trees seated on dry land bridges (Y = 2.88)
  const broadleafTrees = useMemo(
    () => [
      { pos: [-8.3, 2.88, -4.3], scale: 0.92, color: '#22c55e' },
      { pos: [-1.1, 2.88, -2.5], scale: 0.95, color: '#4ade80' },
      { pos: [-9.5, 2.88, -1.2], scale: 0.88, color: '#16a34a' },
      { pos: [-8.3, 2.88, 2.4], scale: 0.9, color: '#84cc16' },
      { pos: [-1.1, 2.88, 2.2], scale: 0.95, color: '#22c55e' },
      { pos: [2.5, 2.88, 3.3], scale: 0.92, color: '#65a30d' },
    ],
    [],
  );

  // Waterfront Shrubbery along dry upper banks (Y = 2.88)
  const shrubs = useMemo(
    () => [
      { pos: [-7.5, 2.88, -3.7], scale: 0.95 },
      { pos: [-2.4, 2.88, -3.4], scale: 0.88 },
      { pos: [-9.4, 2.88, 0.2], scale: 0.85 },
      { pos: [-6.4, 2.88, 2.3], scale: 0.95 },
      { pos: [-2.0, 2.88, 2.3], scale: 0.9 },
      { pos: [-8.2, 2.88, 5.5], scale: 0.85 },
      { pos: [2.8, 2.88, -2.9], scale: 0.85 },
    ],
    [],
  );

  // Shoreline Boulders on Upper Rim (Y = 2.86) & Middle Riparian Shelf (Y = 2.12)
  const rockClusters = useMemo(
    () => [
      // 1. South Lagoon Shore Boulders (Reddish-brown rock cluster from reference image!)
      { pos: [-5.4, 2.86, 6.9] as [number, number, number], scale: 1.2, rot: 0.3, tint: '#7c2d12' },
      // 2. South-East Shore Stones (Mossy/olive rock cluster from reference image!)
      { pos: [-0.2, 2.86, 4.9] as [number, number, number], scale: 1.1, rot: 1.2, tint: '#57534e' },
      // 3. Central Lagoon Middle Terrace Stones (Exposed at 2.0m normal water level)
      { pos: [-8.1, 2.12, -0.5] as [number, number, number], scale: 0.85, rot: 0.8, tint: '#78716c' },
      // 4. NW Inflow Pond Riprap Apron Stones
      { pos: [-14.4, 2.12, -3.2] as [number, number, number], scale: 0.95, rot: 2.1, tint: '#57534e' },
    ],
    [],
  );

  return (
    <group>
      {/* Layer 0: Wetland Basin Floor (Sediment & Peat Bed at Y = 0.80) */}
      <mesh position={[-5.5, 0.8, 0]} receiveShadow geometry={lakebedGeometry}>
        <meshStandardMaterial color="#0f291e" roughness={0.95} />
      </mesh>

      {/* Layer 1: Inner Ecological Basin Shelf (Y = 0.00..1.52, exposed at 1.0m low pool) */}
      <mesh receiveShadow castShadow geometry={layer1Geo}>
        <meshStandardMaterial color="#6b5b3e" roughness={0.92} flatShading />
      </mesh>

      {/* Layer 2: Middle Riparian Wetland Terrace (Y = 1.52..2.15, cradles 2.0m normal water) */}
      <mesh receiveShadow castShadow geometry={layer2Geo}>
        <meshStandardMaterial color="#3a5a40" roughness={0.86} flatShading />
      </mesh>

      {/* Layer 3: Main Park Meadow Platform (Y = 2.15..2.875, flush with 3.5m flood redline) */}
      <mesh receiveShadow castShadow geometry={layer3MeadowGeo}>
        <meshStandardMaterial color="#588157" roughness={0.82} flatShading />
      </mesh>

      {/* Layer 4+: Elliptical Stepped Contour Knolls on Dry Land */}
      {knolls.map((k, idx) => (
        <SteppedKnoll
          key={idx}
          position={k.position}
          tiers={k.tiers}
          rotation={k.rotation}
        />
      ))}

      {/* Timber Boardwalk & Observation Pier */}
      <ParkBoardwalk />

      {/* Multi-tiered Conifer Pines */}
      {coniferTrees.map((t, idx) => (
        <ConiferTree
          key={idx}
          position={t.pos as [number, number, number]}
          scale={t.scale}
          rotation={t.rot}
        />
      ))}

      {/* Broadleaf Canopy Trees */}
      {broadleafTrees.map((t, idx) => (
        <BroadleafTree
          key={idx}
          position={t.pos as [number, number, number]}
          scale={t.scale}
          crownColor={t.color}
        />
      ))}

      {/* Waterfront Shrubbery */}
      {shrubs.map((s, idx) => (
        <ShrubClump
          key={idx}
          position={s.pos as [number, number, number]}
          scale={s.scale}
        />
      ))}

      {/* Natural Shoreline Boulders */}
      {rockClusters.map((r, idx) => (
        <RockCluster
          key={idx}
          position={r.pos}
          scale={r.scale}
          rotation={r.rot}
          tint={r.tint}
        />
      ))}

      {/* Scenic Park Bench on Central Dividing Peninsula (Y = 2.88) */}
      <group position={[-2.2, 2.88, 1.95]} rotation={[0, -0.35, 0]}>
        <mesh position={[0, 0.22, 0]} castShadow>
          <boxGeometry args={[1.0, 0.07, 0.32]} />
          <meshStandardMaterial color="#78350f" roughness={0.7} />
        </mesh>
        <mesh position={[0, 0.44, -0.14]} castShadow>
          <boxGeometry args={[1.0, 0.3, 0.06]} />
          <meshStandardMaterial color="#78350f" roughness={0.7} />
        </mesh>
        <mesh position={[-0.4, 0.11, 0]}>
          <boxGeometry args={[0.06, 0.22, 0.28]} />
          <meshStandardMaterial color="#1e293b" metalness={0.8} />
        </mesh>
        <mesh position={[0.4, 0.11, 0]}>
          <boxGeometry args={[0.06, 0.22, 0.28]} />
          <meshStandardMaterial color="#1e293b" metalness={0.8} />
        </mesh>
      </group>
    </group>
  );
}
