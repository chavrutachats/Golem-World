/**
 * A cena 3D do mapa: as ilhas dos livros abertos (e a primeira fechada), o caminho
 * de pedrinhas, as pedras das fases e o Golem andando. A câmera segue a rolagem da
 * camada de React Native que fica por cima (nomes e toques), lida a cada quadro.
 */
import { useFrame, useThree } from '@react-three/fiber';
import { WORLDS, type GolemLook, type WorldStatus } from '@trivia/shared';
import { memo, useMemo, useRef, type RefObject } from 'react';
import * as THREE from 'three';
import { GolemModel } from '@/components/three/GolemModel';
import { usePulse } from '@/components/three/usePulse';
import type { MapNodeLayout, WorldLayout } from '@/lib/journey-map';
import type { SceneDirector } from '@/three/director';
import type { GolemPose } from '@/three/golem';
import { buildLights } from '@/three/lighting';
import { aimCamera, buildIsland, buildMapBeitMidrash, buildNodeStone, buildPathStones, buildSea, MAP_TILT, mapToWorld, nodeWorldPosition, type NodeLook } from '@/three/map';
import { animate, buildCreation, buildVignette } from '@/three/vignettes';

export interface PlacedWorld {
  layout: WorldLayout;
  /** Topo do mundo no mapa inteiro (unidades do mapa). */
  top: number;
}

export type WalkChannel = 'x' | 'z' | 'heading';

interface Props {
  worlds: readonly PlacedWorld[];
  statuses: readonly WorldStatus[];
  scrollY: RefObject<number>;
  viewHeight: number;
  zoom: number;
  totalMapHeight: number;
  look: GolemLook | undefined;
  pose: GolemPose;
  walker: SceneDirector<WalkChannel>;
  still: boolean;
  /** Centro (y do mapa) da cena da Criação, no topo; null sem ela. */
  prologueY: number | null;
}

/** Faixa do mundo (z) visível agora, com folga: só o que está na tela se anima. */
function visibleZ(camera: THREE.Camera, viewHeight: number, zoom: number): [number, number] {
  const center = camera.position.z - Math.cos(MAP_TILT) * 40;
  const half = viewHeight / zoom / Math.sin(MAP_TILT) / 2 + 3;
  return [center - half, center + half];
}

/** As cenas entre as fases de um mundo (só as das fases já abertas ou da próxima). */
const WorldVignettes = memo(function WorldVignettes({ world, status, still, viewHeight, zoom }: { world: PlacedWorld; status: WorldStatus | undefined; still: boolean; viewHeight: number; zoom: number }) {
  const open = status?.unlocked ?? false;
  const scenes = useMemo(() => {
    if (!open) return [];
    return world.layout.vignettes.flatMap((v) => {
      const g = buildVignette(v.parashaId);
      if (!g) return [];
      g.position.copy(mapToWorld(v.x, world.top + v.y));
      // De frente para a câmera, com um leve giro para o lado do caminho.
      g.rotation.y = v.x < 60 ? 0.25 : -0.25;
      return [g];
    });
  }, [world, open]);
  const camera = useThree((s) => s.camera);
  useFrame(({ clock }) => {
    if (!scenes.length) return;
    const [z0, z1] = visibleZ(camera, viewHeight, zoom);
    const t = still ? 0 : clock.elapsedTime;
    for (const g of scenes) {
      const on = g.position.z > z0 && g.position.z < z1;
      g.visible = on;
      if (on && !still) animate(g, t);
    }
  });
  return (
    <>
      {scenes.map((g) => (
        <primitive key={g.name} object={g} />
      ))}
    </>
  );
});

/** A Criação, no topo do mapa: o vazio, a luz, a terra, os astros e os bichos. */
function CreationScene({ y, still, viewHeight, zoom }: { y: number; still: boolean; viewHeight: number; zoom: number }) {
  const creation = useMemo(() => buildCreation(), []);
  const camera = useThree((s) => s.camera);
  useMemo(() => creation.root.position.copy(mapToWorld(60, y)), [creation, y]);
  useFrame(({ clock }) => {
    const [z0, z1] = visibleZ(camera, viewHeight, zoom);
    const z = creation.root.position.z;
    creation.root.visible = z + 5 > z0 && z - 5 < z1;
    if (creation.root.visible) creation.update(clock.elapsedTime, still);
  });
  return <primitive object={creation.root} />;
}

function nodeLook(status: WorldStatus | undefined, n: MapNodeLayout): NodeLook {
  if (!status) return 'locked';
  const st = n.kind === 'beitMidrash' ? status.beitMidrash : status.parashot.find((p) => p.main.nodeId === n.id)?.main;
  return st?.state === 'completed' ? 'done' : st?.state === 'open' ? 'open' : 'locked';
}

function CameraRig({ scrollY, viewHeight, zoom, sun }: { scrollY: RefObject<number>; viewHeight: number; zoom: number; sun: THREE.DirectionalLight }) {
  const camera = useThree((s) => s.camera) as THREE.OrthographicCamera;
  useFrame(() => {
    aimCamera(camera, scrollY.current ?? 0, viewHeight, zoom);
    // O sol acompanha o pedaço visível, para as sombras caberem no mapa de sombra.
    const z = camera.position.z - Math.cos((42 * Math.PI) / 180) * 40;
    sun.position.set(6, 14, z + 6);
    sun.target.position.set(0, 0, z);
    sun.target.updateMatrixWorld();
  });
  return null;
}

const WorldPiece = memo(function WorldPiece({ world, status, still }: { world: PlacedWorld; status: WorldStatus | undefined; still: boolean }) {
  const def = WORLDS.find((w) => w.id === world.layout.book)!;
  const island = useMemo(() => buildIsland(world.layout.book, world.layout, world.top), [world]);
  const looks = world.layout.nodes.map((n) => nodeLook(status, n)).join(',');
  const pieces = useMemo(() => {
    const g = new THREE.Group();
    const ls = looks.split(',') as NodeLook[];
    world.layout.nodes.forEach((n, i) => {
      const p = nodeWorldPosition(n, world.top);
      if (n.kind === 'beitMidrash') {
        const b = buildMapBeitMidrash(def.beitMidrash.style);
        b.position.copy(p);
        g.add(b);
        const s = buildNodeStone(ls[i]!);
        s.position.set(p.x, 0, p.z + 1.6);
        s.scale.setScalar(0.8);
        g.add(s);
      } else {
        const s = buildNodeStone(ls[i]!);
        s.position.copy(p);
        g.add(s);
      }
      // Pedrinhas até a próxima fase, depois que esta foi concluída.
      if (ls[i] === 'done' && world.layout.dots[i]) g.add(buildPathStones(world.layout.dots[i]!, world.top, i + world.top));
    });
    return g;
  }, [world, looks, def]);
  usePulse(pieces, still);
  return (
    <>
      <primitive object={island} />
      <primitive object={pieces} />
    </>
  );
});

export function Map3D({ worlds, statuses, scrollY, viewHeight, zoom, totalMapHeight, look, pose, walker, still, prologueY }: Props) {
  const lights = useMemo(() => buildLights('day', { shadowSize: 26 }), []);
  const sea = useMemo(() => buildSea(totalMapHeight * 0.1), [totalMapHeight]);
  // Para onde o Golem olha: na direção em que anda; parado, de frente para a câmera.
  const facing = useRef({ x: Number.NaN, z: 0, heading: 0 });
  useFrame(({ clock }) => walker.update(clock.elapsedTime * 1000));
  return (
    <>
      <color attach="background" args={['#3E8EDB']} />
      <primitive object={lights.group} />
      <CameraRig scrollY={scrollY} viewHeight={viewHeight} zoom={zoom} sun={lights.sun} />
      <primitive object={sea} />
      {prologueY !== null ? <CreationScene y={prologueY} still={still} viewHeight={viewHeight} zoom={zoom} /> : null}
      {worlds.map((w) => (
        <WorldPiece key={w.layout.book} world={w} status={statuses.find((s) => s.book === w.layout.book)} still={still} />
      ))}
      {worlds.map((w) => (
        <WorldVignettes key={`v-${w.layout.book}`} world={w} status={statuses.find((s) => s.book === w.layout.book)} still={still} viewHeight={viewHeight} zoom={zoom} />
      ))}
      <GolemModel
        look={look}
        pose={pose}
        still={still}
        scale={0.72}
        onFrame={(_, root) => {
          const x = walker.get('x');
          const z = walker.get('z');
          const f = facing.current;
          const dx = Number.isNaN(f.x) ? 0 : x - f.x;
          const dz = z - f.z;
          const target = Math.hypot(dx, dz) > 1e-4 ? Math.atan2(dx, dz) : walker.get('heading');
          let diff = target - f.heading;
          diff = Math.atan2(Math.sin(diff), Math.cos(diff));
          f.heading += diff * 0.25;
          f.x = x;
          f.z = z;
          root.position.set(x, 0.38, z);
          root.rotation.y = f.heading;
        }}
      />
    </>
  );
}
