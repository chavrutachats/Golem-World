/**
 * Vitrine do Golem: ele sobre uma ilhota de grama, girando devagar (armário, início,
 * tela de preparo). Uma cena pequena e leve.
 */
import { useFrame } from '@react-three/fiber';
import type { GolemLook } from '@trivia/shared';
import { useMemo, useRef } from 'react';
import { type StyleProp, type ViewStyle } from 'react-native';
import * as THREE from 'three';
import { C, geo, mat, mesh } from '@/three/kit';
import { buildLights, type LightMood } from '@/three/lighting';
import { flower } from '@/three/nature';
import type { GolemPose } from '@/three/golem';
import { GolemModel } from './GolemModel';
import { Stage3D } from './Stage3D';

function Island() {
  const island = useMemo(() => {
    const g = new THREE.Group();
    const top = mesh(geo.cyl(1.55, 1.45, 0.3, 12), mat(C.leafLight), { p: [0, -0.15, 0] });
    top.receiveShadow = true;
    g.add(top);
    g.add(mesh(geo.cyl(1.45, 0.9, 0.7, 12), mat('#8A5E3C'), { p: [0, -0.65, 0] }));
    g.add(flower(3).translateX(1.05).translateZ(0.45));
    g.add(flower(8).translateX(-1.15).translateZ(0.2));
    g.add(flower(5).translateX(0.7).translateZ(-0.9));
    return g;
  }, []);
  return <primitive object={island} />;
}

function Turntable({ children, spin }: { children: React.ReactNode; spin: boolean }) {
  const ref = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (spin && ref.current) ref.current.rotation.y += dt * 0.5;
  });
  return (
    <group ref={ref} rotation-y={-0.45}>
      {children}
    </group>
  );
}

export interface GolemShowcaseProps {
  look: GolemLook | undefined;
  pose?: GolemPose;
  style?: StyleProp<ViewStyle>;
  spin?: boolean;
  still?: boolean;
  background?: string;
  mood?: LightMood;
  testID?: string;
}

export function GolemShowcase({ look, pose = 'idle', style, spin = false, still = false, background = '#9FD0FF', mood = 'day', testID }: GolemShowcaseProps) {
  const lights = useMemo(() => buildLights(mood, { shadowSize: 6 }).group, [mood]);
  return (
    <Stage3D style={style} camera={{ fov: 30, position: [0, 2.4, 7.4], lookAt: [0, 0.85, 0] }} frameloop={still ? 'demand' : 'always'} testID={testID}>
      <color attach="background" args={[background]} />
      <primitive object={lights} />
      <Turntable spin={spin && !still}>
        <Island />
        <GolemModel look={look} pose={pose} still={still} />
      </Turntable>
    </Stage3D>
  );
}
