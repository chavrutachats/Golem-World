/**
 * Peças básicas do mundo 3D do Golem: paleta, materiais e geometrias em cache.
 *
 * Estilo "diorama de barro": poucos polígonos, sombreamento chapado (flatShading),
 * luz suave. Tudo é montado com primitivas, sem arquivos de modelo: o mesmo código
 * desenha no celular (expo-gl) e no navegador (WebGL), e dá para testar sem tela.
 *
 * Geometrias e materiais são compartilhados (cache por chave) e nunca descartados:
 * são poucos e pequenos, e assim cada cena nova sai de graça.
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

export const C = {
  clay: '#A9714E',
  clayDark: '#8A573A',
  clayLight: '#C58D66',
  ink: '#2A1C14',
  white: '#FFFFFF',
  cream: '#F6EBD3',
  gold: '#F2B630',
  goldDeep: '#C98A12',
  velvet: '#1D2A78',
  techelet: '#3E7BD6',
  red: '#D64545',
  blush: '#E79A86',
  leaf: '#5E9E4B',
  leafDark: '#3F7A38',
  leafLight: '#8BC46A',
  trunk: '#7A5233',
  sand: '#E8C88E',
  sandDark: '#CFA766',
  stone: '#9C9A92',
  stoneDark: '#77746D',
  water: '#3C8FD8',
  waterLight: '#7CC0F2',
  wood: '#A87445',
  woodDark: '#7E532D',
  linen: '#EFE6D2',
  fire: '#FF8A2A',
  fireCore: '#FFD45C',
  night: '#141B44',
} as const;

// ---------------------------------------------------------------------------
// Materiais
// ---------------------------------------------------------------------------

const materials = new Map<string, THREE.Material>();

export interface MatOptions {
  /** Brilho próprio (letras do Golem, fogo, estrelas). */
  emissive?: string;
  emissiveIntensity?: number;
  /** Sombreado liso em vez de facetado (vidro, metal). */
  smooth?: boolean;
  opacity?: number;
  side?: THREE.Side;
}

/** Material Lambert facetado, compartilhado por cor + opções. */
export function mat(color: string, o: MatOptions = {}): THREE.Material {
  const key = `${color}|${o.emissive ?? ''}|${o.emissiveIntensity ?? ''}|${o.smooth ? 1 : 0}|${o.opacity ?? 1}|${o.side ?? 0}`;
  let m = materials.get(key);
  if (!m) {
    m = new THREE.MeshLambertMaterial({
      color,
      flatShading: !o.smooth,
      ...(o.emissive ? { emissive: new THREE.Color(o.emissive), emissiveIntensity: o.emissiveIntensity ?? 1 } : {}),
      ...(o.opacity !== undefined && o.opacity < 1 ? { transparent: true, opacity: o.opacity, depthWrite: false } : {}),
      ...(o.side !== undefined ? { side: o.side } : {}),
    });
    materials.set(key, m);
  }
  return m;
}

/** Material que não recebe luz (céu, brilhos). */
export function glow(color: string, opacity = 1): THREE.Material {
  const key = `glow|${color}|${opacity}`;
  let m = materials.get(key);
  if (!m) {
    m = new THREE.MeshBasicMaterial({ color, ...(opacity < 1 ? { transparent: true, opacity, depthWrite: false } : {}) });
    materials.set(key, m);
  }
  return m;
}

// ---------------------------------------------------------------------------
// Geometrias
// ---------------------------------------------------------------------------

const geometries = new Map<string, THREE.BufferGeometry>();

function cached<T extends THREE.BufferGeometry>(key: string, make: () => T): T {
  let g = geometries.get(key) as T | undefined;
  if (!g) {
    g = make();
    geometries.set(key, g);
  }
  return g;
}

const r3 = (n: number) => Math.round(n * 1000) / 1000;

export const geo = {
  box: (w: number, h: number, d: number) => cached(`box|${r3(w)}|${r3(h)}|${r3(d)}`, () => new THREE.BoxGeometry(w, h, d)),
  /** Caixa de cantos arredondados: corpo e cabeça do Golem, almofadas, livros. */
  rbox: (w: number, h: number, d: number, r: number, seg = 2) =>
    cached(`rbox|${r3(w)}|${r3(h)}|${r3(d)}|${r3(r)}|${seg}`, () => new RoundedBoxGeometry(w, h, d, seg, r)),
  /** Esfera de poucas faces (icosaedro): pedras, folhagem, nuvens, olhos. */
  ball: (r: number, detail = 1) => cached(`ball|${r3(r)}|${detail}`, () => new THREE.IcosahedronGeometry(r, detail)),
  sphere: (r: number, w = 12, h = 8, thetaLength = Math.PI) =>
    cached(`sph|${r3(r)}|${w}|${h}|${r3(thetaLength)}`, () => new THREE.SphereGeometry(r, w, h, 0, Math.PI * 2, 0, thetaLength)),
  cyl: (rt: number, rb: number, h: number, seg = 8) => cached(`cyl|${r3(rt)}|${r3(rb)}|${r3(h)}|${seg}`, () => new THREE.CylinderGeometry(rt, rb, h, seg)),
  cone: (r: number, h: number, seg = 7) => cached(`cone|${r3(r)}|${r3(h)}|${seg}`, () => new THREE.ConeGeometry(r, h, seg)),
  capsule: (r: number, len: number, seg = 6) => cached(`cap|${r3(r)}|${r3(len)}|${seg}`, () => new THREE.CapsuleGeometry(r, len, 3, seg)),
  torus: (r: number, tube: number, arc = Math.PI * 2, seg = 16) =>
    cached(`torus|${r3(r)}|${r3(tube)}|${r3(arc)}|${seg}`, () => new THREE.TorusGeometry(r, tube, 6, seg, arc)),
  plane: (w: number, h: number, sw = 1, sh = 1) => cached(`plane|${r3(w)}|${r3(h)}|${sw}|${sh}`, () => new THREE.PlaneGeometry(w, h, sw, sh)),
  disc: (r: number, seg = 16) => cached(`disc|${r3(r)}|${seg}`, () => new THREE.CircleGeometry(r, seg)),
  dodeca: (r: number) => cached(`dodeca|${r3(r)}`, () => new THREE.DodecahedronGeometry(r, 0)),
  /** Peça achatada a partir de um contorno (letras, chamas, folhas). */
  shape: (key: string, make: () => THREE.Shape, depth: number) =>
    cached(`shape|${key}|${r3(depth)}`, () => {
      const g = new THREE.ExtrudeGeometry(make(), { depth, bevelEnabled: false, steps: 1 });
      g.translate(0, 0, -depth / 2);
      return g;
    }),
};

// ---------------------------------------------------------------------------
// Montagem
// ---------------------------------------------------------------------------

export type Vec = readonly [number, number, number];

export interface Place {
  p?: Vec;
  r?: Vec;
  s?: Vec | number;
  name?: string;
  /** Projeta sombra (padrão: sim). */
  shadow?: boolean;
}

export function mesh(g: THREE.BufferGeometry, m: THREE.Material, at: Place = {}): THREE.Mesh {
  const o = new THREE.Mesh(g, m);
  place(o, at);
  o.castShadow = at.shadow ?? true;
  o.receiveShadow = false;
  return o;
}

export function group(at: Place, ...children: THREE.Object3D[]): THREE.Group {
  const g = new THREE.Group();
  place(g, at);
  for (const c of children) g.add(c);
  return g;
}

export function place<T extends THREE.Object3D>(o: T, { p, r, s, name }: Place): T {
  if (p) o.position.set(p[0], p[1], p[2]);
  if (r) o.rotation.set(r[0], r[1], r[2]);
  if (s !== undefined) typeof s === 'number' ? o.scale.setScalar(s) : o.scale.set(s[0], s[1], s[2]);
  if (name) o.name = name;
  return o;
}

/** Gerador pseudoaleatório com semente (o mesmo cenário em todo aparelho). */
export function seeded(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 100_000) / 100_000;
  };
}

/** Número estável a partir de um texto (semente por parashá, por obstáculo…). */
export function hashString(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
