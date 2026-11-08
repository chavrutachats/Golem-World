/**
 * As cenas animadas do mapa do Golem World (Fase 12). Entre uma fase e a seguinte, uma
 * cena pequena conta a parashá que vem (Nôach construindo a arca e os bichos subindo, a
 * torre de Bavel, a escada de Yaakov…); no topo do mapa, antes de Bereshit, a Criação: o
 * vazio, a luz, a terra, as plantas, os astros e os bichos.
 *
 * Cada cena é montada com as peças do mundo 3D (story.ts, nature.ts) e uma lista de
 * movimentos simples (balançar, andar, girar, subir…), calculados por uma função pura do
 * tempo: dá para testar sem tela e o movimento reduzido mostra a cena parada.
 */
import type { ObstacleId, PropId } from '@trivia/shared';
import * as THREE from 'three';
import { C, geo, glow, group, mat, mesh, type Vec } from './kit';
import { stars as starField, tree } from './nature';
import { buildObstacle, buildProp } from './story';

type V2 = readonly [x: number, z: number];

export type Motion =
  | { kind: 'bob'; amp: number; speed: number }
  | { kind: 'spin'; speed: number }
  | { kind: 'flicker'; speed: number }
  | { kind: 'pulse'; amp: number; speed: number }
  /** Anda de `from` a `to` em `period` segundos e recomeça (some e aparece nas pontas). */
  | { kind: 'walk'; from: V2; to: V2; period: number; hop?: number }
  /** Vai e volta entre `from` e `to`, virando. */
  | { kind: 'patrol'; from: V2; to: V2; period: number }
  | { kind: 'orbit'; r: number; period: number; y: number }
  /** Sobe de `from` a `to` (altura) e recomeça: anjos na escada, fumaça, bolhas. */
  | { kind: 'rise'; from: number; to: number; period: number; shrink?: boolean }
  | { kind: 'sway'; amp: number; speed: number }
  /** Cresce de 0 ao tamanho e fica; recomeça a cada `period` (tijolos, plantas). */
  | { kind: 'grow'; period: number; at: number };

export interface Part {
  make: () => THREE.Object3D;
  /** Maior medida da peça depois de ajustada (unidades do mundo). */
  size: number;
  at: Vec;
  rotY?: number;
  motion?: Motion;
  /** Fração do ciclo em que esta peça começa (0..1). */
  phase?: number;
}

interface Anim {
  obj: THREE.Object3D;
  motion: Motion;
  phase: number;
  base: THREE.Vector3;
  scale: number;
  rotY: number;
}

/** Escala o objeto para que a maior medida seja `size`, apoiado no chão (y = 0). */
export function fit(o: THREE.Object3D, size: number): THREE.Object3D {
  const box = new THREE.Box3().setFromObject(o);
  const dims = box.getSize(new THREE.Vector3());
  const k = size / Math.max(dims.x, dims.y, dims.z, 1e-3);
  const holder = new THREE.Group();
  o.scale.multiplyScalar(k);
  o.position.y -= box.min.y * k;
  holder.add(o);
  return holder;
}

export function buildParts(parts: readonly Part[]): THREE.Group {
  const g = new THREE.Group();
  const anims: Anim[] = [];
  for (const p of parts) {
    const o = fit(p.make(), p.size);
    o.position.set(p.at[0], p.at[1], p.at[2]);
    o.rotation.y = p.rotY ?? 0;
    g.add(o);
    if (p.motion) anims.push({ obj: o, motion: p.motion, phase: p.phase ?? 0, base: o.position.clone(), scale: 1, rotY: p.rotY ?? 0 });
  }
  g.userData.anims = anims;
  return g;
}

const TAU = Math.PI * 2;
const frac = (x: number) => x - Math.floor(x);

/** Aplica os movimentos da cena no instante `t` (segundos). */
export function animate(g: THREE.Object3D, t: number): void {
  const anims = g.userData.anims as Anim[] | undefined;
  if (!anims) return;
  for (const a of anims) {
    const m = a.motion;
    const o = a.obj;
    switch (m.kind) {
      case 'bob':
        o.position.y = a.base.y + Math.sin((t + a.phase * 10) * m.speed) * m.amp;
        break;
      case 'spin':
        o.rotation.y = a.rotY + t * m.speed;
        break;
      case 'flicker':
        o.scale.set(1, 0.85 + 0.25 * Math.abs(Math.sin((t + a.phase * 3) * m.speed)), 1);
        break;
      case 'pulse':
        o.scale.setScalar(1 + Math.sin((t + a.phase * 5) * m.speed) * m.amp);
        break;
      case 'sway':
        o.rotation.z = Math.sin((t + a.phase * 4) * m.speed) * m.amp;
        break;
      case 'walk': {
        const u = frac(t / m.period + a.phase);
        o.position.set(m.from[0] + (m.to[0] - m.from[0]) * u, a.base.y + (m.hop ? Math.abs(Math.sin(u * TAU * 4)) * m.hop : 0), m.from[1] + (m.to[1] - m.from[1]) * u);
        o.rotation.y = -Math.atan2(m.to[1] - m.from[1], m.to[0] - m.from[0]);
        // Aparece e some nas pontas, para o recomeço não "pular".
        o.scale.setScalar(Math.min(1, u * 8, (1 - u) * 8));
        break;
      }
      case 'patrol': {
        const u = frac(t / m.period + a.phase);
        const k = u < 0.5 ? u * 2 : 2 - u * 2;
        const e = k * k * (3 - 2 * k);
        o.position.set(m.from[0] + (m.to[0] - m.from[0]) * e, a.base.y, m.from[1] + (m.to[1] - m.from[1]) * e);
        const dir = u < 0.5 ? 1 : -1;
        o.rotation.y = -Math.atan2((m.to[1] - m.from[1]) * dir, (m.to[0] - m.from[0]) * dir);
        break;
      }
      case 'orbit': {
        const ang = (t / m.period + a.phase) * TAU;
        o.position.set(a.base.x + Math.cos(ang) * m.r, m.y, a.base.z + Math.sin(ang) * m.r);
        o.rotation.y = -ang - Math.PI / 2;
        break;
      }
      case 'rise': {
        const u = frac(t / m.period + a.phase);
        o.position.y = m.from + (m.to - m.from) * u;
        o.scale.setScalar(m.shrink ? Math.max(0.05, 1 - u) : Math.min(1, u * 6, (1 - u) * 6));
        break;
      }
      case 'grow': {
        const u = frac(t / m.period + a.phase);
        const k = Math.min(1, Math.max(0, (u - m.at) / 0.08));
        o.scale.setScalar(Math.max(0.001, k * (u > 0.94 ? (1 - u) / 0.06 : 1)));
        break;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Peças pequenas
// ---------------------------------------------------------------------------

const ob = (id: ObstacleId) => () => buildObstacle(id);
const pr = (id: PropId, seed = 1) => () => buildProp(id, seed);

function sparkle(color = '#FFF3B0'): THREE.Object3D {
  return group({}, mesh(geo.ball(0.5, 1), glow(color)), mesh(geo.torus(0.75, 0.08, TAU, 16), glow(color, 0.6), { r: [Math.PI / 2, 0, 0], shadow: false }));
}

function hammer(): THREE.Object3D {
  return group({}, mesh(geo.box(0.12, 0.9, 0.12), mat(C.wood)), mesh(geo.box(0.5, 0.22, 0.24), mat('#6F6A66'), { p: [0, 0.5, 0] }));
}

function water(): THREE.Object3D {
  return mesh(geo.cyl(1, 1, 0.12, 18), mat(C.water, { smooth: true }));
}

function bubble(): THREE.Object3D {
  return mesh(geo.ball(0.4, 1), glow('#F4F0E6', 0.85));
}

function well(): THREE.Object3D {
  return group({}, mesh(geo.cyl(0.8, 0.9, 0.7, 12), mat(C.stone)), mesh(geo.cyl(0.62, 0.62, 0.05, 12), mat(C.water), { p: [0, 0.36, 0] }));
}

// ---------------------------------------------------------------------------
// As cenas de cada parashá
// ---------------------------------------------------------------------------

/** Bichos subindo em fila até um ponto (arca, poço…). */
function procession(ids: readonly ObstacleId[], from: V2, to: V2, period: number, size = 0.5): Part[] {
  return ids.map((id, i) => ({ make: ob(id), size, at: [from[0], 0, from[1]] as Vec, motion: { kind: 'walk', from, to, period } as Motion, phase: i / ids.length }));
}

const P = {
  ark: (): Part[] => [
    { make: pr('ark'), size: 2.1, at: [0.55, 0, -0.1] },
    ...procession(['lion', 'sheep', 'camel', 'cow', 'donkey', 'sheep'], [-1.7, 0.75], [-0.05, 0.05], 7),
    { make: hammer, size: 0.4, at: [1.5, 0.6, 0.55], motion: { kind: 'sway', amp: 0.7, speed: 6 } },
    { make: ob('bird'), size: 0.35, at: [0.55, 1.6, -0.1], motion: { kind: 'orbit', r: 0.9, period: 5, y: 1.7 } },
  ],
  stars: (): Part[] => [
    { make: pr('tents'), size: 1.6, at: [-0.5, 0, 0] },
    ...[0, 1, 2, 3, 4, 5, 6].map((k) => ({ make: () => sparkle(), size: 0.16, at: [-0.9 + k * 0.32, 1.6 + (k % 3) * 0.25, -0.4] as Vec, motion: { kind: 'pulse', amp: 0.5, speed: 3 } as Motion, phase: k / 7 })),
    { make: ob('camel'), size: 0.7, at: [1, 0, 0.3], motion: { kind: 'patrol', from: [0.6, 0.5], to: [1.5, 0.1], period: 7 } },
  ],
  akedah: (): Part[] => [
    { make: pr('mountain'), size: 1.9, at: [0, 0, -0.2] },
    { make: ob('fire'), size: 0.35, at: [0.05, 1.2, -0.2], motion: { kind: 'flicker', speed: 9 } },
    { make: ob('sheep'), size: 0.5, at: [1.1, 0, 0.4], motion: { kind: 'bob', amp: 0.05, speed: 5 } },
    { make: ob('thorns'), size: 0.45, at: [1.45, 0, 0.3] },
  ],
  well: (): Part[] => [
    { make: well, size: 0.8, at: [0.2, 0, 0] },
    ...procession(['camel', 'camel', 'camel'], [-1.7, 0.6], [-0.4, 0.1], 8, 0.7),
    { make: ob('jar'), size: 0.35, at: [0.9, 0, 0.3], motion: { kind: 'bob', amp: 0.08, speed: 4 } },
  ],
  stew: (): Part[] => [
    { make: ob('pot'), size: 0.7, at: [0, 0, 0] },
    { make: ob('fire'), size: 0.35, at: [0, 0, 0.05], motion: { kind: 'flicker', speed: 10 } },
    ...[0, 1, 2].map((k) => ({ make: bubble, size: 0.16, at: [0.1 * (k - 1), 0.7, 0] as Vec, motion: { kind: 'rise', from: 0.7, to: 1.6, period: 2.4, shrink: true } as Motion, phase: k / 3 })),
    { make: ob('sheep'), size: 0.5, at: [1.2, 0, 0.2], motion: { kind: 'patrol', from: [0.9, 0.4], to: [1.5, 0], period: 6 } },
  ],
  ladder: (): Part[] => [
    { make: pr('ladder'), size: 2.2, at: [0, 0, 0] },
    ...[0, 1, 2, 3].map((k) => ({ make: () => sparkle('#FFFFFF'), size: 0.2, at: [k % 2 ? 0.25 : -0.25, 0, 0.1] as Vec, motion: { kind: 'rise', from: k % 2 ? 2.1 : 0.2, to: k % 2 ? 0.2 : 2.1, period: 4 } as Motion, phase: k / 4 })),
    { make: ob('rock'), size: 0.45, at: [0.9, 0, 0.4] },
  ],
  sunrise: (): Part[] => [
    { make: pr('sun'), size: 0.7, at: [0, 0, -0.6], motion: { kind: 'rise', from: 0.1, to: 1.9, period: 8 } },
    ...procession(['sheep', 'sheep', 'sheep', 'cow'], [-1.6, 0.5], [1.6, 0.4], 9),
  ],
  dreams: (): Part[] => [
    ...[0, 1, 2, 3].map((k) => ({ make: ob('wheat'), size: 0.55, at: [-1 + k * 0.45, 0, -0.1] as Vec, motion: { kind: 'sway', amp: 0.35, speed: 2.4 } as Motion, phase: k / 4 })),
    { make: ob('wheat'), size: 0.7, at: [0.9, 0, 0.3], motion: { kind: 'bob', amp: 0.06, speed: 2 } },
    { make: ob('camel'), size: 0.6, at: [1.3, 0, -0.4] },
  ],
  cows: (): Part[] => [
    { make: pr('pyramids'), size: 1.6, at: [0.8, 0, -0.5] },
    ...procession(['cow', 'cow', 'cow', 'cow'], [-1.7, 0.5], [0.6, 0.6], 8, 0.5),
    { make: ob('wheat'), size: 0.5, at: [-0.9, 0, -0.4], motion: { kind: 'sway', amp: 0.3, speed: 2 } },
  ],
  wagons: (): Part[] => [
    { make: pr('pyramids'), size: 1.3, at: [-1.1, 0, -0.5] },
    { make: pr('tents'), size: 1.1, at: [1.2, 0, -0.4] },
    { make: ob('wagon'), size: 0.7, at: [0, 0, 0.3], motion: { kind: 'patrol', from: [-0.9, 0.4], to: [0.9, 0.3], period: 7 } },
    { make: ob('donkey'), size: 0.55, at: [0, 0, 0.3], motion: { kind: 'patrol', from: [-0.5, 0.45], to: [1.3, 0.35], period: 7 } },
  ],
  lion: (): Part[] => [
    { make: ob('lion'), size: 0.8, at: [0, 0, 0.1], motion: { kind: 'bob', amp: 0.04, speed: 3 } },
    ...Array.from({ length: 12 }, (_, k) => ({ make: () => sparkle(), size: 0.12, at: [Math.cos((k / 12) * TAU) * 1.1, 1.3 + Math.sin((k / 12) * TAU) * 0.35, -0.3] as Vec, motion: { kind: 'pulse', amp: 0.6, speed: 2.5 } as Motion, phase: k / 12 })),
  ],
  bush: (): Part[] => [
    { make: pr('bush-fire'), size: 1.2, at: [0, 0, 0], motion: { kind: 'flicker', speed: 7 } },
    { make: ob('sheep'), size: 0.45, at: [1.1, 0, 0.3], motion: { kind: 'patrol', from: [0.9, 0.5], to: [1.5, 0.1], period: 6 } },
    { make: ob('sheep'), size: 0.45, at: [-1.1, 0, 0.3], motion: { kind: 'patrol', from: [-1.5, 0.4], to: [-0.8, 0.1], period: 7 }, phase: 0.4 },
  ],
  frogs: (): Part[] => [
    { make: pr('pyramids'), size: 1.4, at: [0.9, 0, -0.5] },
    { make: water, size: 1.2, at: [-0.7, 0, 0], motion: { kind: 'pulse', amp: 0.04, speed: 2 } },
    ...[0, 1, 2, 3].map((k) => ({ make: ob('frog'), size: 0.3, at: [0, 0, 0] as Vec, motion: { kind: 'walk', from: [-0.7, 0.1], to: [1.2, 0.6 - k * 0.15], period: 5, hop: 0.25 } as Motion, phase: k / 4 })),
  ],
  darkness: (): Part[] => [
    { make: pr('moon'), size: 0.6, at: [0.6, 1.5, -0.4], motion: { kind: 'bob', amp: 0.1, speed: 1 } },
    { make: ob('darkness'), size: 0.9, at: [-0.7, 0.2, 0], motion: { kind: 'pulse', amp: 0.15, speed: 1.6 } },
    ...[0, 1, 2, 3, 4].map((k) => ({ make: ob('locust'), size: 0.25, at: [0, 0, 0] as Vec, motion: { kind: 'orbit', r: 0.9, period: 3 + k * 0.4, y: 0.8 + k * 0.12 } as Motion, phase: k / 5 })),
    { make: ob('sheep'), size: 0.45, at: [1.2, 0, 0.4] },
  ],
  sea: (): Part[] => [
    { make: pr('sea-walls'), size: 2.3, at: [0, 0, 0], motion: { kind: 'pulse', amp: 0.03, speed: 2.5 } },
    ...procession(['sheep', 'cow', 'donkey', 'sheep', 'camel'], [-1.3, 0.05], [1.3, 0.05], 8, 0.38),
    { make: pr('cloud-pillar'), size: 1.1, at: [1.6, 0, -0.5], motion: { kind: 'bob', amp: 0.1, speed: 1.5 } },
  ],
  sinai: (): Part[] => [
    { make: pr('mountain'), size: 2.1, at: [0, 0, -0.3] },
    { make: ob('cloud'), size: 0.9, at: [0, 1.5, -0.3], motion: { kind: 'bob', amp: 0.1, speed: 1.2 } },
    { make: ob('fire'), size: 0.35, at: [0.05, 1.25, -0.25], motion: { kind: 'flicker', speed: 11 } },
    { make: pr('tablets'), size: 0.7, at: [1.2, 0.1, 0.4], motion: { kind: 'bob', amp: 0.08, speed: 2 } },
  ],
  calf: (): Part[] => [
    { make: ob('calf'), size: 0.7, at: [-0.4, 0, 0.1], motion: { kind: 'spin', speed: 0.6 } },
    { make: pr('tablets'), size: 0.75, at: [0.9, 0.1, 0], motion: { kind: 'bob', amp: 0.08, speed: 2 } },
    { make: pr('mountain'), size: 1.4, at: [0.4, 0, -0.8] },
  ],
  mishkan: (): Part[] => [
    { make: pr('mishkan'), size: 1.8, at: [0, 0, -0.1] },
    { make: pr('cloud-pillar'), size: 1.1, at: [0, 1.0, -0.2], motion: { kind: 'bob', amp: 0.12, speed: 1.3 } },
    { make: ob('fire'), size: 0.3, at: [1.25, 0, 0.45], motion: { kind: 'flicker', speed: 9 } },
    { make: ob('jar'), size: 0.3, at: [-1.2, 0, 0.45], motion: { kind: 'bob', amp: 0.05, speed: 3 } },
  ],
  building: (): Part[] => [
    { make: pr('mishkan'), size: 1.5, at: [0.4, 0, -0.2] },
    ...procession(['planks', 'cloth', 'jar', 'planks'], [-1.7, 0.6], [-0.3, 0.2], 7, 0.4),
    { make: hammer, size: 0.35, at: [1.4, 0.5, 0.5], motion: { kind: 'sway', amp: 0.7, speed: 6 } },
  ],
  camp: (): Part[] => [
    { make: pr('tents'), size: 1.4, at: [0, 0, -0.2] },
    ...[0, 1, 2, 3].map((k) => ({ make: ob('banner'), size: 0.55, at: [-1.3 + k * 0.85, 0, 0.5] as Vec, motion: { kind: 'sway', amp: 0.12, speed: 3 } as Motion, phase: k / 4 })),
  ],
  grapes: (): Part[] => [
    { make: pr('city'), size: 1.5, at: [0.7, 0, -0.5] },
    { make: ob('grapes'), size: 0.55, at: [-0.5, 0, 0.3], motion: { kind: 'patrol', from: [-1.4, 0.4], to: [-0.1, 0.3], period: 6 } },
    { make: ob('grapes'), size: 0.55, at: [-0.5, 0, 0.3], motion: { kind: 'patrol', from: [-1.6, 0.0], to: [-0.3, -0.1], period: 6 }, phase: 0.3 },
  ],
  rock: (): Part[] => [
    { make: ob('rock'), size: 0.9, at: [0, 0, 0] },
    ...[0, 1, 2, 3].map((k) => ({ make: () => mesh(geo.ball(0.3, 1), glow(C.waterLight)), size: 0.14, at: [0.35, 0.5, 0.2] as Vec, motion: { kind: 'walk', from: [0.35, 0.2], to: [1.2, 0.6], period: 1.6, hop: 0.3 } as Motion, phase: k / 4 })),
    { make: ob('serpent'), size: 0.5, at: [-1.1, 0, 0.3], motion: { kind: 'bob', amp: 0.05, speed: 2 } },
  ],
  donkey: (): Part[] => [
    { make: ob('donkey'), size: 0.75, at: [0, 0, 0.2], motion: { kind: 'patrol', from: [-1.2, 0.3], to: [0.6, 0.3], period: 6 } },
    { make: () => sparkle('#FFFFFF'), size: 0.3, at: [1.2, 0.9, 0.1], motion: { kind: 'pulse', amp: 0.4, speed: 3 } },
    { make: pr('tents'), size: 1.1, at: [1.2, 0, -0.6] },
  ],
  harvest: (): Part[] => [
    ...[0, 1, 2, 3, 4].map((k) => ({ make: ob('wheat'), size: 0.5, at: [-1.2 + k * 0.45, 0, -0.2 + (k % 2) * 0.3] as Vec, motion: { kind: 'sway', amp: 0.3, speed: 2.2 } as Motion, phase: k / 5 })),
    { make: ob('basket'), size: 0.45, at: [1.2, 0, 0.3], motion: { kind: 'bob', amp: 0.06, speed: 3 } },
    { make: () => tree(4), size: 1.1, at: [1.3, 0, -0.5] },
  ],
  city: (): Part[] => [
    { make: pr('city', 3), size: 1.7, at: [0, 0, -0.2] },
    ...[0, 1, 2].map((k) => ({ make: ob('bird'), size: 0.3, at: [0, 0, -0.2] as Vec, motion: { kind: 'orbit', r: 1.1, period: 6 + k, y: 1.5 + k * 0.15 } as Motion, phase: k / 3 })),
  ],
  farewell: (): Part[] => [
    { make: pr('mountain'), size: 2, at: [0, 0, -0.3] },
    { make: ob('bird'), size: 0.3, at: [0, 0, -0.3], motion: { kind: 'orbit', r: 1.2, period: 7, y: 1.6 } },
    { make: ob('cloud'), size: 0.8, at: [-1, 1.4, -0.4], motion: { kind: 'patrol', from: [-1.4, -0.5], to: [1.2, -0.5], period: 14 } },
    { make: ob('banner'), size: 0.55, at: [1.2, 0, 0.5], motion: { kind: 'sway', amp: 0.15, speed: 3 } },
  ],
} satisfies Record<string, () => Part[]>;

export type VignetteKind = keyof typeof P;

/** A cena de cada parashá (contada no caminho que chega até ela). */
export const PARASHA_VIGNETTE: Readonly<Record<string, VignetteKind>> = {
  noach: 'ark',
  'lech-lecha': 'stars',
  vayera: 'akedah',
  'chayei-sarah': 'well',
  toldot: 'stew',
  vayetze: 'ladder',
  vayishlach: 'sunrise',
  vayeshev: 'dreams',
  miketz: 'cows',
  vayigash: 'wagons',
  vayechi: 'lion',
  shemot: 'bush',
  vaera: 'frogs',
  bo: 'darkness',
  beshalach: 'sea',
  yitro: 'sinai',
  mishpatim: 'sinai',
  terumah: 'building',
  tetzaveh: 'mishkan',
  'ki-tisa': 'calf',
  vayakhel: 'building',
  pekudei: 'mishkan',
  vayikra: 'mishkan',
  tzav: 'mishkan',
  shmini: 'mishkan',
  tazria: 'camp',
  metzora: 'city',
  'acharei-mot': 'mishkan',
  kedoshim: 'harvest',
  emor: 'harvest',
  behar: 'harvest',
  bechukotai: 'harvest',
  bamidbar: 'camp',
  nasso: 'camp',
  behaalotcha: 'mishkan',
  shlach: 'grapes',
  korach: 'mishkan',
  chukat: 'rock',
  balak: 'donkey',
  pinchas: 'camp',
  matot: 'city',
  masei: 'city',
  devarim: 'farewell',
  vaetchanan: 'sinai',
  eikev: 'harvest',
  reeh: 'harvest',
  shoftim: 'city',
  'ki-teitzei': 'city',
  'ki-tavo': 'harvest',
  nitzavim: 'farewell',
  vayeilech: 'farewell',
  haazinu: 'farewell',
  'vezot-haberachah': 'farewell',
};

/** A cena de uma parashá (null para Bereshit, que é contada pela Criação no topo do mapa). */
export function buildVignette(parashaId: string): THREE.Group | null {
  const kind = PARASHA_VIGNETTE[parashaId];
  if (!kind) return null;
  return stage(buildParts(P[kind]()), `vignette-${parashaId}`);
}

/** Escala das cenas no mapa e o "palco" de terra batida embaixo de cada uma. */
export const VIGNETTE_SCALE = 1.2;

function stage(scene: THREE.Group, name: string): THREE.Group {
  const patch = mesh(geo.cyl(1.55, 1.65, 0.08, 28), mat('#E2CC92'), { p: [0, 0.02, 0], shadow: false });
  patch.receiveShadow = true;
  const rim = mesh(geo.torus(1.6, 0.04, TAU, 40), mat('#C9AE6E'), { p: [0, 0.06, 0], r: [Math.PI / 2, 0, 0], shadow: false });
  const g = group({ s: VIGNETTE_SCALE }, patch, rim, scene);
  // Os movimentos ficam na cena de dentro (animate procura userData.anims no grupo dado).
  g.userData.anims = scene.userData.anims;
  g.name = name;
  return g;
}

export function buildVignetteOfKind(kind: VignetteKind): THREE.Group {
  return buildParts(P[kind]());
}

// ---------------------------------------------------------------------------
// A Criação (no topo do mapa, antes de Bereshit)
// ---------------------------------------------------------------------------

export const CREATION_PERIOD = 16;

export interface Creation {
  root: THREE.Group;
  /** Põe a cena no instante t (segundos); com `still`, mostra o fim (tudo criado). */
  update(t: number, still: boolean): void;
}

const smooth = (a: number, b: number, x: number) => {
  const k = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return k * k * (3 - 2 * k);
};

/**
 * O vazio sobre o mar, um disco escuro com estrelas; "haja luz" acende uma luz que vira o
 * sol; a terra sobe das águas, brotam as árvores; o sol e a lua passam a girar; vêm as aves
 * e, por fim, os bichos da terra. Recomeça a cada CREATION_PERIOD segundos.
 */
export function buildCreation(): Creation {
  const root = new THREE.Group();
  root.name = 'creation';
  const disc = mesh(geo.cyl(4.6, 4.9, 0.3, 40), mat('#151A4E', { smooth: true }), { p: [0, -0.55, 0], shadow: false });
  const rim = mesh(geo.torus(4.75, 0.06, TAU, 64), glow('#7C88FF', 0.8), { p: [0, -0.4, 0], r: [Math.PI / 2, 0, 0], shadow: false });
  const sky = starField(70, 9, 5, 21);
  sky.rotation.x = -Math.PI / 2;
  sky.position.set(0, -0.35, 0);
  root.add(disc, rim, sky);

  const light = group({ p: [0, 1.2, 0] }, mesh(geo.ball(0.55, 2), glow('#FFF7D6')), mesh(geo.ball(0.85, 2), glow('#FFE38A', 0.35)));
  const rays = new THREE.Group();
  for (let i = 0; i < 12; i++) {
    const ray = mesh(geo.box(0.06, 2.4, 0.06), glow('#FFF1B0', 0.7), { p: [0, 1.6, 0], shadow: false });
    rays.add(group({ r: [0, 0, (i / 12) * TAU] }, ray));
  }
  rays.rotation.x = -0.6;
  light.add(rays);

  const earth = group(
    { p: [0, -0.35, 0] },
    mesh(geo.cyl(1.7, 1.9, 0.5, 28), mat(C.water, { smooth: true }), { p: [0, 0.1, 0] }),
    mesh(geo.cyl(1.1, 1.3, 0.55, 18), mat('#7CCB5E'), { p: [0.25, 0.3, 0.05] }),
  );
  const trees = [0, 1, 2, 3].map((k) => {
    const t = fit(tree(k + 2), 0.75);
    const a = (k / 4) * TAU + 0.4;
    t.position.set(0.25 + Math.cos(a) * 0.65, 0.22, 0.05 + Math.sin(a) * 0.5);
    earth.add(t);
    return t;
  });
  const sunOrb = group({}, mesh(geo.ball(0.32, 2), glow('#FFD54A')), mesh(geo.ball(0.46, 2), glow('#FFE38A', 0.3)));
  const moonOrb = mesh(geo.ball(0.22, 2), mat('#E9ECF5', { smooth: true, emissive: '#C9D6FF', emissiveIntensity: 0.6 }));
  const birds = [0, 1, 2].map(() => fit(buildObstacle('bird'), 0.32));
  const fish = fit(buildObstacle('fish'), 0.35);
  const animals = (['sheep', 'lion', 'cow'] as const).map((id) => fit(buildObstacle(id), 0.42));
  root.add(light, earth, sunOrb, moonOrb, ...birds, fish, ...animals);

  const update = (time: number, still: boolean) => {
    const t = still ? CREATION_PERIOD - 0.5 : time % CREATION_PERIOD;
    // 1. Trevas; 2. "haja luz": a luz acende e se abre em raios; depois vira o sol.
    const flash = smooth(1.2, 2.2, t) * (1 - smooth(3.4, 4.6, t));
    light.visible = flash > 0.01;
    light.scale.setScalar(0.2 + flash * 1.4);
    rays.rotation.z = time * 0.6;
    rays.scale.setScalar(flash);
    // 3. A terra sobe das águas; as árvores brotam.
    const land = smooth(4, 5.2, t);
    earth.visible = land > 0.01;
    earth.scale.set(land, Math.max(0.01, land), land);
    trees.forEach((tr, k) => tr.scale.setScalar(Math.max(0.001, smooth(5.6 + k * 0.25, 6.4 + k * 0.25, t))));
    // 4. O sol e a lua começam a girar em volta.
    const lights = smooth(3.6, 4.6, t);
    const ang = time * 0.5;
    sunOrb.visible = lights > 0.01;
    moonOrb.visible = smooth(6.8, 7.6, t) > 0.01;
    sunOrb.scale.setScalar(lights);
    moonOrb.scale.setScalar(smooth(6.8, 7.6, t));
    sunOrb.position.set(Math.cos(ang) * 2.9, 1.7 + Math.sin(ang * 2) * 0.15, Math.sin(ang) * 1.6 - 0.4);
    moonOrb.position.set(Math.cos(ang + Math.PI) * 2.9, 1.5, Math.sin(ang + Math.PI) * 1.6 - 0.4);
    // 5. As aves e os peixes; 6. os bichos da terra.
    const fly = smooth(8.5, 9.3, t);
    birds.forEach((b, k) => {
      const a = time * 0.9 + (k / 3) * TAU;
      b.visible = fly > 0.01;
      b.scale.setScalar(fly);
      b.position.set(Math.cos(a) * (1.6 + k * 0.2), 1.25 + k * 0.15, Math.sin(a) * 1.1);
      b.rotation.y = -a - Math.PI / 2;
    });
    const swim = smooth(8.8, 9.6, t);
    fish.visible = swim > 0.01;
    fish.scale.setScalar(swim);
    const fa = -time * 0.7;
    fish.position.set(Math.cos(fa) * 1.55, -0.05 + Math.abs(Math.sin(time * 2.4)) * 0.18, Math.sin(fa) * 1.55);
    fish.rotation.y = -fa + Math.PI / 2;
    animals.forEach((an, k) => {
      const appear = smooth(10.5 + k * 0.6, 11.3 + k * 0.6, t);
      an.visible = appear > 0.01;
      an.scale.setScalar(appear);
      const a = (k / 3) * TAU + time * 0.25;
      an.position.set(0.25 + Math.cos(a) * 0.45, 0.4, 0.05 + Math.sin(a) * 0.32);
      an.rotation.y = -a - Math.PI / 2;
    });
  };
  update(0, false);
  return { root, update };
}
