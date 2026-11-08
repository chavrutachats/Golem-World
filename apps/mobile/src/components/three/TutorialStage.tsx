/**
 * Palquinho da tela de preparo: o Golem mostra cada regra enquanto o servidor
 * traduz os textos (pula a pedra, tropeça nos espinhos, comemora com as tábuas).
 */
import { useFrame } from '@react-three/fiber';
import type { GolemLook } from '@trivia/shared';
import { useMemo, useRef } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import * as THREE from 'three';
import { C, geo, mat, mesh } from '@/three/kit';
import { buildLights } from '@/three/lighting';
import type { GolemPose } from '@/three/golem';
import { buildSevivon } from '@/three/sevivon';
import { buildGoal, buildObstacle } from '@/three/story';
import { GolemModel } from './GolemModel';
import { Stage3D } from './Stage3D';

export type TutorialScene = 'jump' | 'hurt' | 'level' | 'source' | 'tracks' | 'wheel' | 'crown' | 'lives';

const POSE: Record<TutorialScene, GolemPose> = {
  jump: 'jump',
  hurt: 'hurt',
  level: 'walk',
  source: 'cheer',
  tracks: 'idle',
  wheel: 'cheer',
  crown: 'cheer',
  lives: 'idle',
};

function Prop({ scene }: { scene: TutorialScene }) {
  const obj = useMemo(() => {
    switch (scene) {
      case 'jump':
        return buildObstacle('rock');
      case 'hurt':
        return buildObstacle('thorns');
      case 'source':
        return buildGoal({ kind: 'prop', prop: 'tablets' });
      case 'tracks':
        return buildGoal({ kind: 'signpost', color: C.techelet });
      default:
        return null;
    }
  }, [scene]);
  if (!obj) return null;
  if (scene === 'source') obj.scale.setScalar(0.9);
  return <primitive object={obj} position={[1.15, 0, -0.2]} />;
}

/** Na dica do sevivon: ele gira de pé ao lado do Golem, bambeando de leve. */
function TutorialSevivon({ still }: { still: boolean }) {
  const root = useMemo(() => {
    const r = buildSevivon().root;
    r.scale.setScalar(0.95);
    return r;
  }, []);
  const t = useRef(0);
  useFrame((_, dt) => {
    if (still) return;
    t.current += dt;
    root.rotation.set(0.09 * Math.sin(t.current * 2.1), t.current * 7, 0.09 * Math.cos(t.current * 2.1));
  });
  return <primitive object={root} position={[1.25, 0.95, -0.2]} />;
}

function Ground() {
  const g = useMemo(() => {
    const top = mesh(geo.cyl(3.2, 3.0, 0.3, 16), mat(C.leafLight), { p: [0, -0.15, 0] });
    top.receiveShadow = true;
    const group = new THREE.Group();
    group.add(top, mesh(geo.cyl(3.0, 2.2, 0.6, 16), mat('#8A5E3C'), { p: [0, -0.6, 0] }));
    return group;
  }, []);
  return <primitive object={g} />;
}

export function TutorialStage({ scene, look, style, still }: { scene: TutorialScene; look: GolemLook | undefined; style?: StyleProp<ViewStyle>; still: boolean }) {
  const lights = useMemo(() => buildLights('day', { shadowSize: 8 }).group, []);
  const jumpT = useRef(0);
  return (
    <Stage3D style={style} camera={{ fov: 30, position: [0, 2.6, 8.8], lookAt: [0, 1, 0] }} frameloop={still ? 'demand' : 'always'}>
      <color attach="background" args={['#8CC4FF']} />
      <primitive object={lights} />
      <Ground />
      <Prop scene={scene} />
      {scene === 'wheel' ? <TutorialSevivon still={still} /> : null}
      <GolemModel
        look={look}
        pose={POSE[scene]}
        still={still}
        rotationY={0.5}
        onFrame={(_, root) => {
          jumpT.current += 1 / 60;
          const x = scene === 'jump' || scene === 'hurt' || scene === 'source' || scene === 'tracks' || scene === 'wheel' ? -0.9 : 0;
          const y = scene === 'jump' && !still ? Math.abs(Math.sin(jumpT.current * 3)) * 1.4 : 0;
          root.position.set(x, y, 0);
        }}
      />
    </Stage3D>
  );
}
