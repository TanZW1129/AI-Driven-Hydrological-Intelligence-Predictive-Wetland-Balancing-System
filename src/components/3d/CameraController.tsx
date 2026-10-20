/**
 * @file CameraController.tsx
 * @description OrbitControls wrapper that smoothly interpolates camera position
 * and look-at target whenever the operator selects a new camera preset.
 */

import { OrbitControls } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import type { CameraViewPreset } from '../../store/simulationStore';
import { CAMERA_PRESETS } from './sceneCoordinates';

interface CameraControllerProps {
  preset: CameraViewPreset;
}

export function CameraController({ preset }: CameraControllerProps) {
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const { camera } = useThree();

  const desiredPos = useRef(new THREE.Vector3(...CAMERA_PRESETS.OVERVIEW.position));
  const desiredTarget = useRef(new THREE.Vector3(...CAMERA_PRESETS.OVERVIEW.target));
  const isTransitioning = useRef(false);

  useEffect(() => {
    const spec = CAMERA_PRESETS[preset];
    desiredPos.current.set(...spec.position);
    desiredTarget.current.set(...spec.target);
    isTransitioning.current = true;
  }, [preset]);

  useFrame((_, delta) => {
    if (!isTransitioning.current || !controlsRef.current) return;

    const alpha = Math.min(1, delta * 4.5);
    camera.position.lerp(desiredPos.current, alpha);
    controlsRef.current.target.lerp(desiredTarget.current, alpha);
    controlsRef.current.update();

    if (
      camera.position.distanceTo(desiredPos.current) < 0.08 &&
      controlsRef.current.target.distanceTo(desiredTarget.current) < 0.08
    ) {
      isTransitioning.current = false;
    }
  });

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      enableDamping
      dampingFactor={0.08}
      minDistance={5}
      maxDistance={55}
      maxPolarAngle={Math.PI / 2 - 0.04}
      onStart={() => {
        // Stop preset transition immediately when user manually drags the camera
        isTransitioning.current = false;
      }}
    />
  );
}
