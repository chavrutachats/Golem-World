/**
 * O Golem dentro de uma cena 3D (react-three-fiber): monta o boneco com os itens
 * vestidos e aplica a pose a cada quadro.
 */
import { useFrame } from '@react-three/fiber';
import { ITEM_SLOTS, type GolemLook } from '@trivia/shared';
import { useMemo, useRef } from 'react';
import type * as THREE from 'three';
import { buildGolem, poseGolem, type GolemPose, type GolemRig } from '@/three/golem';

export function lookKey(look: GolemLook | undefined): string {
  const e = look?.equipped ?? {};
  return ITEM_SLOTS.map((slot) => e[slot] ?? '-').join('|');
}

export interface GolemModelProps {
  look: GolemLook | undefined;
  pose: GolemPose;
  position?: readonly [number, number, number];
  rotationY?: number;
  scale?: number;
  /** Sem balanço nem piscar (movimento reduzido). */
  still?: boolean;
  /** Para a cena mexer no Golem (pulo, tropeço) depois da pose. */
  onFrame?: (rig: GolemRig, root: THREE.Group) => void;
}

export function GolemModel({ look, pose, position = [0, 0, 0], rotationY = 0, scale = 1, still, onFrame }: GolemModelProps) {
  const key = lookKey(look);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- a chave resume o visual
  const rig = useMemo(() => buildGolem(look), [key]);
  const t0 = useRef(0);
  useFrame(({ clock }) => {
    poseGolem(rig, pose, clock.elapsedTime - t0.current, still);
    onFrame?.(rig, rig.root);
  });
  return <primitive object={rig.root} position={position as [number, number, number]} rotation-y={rotationY} scale={scale} />;
}
