/**
 * Os anéis das fases abertas (peças chamadas "ring") pulsam devagar para chamar o
 * toque. Com "reduzir movimento" ficam parados. Os anéis são achados uma vez por
 * grupo, não a cada quadro.
 */
import { useFrame } from '@react-three/fiber';
import { useMemo } from 'react';
import type * as THREE from 'three';

export function usePulse(root: THREE.Object3D, still: boolean): void {
  const rings = useMemo(() => {
    const found: THREE.Object3D[] = [];
    root.traverse((o) => {
      if (o.name === 'ring') found.push(o);
    });
    return found;
  }, [root]);
  useFrame(({ clock }) => {
    if (rings.length === 0) return;
    const k = still ? 1 : 1 + Math.sin(clock.elapsedTime * 3) * 0.08;
    for (const r of rings) r.scale.setScalar(k);
  });
}
