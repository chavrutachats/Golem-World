/**
 * A ilha de uma parashá em 3D: a pedra da Torá no alto e, em volta, as seis
 * trilhas de estudo com suas bandeiras. As pedrinhas até as trilhas só aparecem
 * depois que a Torá da parashá foi concluída: todo estudo parte da Torá.
 */
import { useFrame, useThree } from '@react-three/fiber';
import type { GolemLook } from '@trivia/shared';
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import * as THREE from 'three';
import { GolemModel } from '@/components/three/GolemModel';
import { Stage3D } from '@/components/three/Stage3D';
import { usePulse } from '@/components/three/usePulse';
import { curveDots, MAP_W, type MapPoint } from '@/lib/journey-map';
import { C, geo, hashString, mat, mesh, seeded } from '@/three/kit';
import { buildLights } from '@/three/lighting';
import { aimCamera, buildNodeStone, buildPathStones, MAP_SPAN, MAP_UNIT, mapToWorld, type NodeLook } from '@/three/map';
import { mergeStatic } from '@/three/merge';
import { decor, type DecorKind } from '@/three/nature';
import { goalFlag } from '@/three/story';

export interface IslandSpot {
  at: MapPoint;
  look: NodeLook;
  /** Cor da bandeira (trilha aberta ou concluída). */
  flag: string | null;
}

interface Props {
  width: number;
  height: number;
  zoom: number;
  islandHeight: number;
  seed: string;
  land: string;
  torah: IslandSpot;
  spots: readonly IslandSpot[];
  pathsOpen: boolean;
  look: GolemLook | undefined;
  still: boolean;
  /** Quanto a ilha sobe na tela (px), para não sobrar céu em cima. Os toques por cima usam o mesmo valor. */
  lift?: number;
}

function Scene({ height, zoom, islandHeight, seed, land, torah, spots, pathsOpen, still, lift = 0 }: Omit<Props, 'width' | 'look'>) {
  const camera = useThree((s) => s.camera) as THREE.OrthographicCamera;
  const lights = useMemo(() => buildLights('day', { shadowSize: 22 }), []);
  const key = `${seed}|${land}|${pathsOpen}|${torah.look}|${spots.map((s) => `${s.look}${s.flag}`).join(',')}`;
  const world = useMemo(() => {
    const r = seeded(hashString(seed));
    const depth = islandHeight * MAP_UNIT;
    const g = new THREE.Group();
    const terrain = new THREE.Group();
    terrain.add(mesh(geo.rbox(MAP_SPAN - 0.4, 0.5, depth - 0.4, 0.4, 3), mat(land), { p: [0, -0.25, depth / 2] }));
    terrain.add(mesh(geo.rbox(MAP_SPAN + 0.3, 0.36, depth + 0.2, 0.45, 3), mat('#F2E2A8'), { p: [0, -0.42, depth / 2] }));
    terrain.add(mesh(geo.rbox(MAP_SPAN, 1.4, depth, 0.5, 2), mat('#8A5E3C'), { p: [0, -1.25, depth / 2] }));
    const kinds: DecorKind[] = ['tree', 'bush', 'flower', 'rock', 'flower'];
    const taken = [torah.at, ...spots.map((s) => s.at)];
    for (let i = 0; i < 26; i++) {
      const x = 8 + r() * (MAP_W - 16);
      const y = 6 + r() * (islandHeight - 12);
      if (taken.some((t) => Math.hypot(t.x - x, t.y - y) < 22)) continue;
      const o = decor(kinds[i % kinds.length]!, i + 3);
      o.position.copy(mapToWorld(x, y));
      o.scale.setScalar(0.55);
      terrain.add(o);
    }
    const merged = mergeStatic(terrain);
    merged.children.forEach((c) => ((c as THREE.Mesh).material === mat(land) ? ((c as THREE.Mesh).receiveShadow = true) : null));
    g.add(merged);
    const t = buildNodeStone(torah.look);
    t.position.copy(mapToWorld(torah.at.x, torah.at.y));
    t.scale.setScalar(1.35);
    g.add(t);
    spots.forEach((s, i) => {
      const n = buildNodeStone(s.look);
      const p = mapToWorld(s.at.x, s.at.y);
      n.position.copy(p);
      g.add(n);
      if (s.flag) {
        const f = goalFlag(s.flag);
        f.scale.setScalar(0.42);
        f.position.set(p.x + 0.55, 0, p.z - 0.35);
        g.add(f);
      }
      if (pathsOpen) g.add(buildPathStones(curveDots(torah.at, s.at, i % 2 ? 6 : -6), 0, i + 1));
    });
    return g;
    // A chave resume tudo o que muda o desenho.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, islandHeight]);
  useFrame(() => aimCamera(camera, lift, height, zoom));
  usePulse(world, still);
  return (
    <>
      <color attach="background" args={['#3E8EDB']} />
      <primitive object={lights.group} />
      <primitive object={world} />
    </>
  );
}

export function Island3D({ width, height, look, still, ...rest }: Props) {
  const golemAt = mapToWorld(rest.torah.at.x - 22, rest.torah.at.y + 2);
  return (
    <View style={{ width, height }}>
      <Stage3D style={StyleSheet.absoluteFill} orthographic camera={{ position: [0, 30, 30], zoom: rest.zoom }} testID="island-scene">
        <Scene height={height} still={still} {...rest} />
        <GolemModel look={look} pose="idle" still={still} scale={0.85} position={[golemAt.x, 0, golemAt.z]} rotationY={0.3} />
      </Stage3D>
    </View>
  );
}

export { C as ISLAND_COLORS };
