/**
 * O mapa do Golem World em 3D: cada livro da Torá é uma ilha flutuando no mar, com o
 * caminho de pedrinhas ligando as parashiot e a casa de estudos no fim.
 *
 * A câmera é ortográfica e inclinada (vista de cima, em diagonal), então a posição
 * de cada fase na tela é uma conta linear: os nomes e as áreas de toque ficam numa
 * camada comum de React Native por cima da cena, rolando junto com ela.
 */
import { WORLDS, type TorahBook } from '@trivia/shared';
import * as THREE from 'three';
import { layoutWorld, MAP_W, type MapNodeLayout, type WorldLayout } from '@/lib/journey-map';
import { C, geo, glow, group, hashString, mat, mesh, seeded } from './kit';
import { mergeStatic } from './merge';
import { decor, type DecorKind } from './nature';
import { buildBeitMidrash, type BeitMidrashStyle } from './story';

/** Unidades do mundo por unidade do mapa. */
export const MAP_UNIT = 0.1;
/** Largura do mapa em unidades do mundo. */
export const MAP_SPAN = MAP_W * MAP_UNIT;
/** Inclinação da câmera (abaixo do horizonte). */
export const MAP_TILT = (42 * Math.PI) / 180;
const SIN = Math.sin(MAP_TILT);
const COS = Math.cos(MAP_TILT);

/** Faixa de mar acima da primeira ilha (pixels), onde fica o nome do primeiro mundo. */
export const MAP_TOP_PAD = 64;

/** Pixels por unidade do mundo para o mapa ocupar a largura da tela. */
export function mapZoom(screenWidth: number): number {
  return screenWidth / (MAP_SPAN + 3.4);
}

/** Do mapa (x, y em unidades do mapa, y do topo do mapa inteiro) para o mundo. */
export function mapToWorld(mx: number, my: number): THREE.Vector3 {
  return new THREE.Vector3((mx - MAP_W / 2) * MAP_UNIT, 0, my * MAP_UNIT);
}

/** Posição na camada de rolagem (pixels) de um ponto do mundo. */
export function contentPoint(p: THREE.Vector3, zoom: number, screenWidth: number): { x: number; y: number } {
  return { x: screenWidth / 2 + p.x * zoom, y: (p.z * SIN - p.y * COS) * zoom + MAP_TOP_PAD };
}

/** Altura total da camada de rolagem para o mapa até `bottomMapY`. */
export function contentHeight(bottomMapY: number, zoom: number): number {
  return bottomMapY * MAP_UNIT * SIN * zoom + MAP_TOP_PAD;
}

/**
 * Câmera para uma rolagem: mira o ponto do chão que está no meio da tela.
 * (A conta é o inverso de `contentPoint`.)
 */
export function aimCamera(camera: THREE.OrthographicCamera, scrollY: number, viewHeight: number, zoom: number): void {
  const targetZ = (scrollY + viewHeight / 2 - MAP_TOP_PAD) / (SIN * zoom);
  const target = new THREE.Vector3(0, 0, targetZ);
  camera.position.set(0, SIN * 40, targetZ + COS * 40);
  camera.zoom = zoom;
  camera.lookAt(target);
  camera.updateProjectionMatrix();
}

const TERRAIN: Readonly<Record<string, { land: string; edge: string; cliff: string; decor: readonly DecorKind[] }>> = {
  garden: { land: '#7CCB5E', edge: '#F2E2A8', cliff: '#8A5E3C', decor: ['tree', 'bush', 'flower', 'cypress', 'flower'] },
  egypt: { land: '#EBC27E', edge: '#F7E3B0', cliff: '#B98C55', decor: ['palm', 'pyramid', 'dune', 'rock', 'reeds'] },
  camp: { land: '#93D163', edge: '#F2E2A8', cliff: '#8A5E3C', decor: ['tent', 'bush', 'flower', 'rock', 'tree'] },
  desert: { land: '#EFB878', edge: '#F7E3B0', cliff: '#B5814E', decor: ['dune', 'rock', 'palm', 'tent'] },
  plains: { land: '#8BCF5A', edge: '#F2E2A8', cliff: '#7E5634', decor: ['tree', 'hill', 'flower', 'bush', 'palm'] },
};

/** Tamanho aproximado de cada enfeite no mapa (unidades do mapa), para não se atropelarem. */
const FOOTPRINT: Readonly<Record<DecorKind, number>> = {
  tree: 12,
  cypress: 7,
  palm: 11,
  bush: 9,
  rock: 8,
  dune: 16,
  hill: 22,
  mountain: 30,
  pyramid: 18,
  tent: 12,
  flower: 4,
  reeds: 6,
};

const DECOR_SCALE: Partial<Record<DecorKind, number>> = { hill: 0.5, dune: 0.55, pyramid: 0.45, mountain: 0.4, tent: 0.6 };

export function layoutWorld3D(book: TorahBook): WorldLayout {
  const world = WORLDS.find((w) => w.id === book)!;
  const t = TERRAIN[world.terrain]!;
  return layoutWorld(book, (k) => ({ w: FOOTPRINT[k as DecorKind] ?? 10, h: (FOOTPRINT[k as DecorKind] ?? 10) * 0.8 }), t.decor, 70);
}

/** A ilha de um livro: terra, praia, barranco e enfeites (tudo junto numa malha só). */
export function buildIsland(book: TorahBook, layout: WorldLayout, top: number): THREE.Group {
  const world = WORLDS.find((w) => w.id === book)!;
  const t = TERRAIN[world.terrain]!;
  const depth = layout.height * MAP_UNIT;
  const z0 = top * MAP_UNIT;
  const r = seeded(hashString(book));
  const raw = new THREE.Group();
  const land = mesh(geo.rbox(MAP_SPAN - 0.2, 0.5, depth - 0.3, 0.35, 3), mat(t.land), { p: [0, -0.25, z0 + depth / 2] });
  raw.add(land);
  raw.add(mesh(geo.rbox(MAP_SPAN + 0.5, 0.36, depth + 0.4, 0.4, 3), mat(t.edge), { p: [0, -0.42, z0 + depth / 2] }));
  raw.add(mesh(geo.rbox(MAP_SPAN + 0.2, 1.4, depth + 0.1, 0.5, 2), mat(t.cliff), { p: [0, -1.25, z0 + depth / 2] }));
  for (const d of layout.decor) {
    const kind = d.sprite as DecorKind;
    const o = decor(kind, Math.floor(r() * 1000));
    const fp = FOOTPRINT[kind] ?? 10;
    const p = mapToWorld(d.x + fp / 2, top + d.y + fp * 0.6);
    o.position.copy(p);
    o.rotation.y = r() * Math.PI * 2;
    o.scale.setScalar((DECOR_SCALE[kind] ?? 0.62) * (0.85 + r() * 0.3));
    raw.add(o);
  }
  const merged = mergeStatic(raw, { castShadow: true });
  // A terra recebe as sombras das árvores e do Golem.
  merged.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && m.material === mat(t.land)) m.receiveShadow = true;
  });
  return merged;
}

/** Pedrinhas do caminho entre duas fases (só aparecem quando o trecho está aberto). */
export function buildPathStones(dots: readonly { x: number; y: number }[], top: number, seed: number): THREE.Group {
  const r = seeded(seed);
  const raw = new THREE.Group();
  for (const d of dots) {
    const p = mapToWorld(d.x, top + d.y);
    raw.add(mesh(geo.dodeca(0.13), mat('#F4EBD6'), { p: [p.x, 0.02, p.z], s: [1.2, 0.35, 1], r: [0, r() * 3, 0] }));
  }
  return mergeStatic(raw, { castShadow: false });
}

export type NodeLook = 'locked' | 'open' | 'done';

/** A pedra de uma fase: dourada quando concluída, clara e com anel quando aberta, cinza com cadeado quando fechada. */
export function buildNodeStone(look: NodeLook): THREE.Group {
  const top = look === 'done' ? C.gold : look === 'open' ? '#FFFFFF' : '#A7A9B3';
  const side = look === 'done' ? C.goldDeep : look === 'open' ? '#D9DCE6' : '#7D808C';
  const parts: THREE.Object3D[] = [
    mesh(geo.cyl(0.62, 0.7, 0.32, 14), mat(side), { p: [0, 0.16, 0] }),
    mesh(geo.cyl(0.6, 0.62, 0.06, 14), mat(top), { p: [0, 0.35, 0] }),
  ];
  if (look === 'done') {
    const star = new THREE.Shape();
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
      const rr = i % 2 ? 0.13 : 0.3;
      if (i === 0) star.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
      else star.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    parts.push(mesh(geo.shape('node-star', () => star, 0.06), mat('#FFF1B8', { emissive: '#FFD54A', emissiveIntensity: 0.35 }), { p: [0, 0.4, 0], r: [-Math.PI / 2, 0, 0] }));
  } else if (look === 'open') {
    parts.push(mesh(geo.torus(0.78, 0.05, Math.PI * 2, 28), glow(C.gold), { p: [0, 0.06, 0], r: [Math.PI / 2, 0, 0], name: 'ring', shadow: false }));
  } else {
    parts.push(mesh(geo.rbox(0.3, 0.24, 0.12, 0.04), mat('#5E616D'), { p: [0, 0.55, 0] }));
    parts.push(mesh(geo.torus(0.1, 0.035, Math.PI, 10), mat('#5E616D'), { p: [0, 0.67, 0] }));
  }
  return group({}, ...parts);
}

export function buildMapBeitMidrash(style: BeitMidrashStyle): THREE.Group {
  const b = buildBeitMidrash(style);
  b.scale.setScalar(0.62);
  return b;
}

/** O mar em volta das ilhas. */
export function buildSea(length: number): THREE.Group {
  const sea = mesh(geo.plane(60, length + 40), mat('#3E8EDB'), { p: [0, -0.9, length / 2], r: [-Math.PI / 2, 0, 0], shadow: false });
  sea.receiveShadow = false;
  const r = seeded(77);
  const raw = new THREE.Group();
  for (let i = 0; i < Math.floor(length * 1.2); i++) {
    raw.add(mesh(geo.box(0.5 + r() * 0.6, 0.02, 0.08), glow('#9ED3FF', 0.8), { p: [(r() - 0.5) * 24, -0.88, r() * (length + 20) - 10], shadow: false }));
  }
  const waves = mergeStatic(raw, { castShadow: false });
  return group({}, sea, waves);
}

export function nodeWorldPosition(n: MapNodeLayout, top: number): THREE.Vector3 {
  return mapToWorld(n.x, top + n.y);
}
