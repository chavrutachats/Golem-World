/**
 * Os episódios da Torá em 3D: os obstáculos de cada fase (a serpente, os sapos, o
 * bezerro de ouro…), as peças do fundo (a arca, a torre de Bavel, o Mishkan…) e as
 * casas de estudo do fim de cada livro.
 *
 * Bichos saem de um mesmo molde de quadrúpede com proporções e detalhes próprios;
 * os obstáculos são simpáticos (olhinhos), nunca assustadores: é um jogo de estudo.
 */
import type { ObstacleId, PropId } from '@trivia/shared';
import * as THREE from 'three';
import { C, geo, glow, group, mat, mesh, seeded, type Vec } from './kit';
import { cloud, moon, mountain, palm, rainbow, sun, tent, tree } from './nature';

// ---------------------------------------------------------------------------
// Moldes
// ---------------------------------------------------------------------------

function eyesAt(p: Vec, gap: number, r = 0.07): THREE.Group {
  const ink = mat(C.ink, { smooth: true });
  const shine = glow('#FFFFFF');
  const eye = (x: number) =>
    group({ p: [x, 0, 0] }, mesh(geo.ball(r, 1), ink), mesh(geo.ball(r * 0.32, 0), shine, { p: [r * 0.3, r * 0.4, r * 0.65], shadow: false }));
  return group({ p }, eye(gap / 2), eye(-gap / 2));
}

interface QuadOptions {
  color: string;
  dark?: string;
  /** Comprimento, altura e largura do corpo. */
  body: Vec;
  leg?: number;
  neck?: number;
  head?: Vec;
  extra?: (parts: THREE.Object3D[], o: { headPos: Vec }) => void;
}

/** Quadrúpede de perfil, olhando para a câmera (vaca, camelo, burro, ovelha, leão). */
function quadruped(o: QuadOptions): THREE.Group {
  const m = mat(o.color);
  const dark = mat(o.dark ?? o.color);
  const [L, H, W] = o.body;
  const leg = o.leg ?? 0.45;
  const parts: THREE.Object3D[] = [mesh(geo.rbox(L, H, W, Math.min(H, W) * 0.3), m, { p: [0, leg + H / 2, 0] })];
  for (const x of [L / 2 - 0.15, -L / 2 + 0.15]) {
    for (const z of [W / 2 - 0.1, -W / 2 + 0.1]) parts.push(mesh(geo.rbox(0.16, leg + 0.06, 0.16, 0.05), dark, { p: [x, leg / 2, z] }));
  }
  const [hl, hh, hw] = o.head ?? [0.42, 0.36, 0.36];
  const neck = o.neck ?? 0.15;
  const headPos: Vec = [L / 2 + hl * 0.25, leg + H + neck, 0.05];
  parts.push(mesh(geo.rbox(hl, hh, hw, 0.1), m, { p: headPos }));
  parts.push(eyesAt([headPos[0] + 0.02, headPos[1] + 0.06, headPos[2] + hw / 2], hw * 0.55, 0.05));
  parts.push(mesh(geo.rbox(0.12, 0.3, 0.12, 0.04), dark, { p: [-L / 2 - 0.04, leg + H * 0.6, 0], r: [0, 0, 0.6] })); // rabo
  o.extra?.(parts, { headPos });
  return group({ r: [0, 0.35, 0] }, ...parts);
}

function flames(scale = 1): THREE.Group {
  const outer = glow(C.fire);
  const inner = glow(C.fireCore);
  return group(
    { s: scale },
    mesh(geo.cone(0.42, 1.1, 6), outer, { p: [0, 0.55, 0], shadow: false, name: 'flame' }),
    mesh(geo.cone(0.28, 0.8, 6), outer, { p: [0.3, 0.4, 0.05], shadow: false }),
    mesh(geo.cone(0.25, 0.7, 6), outer, { p: [-0.28, 0.35, 0.02], shadow: false }),
    mesh(geo.cone(0.22, 0.6, 6), inner, { p: [0, 0.32, 0.18], shadow: false }),
  );
}

// ---------------------------------------------------------------------------
// Obstáculos
// ---------------------------------------------------------------------------

const OBSTACLES: Readonly<Record<ObstacleId, () => THREE.Group>> = {
  rock: () =>
    group(
      {},
      mesh(geo.dodeca(0.62), mat(C.stone), { p: [0, 0.5, 0], s: [1.2, 0.9, 1] }),
      mesh(geo.dodeca(0.3), mat(C.stoneDark), { p: [0.6, 0.22, 0.2] }),
      // Água saindo da pedra (Bamidbar 20).
      mesh(geo.capsule(0.08, 0.4, 5), glow(C.waterLight, 0.8), { p: [0.15, 0.62, 0.62], r: [1.2, 0, 0], shadow: false }),
    ),
  serpent: () => {
    const body = mat('#5EA850');
    const parts: THREE.Object3D[] = [];
    for (let i = 0; i < 9; i++) {
      const t = i / 8;
      parts.push(mesh(geo.ball(0.2 - t * 0.06, 1), i % 2 ? body : mat('#7CC26C'), { p: [Math.sin(t * 6) * 0.35 - 0.2, 0.18 + t * 1.0, Math.cos(t * 6) * 0.2] }));
    }
    parts.push(mesh(geo.rbox(0.38, 0.26, 0.34, 0.1), body, { p: [-0.1, 1.32, 0.1] }));
    parts.push(eyesAt([-0.08, 1.4, 0.28], 0.18, 0.055));
    parts.push(mesh(geo.box(0.04, 0.02, 0.18), glow('#D9465F'), { p: [-0.08, 1.24, 0.34], shadow: false }));
    // O fruto da árvore.
    parts.push(mesh(geo.ball(0.13, 1), mat(C.red), { p: [0.42, 0.95, 0.15] }));
    return group({}, ...parts);
  },
  thorns: () => {
    const r = seeded(11);
    const parts: THREE.Object3D[] = [mesh(geo.ball(0.5, 1), mat('#6E7D3A'), { p: [0, 0.45, 0], s: [1.3, 0.9, 1] })];
    for (let i = 0; i < 14; i++) {
      const a = r() * Math.PI * 2;
      const b = r() * 1.2;
      parts.push(mesh(geo.cone(0.05, 0.3, 4), mat('#C9B98A'), { p: [Math.cos(a) * 0.55 * Math.cos(b), 0.45 + Math.sin(b) * 0.42, Math.sin(a) * 0.45], r: [Math.sin(a), 0, -Math.cos(a) * 1.2] }));
    }
    return group({}, ...parts);
  },
  tree: () => {
    const t = tree(5);
    for (const p of [[0.3, 1.7, 0.4], [-0.35, 1.9, 0.3], [0.05, 2.15, 0.45]] as const) t.add(mesh(geo.ball(0.1, 1), mat(C.red), { p }));
    return t;
  },
  darkness: () =>
    group(
      {},
      mesh(geo.ball(0.62, 1), mat('#2A2550'), { p: [0, 0.75, 0] }),
      mesh(geo.ball(0.42, 1), mat('#352F63'), { p: [0.5, 0.5, 0.1] }),
      mesh(geo.ball(0.4, 1), mat('#231F45'), { p: [-0.5, 0.48, 0.05] }),
      eyesAt([0, 0.82, 0.58], 0.26, 0.07),
    ),
  wave: () => {
    const water = mat(C.water);
    const foam = mat(C.white);
    return group(
      {},
      mesh(geo.torus(0.6, 0.32, Math.PI * 1.1, 14), water, { p: [0, 0.6, 0], r: [0, 0, -0.2] }),
      mesh(geo.ball(0.22, 1), foam, { p: [-0.55, 1.05, 0.05] }),
      mesh(geo.ball(0.16, 1), foam, { p: [-0.3, 1.2, 0.1] }),
      mesh(geo.box(1.6, 0.25, 0.8), water, { p: [0, 0.12, 0] }),
    );
  },
  fish: () => {
    const body = mat('#F2A23C');
    return group(
      { p: [0, 0.6, 0] },
      mesh(geo.ball(0.45, 1), body, { s: [1.3, 0.85, 0.6] }),
      mesh(geo.cone(0.3, 0.45, 4), body, { p: [-0.68, 0, 0], r: [0, 0, Math.PI / 2] }),
      eyesAt([0.32, 0.1, 0.24], 0.0, 0.07),
      mesh(geo.box(0.6, 0.2, 0.05), glow(C.waterLight, 0.6), { p: [0, -0.55, 0], shadow: false }),
    );
  },
  frog: () => {
    const g = mat('#5FB04B');
    return group(
      {},
      mesh(geo.ball(0.45, 1), g, { p: [0, 0.4, 0], s: [1.2, 0.85, 1] }),
      mesh(geo.ball(0.17, 1), g, { p: [0.2, 0.78, 0.18] }),
      mesh(geo.ball(0.17, 1), g, { p: [-0.2, 0.78, 0.18] }),
      eyesAt([0, 0.82, 0.32], 0.4, 0.07),
      mesh(geo.torus(0.14, 0.025, Math.PI, 10), mat(C.ink), { p: [0, 0.48, 0.48], r: [0, 0, Math.PI] }),
      mesh(geo.ball(0.16, 1), g, { p: [0.42, 0.12, 0.2], s: [1.3, 0.5, 1] }),
      mesh(geo.ball(0.16, 1), g, { p: [-0.42, 0.12, 0.2], s: [1.3, 0.5, 1] }),
    );
  },
  locust: () => {
    const g = mat('#9DB54A');
    return group(
      { p: [0, 0.5, 0] },
      mesh(geo.capsule(0.16, 0.6, 6), g, { r: [0, 0, Math.PI / 2] }),
      mesh(geo.ball(0.2, 1), g, { p: [0.45, 0.06, 0] }),
      eyesAt([0.52, 0.12, 0.14], 0.18, 0.05),
      mesh(geo.box(0.7, 0.03, 0.3), mat('#D8E6A8', { opacity: 0.85 }), { p: [-0.1, 0.22, 0], r: [0, 0, 0.25] }),
      mesh(geo.box(0.06, 0.5, 0.06), g, { p: [-0.2, -0.2, 0.15], r: [0, 0, 0.7] }),
      mesh(geo.box(0.06, 0.5, 0.06), g, { p: [-0.2, -0.2, -0.15], r: [0, 0, 0.7] }),
    );
  },
  scorpion: () => {
    const g = mat('#B5743A');
    const parts: THREE.Object3D[] = [mesh(geo.rbox(0.7, 0.24, 0.42, 0.1), g, { p: [0, 0.22, 0] }), eyesAt([0.36, 0.32, 0.12], 0.14, 0.045)];
    for (let i = 0; i < 4; i++) parts.push(mesh(geo.ball(0.13 - i * 0.015, 0), g, { p: [-0.42 - i * 0.12, 0.35 + i * 0.2, 0] }));
    parts.push(mesh(geo.cone(0.07, 0.2, 4), mat(C.ink), { p: [-0.65, 1.12, 0], r: [0, 0, -2.2] }));
    for (const z of [0.25, -0.25]) parts.push(mesh(geo.rbox(0.3, 0.1, 0.16, 0.04), g, { p: [0.52, 0.2, z] }));
    return group({}, ...parts);
  },
  bird: () =>
    group(
      { p: [0, 1.0, 0] },
      mesh(geo.ball(0.32, 1), mat(C.white), { s: [1.3, 0.9, 0.9] }),
      mesh(geo.ball(0.2, 1), mat(C.white), { p: [0.34, 0.2, 0] }),
      mesh(geo.cone(0.06, 0.18, 4), mat(C.gold), { p: [0.55, 0.18, 0], r: [0, 0, -Math.PI / 2] }),
      eyesAt([0.42, 0.26, 0.14], 0.0, 0.04),
      mesh(geo.box(0.5, 0.05, 0.6), mat('#E9EEF5'), { p: [-0.05, 0.12, 0], r: [0.3, 0, 0], name: 'wing' }),
      // O ramo de oliveira.
      mesh(geo.box(0.22, 0.04, 0.08), mat(C.leaf), { p: [0.62, 0.12, 0.05], r: [0, 0, -0.3] }),
    ),
  cow: () =>
    quadruped({
      color: '#F4EFE6',
      dark: '#5B4636',
      body: [1.3, 0.6, 0.6],
      extra: (p, { headPos }) => {
        p.push(mesh(geo.ball(0.16, 0), mat('#5B4636'), { p: [0.1, 1.02, 0.3] }));
        p.push(mesh(geo.ball(0.14, 0), mat('#5B4636'), { p: [-0.35, 0.9, 0.3] }));
        p.push(mesh(geo.cone(0.05, 0.16, 4), mat(C.cream), { p: [headPos[0], headPos[1] + 0.24, 0.15] }));
        p.push(mesh(geo.cone(0.05, 0.16, 4), mat(C.cream), { p: [headPos[0], headPos[1] + 0.24, -0.08] }));
      },
    }),
  calf: () =>
    quadruped({
      color: C.gold,
      dark: C.goldDeep,
      body: [1.1, 0.5, 0.5],
      leg: 0.32,
      extra: (p, { headPos }) => {
        p.push(mesh(geo.cone(0.05, 0.18, 4), mat(C.goldDeep), { p: [headPos[0], headPos[1] + 0.24, 0.14] }));
        p.push(mesh(geo.cone(0.05, 0.18, 4), mat(C.goldDeep), { p: [headPos[0], headPos[1] + 0.24, -0.06] }));
        p.push(mesh(geo.rbox(1.4, 0.2, 0.8, 0.06), mat(C.stone), { p: [0, 0.0, 0] })); // pedestal
      },
    }),
  camel: () =>
    quadruped({
      color: '#D6A867',
      dark: '#B98848',
      body: [1.2, 0.5, 0.5],
      leg: 0.7,
      neck: 0.55,
      head: [0.45, 0.28, 0.3],
      extra: (p, { headPos }) => {
        p.push(mesh(geo.sphere(0.36, 10, 5, Math.PI / 2), mat('#D6A867'), { p: [-0.1, 1.2, 0] }));
        p.push(mesh(geo.rbox(0.2, 0.6, 0.22, 0.06), mat('#D6A867'), { p: [0.55, 1.42, 0.05], r: [0, 0, -0.3] }));
        p.push(mesh(geo.box(0.7, 0.08, 0.56), mat('#B5373C'), { p: [-0.05, 1.22, 0] }));
        void headPos;
      },
    }),
  donkey: () =>
    quadruped({
      color: '#9A9187',
      dark: '#6E665E',
      body: [1.1, 0.5, 0.5],
      leg: 0.5,
      extra: (p, { headPos }) => {
        p.push(mesh(geo.capsule(0.05, 0.26, 4), mat('#9A9187'), { p: [headPos[0] - 0.08, headPos[1] + 0.32, 0.12], r: [0, 0, 0.2] }));
        p.push(mesh(geo.capsule(0.05, 0.26, 4), mat('#9A9187'), { p: [headPos[0] - 0.08, headPos[1] + 0.32, -0.06], r: [0, 0, 0.2] }));
        p.push(mesh(geo.box(0.5, 0.06, 0.52), mat('#B5373C'), { p: [0, 1.02, 0] }));
      },
    }),
  sheep: () =>
    quadruped({
      color: '#FAF7F0',
      dark: '#3E3530',
      body: [0.95, 0.55, 0.6],
      leg: 0.32,
      head: [0.32, 0.3, 0.3],
      extra: (p) => {
        const r = seeded(3);
        for (let i = 0; i < 8; i++) p.push(mesh(geo.ball(0.2, 1), mat('#FFFFFF'), { p: [(r() - 0.5) * 0.8, 0.85 + r() * 0.15, (r() - 0.5) * 0.4] }));
      },
    }),
  lion: () =>
    quadruped({
      color: '#E2A947',
      dark: '#C98A2E',
      body: [1.2, 0.55, 0.55],
      leg: 0.45,
      extra: (p, { headPos }) => {
        p.push(mesh(geo.ball(0.36, 1), mat('#A8612A'), { p: [headPos[0] - 0.08, headPos[1], headPos[2] - 0.05] }));
      },
    }),
  grapes: () => {
    // O cacho de Eshcol, carregado numa vara (Bamidbar 13:23).
    const r = seeded(9);
    const parts: THREE.Object3D[] = [
      mesh(geo.cyl(0.045, 0.045, 1.8, 6), mat(C.woodDark), { p: [0, 1.25, 0], r: [0, 0, Math.PI / 2] }),
      mesh(geo.cyl(0.04, 0.05, 1.25, 5), mat(C.wood), { p: [0.82, 0.62, 0] }),
      mesh(geo.cyl(0.04, 0.05, 1.25, 5), mat(C.wood), { p: [-0.82, 0.62, 0] }),
    ];
    for (let i = 0; i < 22; i++) {
      const row = i / 22;
      const spread = 0.42 * (1 - row * 0.7);
      parts.push(mesh(geo.ball(0.13, 1), mat(i % 3 ? '#7A3E9A' : '#8E52B0'), { p: [(r() - 0.5) * spread * 2, 1.08 - row * 0.85, (r() - 0.5) * spread] }));
    }
    parts.push(mesh(geo.box(0.36, 0.04, 0.24), mat(C.leaf), { p: [0.12, 1.18, 0.05], r: [0, 0, 0.2] }));
    return group({}, ...parts);
  },
  jar: () =>
    group(
      {},
      mesh(geo.sphere(0.42, 10, 8), mat(C.clayLight), { p: [0, 0.48, 0], s: [1, 1.1, 1] }),
      mesh(geo.cyl(0.16, 0.22, 0.3, 8), mat(C.clayLight), { p: [0, 1.0, 0] }),
      mesh(geo.torus(0.17, 0.04, Math.PI * 2, 12), mat(C.clayDark), { p: [0, 1.16, 0], r: [Math.PI / 2, 0, 0] }),
      mesh(geo.disc(0.15, 12), glow(C.waterLight), { p: [0, 1.16, 0], r: [-Math.PI / 2, 0, 0], shadow: false }),
    ),
  pot: () =>
    group(
      {},
      mesh(geo.cyl(0.5, 0.4, 0.55, 10), mat('#4E4A4E'), { p: [0, 0.48, 0] }),
      mesh(geo.disc(0.46, 14), mat('#B5373C'), { p: [0, 0.76, 0], r: [-Math.PI / 2, 0, 0], shadow: false }),
      flames(0.5).translateY(-0.05),
      mesh(geo.ball(0.08, 0), glow('#FFFFFF', 0.7), { p: [0.1, 0.95, 0.1], shadow: false }),
      mesh(geo.ball(0.06, 0), glow('#FFFFFF', 0.6), { p: [-0.12, 1.1, 0.05], shadow: false }),
    ),
  fire: () => flames(1),
  pit: () =>
    group(
      {},
      mesh(geo.cyl(0.7, 0.7, 0.3, 10), mat(C.stone), { p: [0, 0.15, 0] }),
      mesh(geo.cyl(0.52, 0.52, 0.31, 10), mat('#2B2420'), { p: [0, 0.16, 0] }),
    ),
  planks: () => {
    const parts: THREE.Object3D[] = [];
    for (let i = 0; i < 5; i++) parts.push(mesh(geo.box(1.4, 0.16, 0.36), mat(i % 2 ? C.wood : C.woodDark), { p: [0, 0.08 + i * 0.17, (i % 2) * 0.05], r: [0, (i % 2 ? 0.08 : -0.06), 0] }));
    return group({}, ...parts);
  },
  bricks: () => {
    const parts: THREE.Object3D[] = [];
    for (let row = 0; row < 4; row++) {
      for (let i = 0; i < 4 - row; i++) {
        parts.push(mesh(geo.rbox(0.42, 0.22, 0.3, 0.03), mat(row % 2 ? '#C9774B' : '#B7653E'), { p: [(i - (3 - row) / 2) * 0.44, 0.11 + row * 0.23, 0] }));
      }
    }
    return group({}, ...parts);
  },
  wheat: () => {
    const parts: THREE.Object3D[] = [];
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      parts.push(mesh(geo.cyl(0.025, 0.025, 1.2, 4), mat('#D9B54A'), { p: [Math.cos(a) * 0.12, 0.6, Math.sin(a) * 0.12], r: [Math.sin(a) * 0.2, 0, Math.cos(a) * 0.2] }));
      parts.push(mesh(geo.capsule(0.06, 0.22, 4), mat('#E8C55A'), { p: [Math.cos(a) * 0.26, 1.25, Math.sin(a) * 0.26] }));
    }
    parts.push(mesh(geo.torus(0.16, 0.05, Math.PI * 2, 10), mat('#B58E2E'), { p: [0, 0.55, 0], r: [Math.PI / 2, 0, 0] }));
    return group({}, ...parts);
  },
  basket: () =>
    group(
      {},
      mesh(geo.rbox(1.1, 0.35, 0.55, 0.12), mat('#B9884C'), { p: [0, 0.26, 0] }),
      mesh(geo.rbox(1.0, 0.1, 0.45, 0.04), mat(C.cream), { p: [0, 0.44, 0] }),
      mesh(geo.box(1.8, 0.08, 1.2), glow(C.water, 0.85), { p: [0, 0.04, 0], shadow: false }),
      ...[-0.8, -0.65, 0.7, 0.85].map((x, i) => mesh(geo.cyl(0.02, 0.02, 0.9 + (i % 2) * 0.3, 4), mat(C.leaf), { p: [x, 0.45, -0.4] })),
    ),
  wagon: () =>
    group(
      {},
      mesh(geo.box(1.4, 0.35, 0.7), mat(C.wood), { p: [0, 0.6, 0] }),
      mesh(geo.cyl(0.32, 0.32, 0.08, 10), mat(C.woodDark), { p: [0.45, 0.32, 0.38], r: [Math.PI / 2, 0, 0] }),
      mesh(geo.cyl(0.32, 0.32, 0.08, 10), mat(C.woodDark), { p: [-0.45, 0.32, 0.38], r: [Math.PI / 2, 0, 0] }),
      mesh(geo.ball(0.2, 1), mat(C.gold), { p: [0.2, 0.85, 0] }),
      mesh(geo.ball(0.18, 1), mat('#E8C55A'), { p: [-0.2, 0.85, 0.1] }),
    ),
  cloth: () => {
    const stripes = ['#D64545', '#F2B630', '#3E7BD6', '#5E9E4B', '#8A6BD8'];
    return group(
      { p: [0, 0.1, 0] },
      mesh(geo.cyl(0.04, 0.04, 1.4, 5), mat(C.woodDark), { p: [0.55, 0.7, 0] }),
      mesh(geo.box(1.0, 0.06, 0.06), mat(C.woodDark), { p: [0.1, 1.38, 0] }),
      ...stripes.map((c, i) => mesh(geo.box(0.16, 0.95, 0.04), mat(c), { p: [-0.25 + i * 0.16, 0.88, 0] })),
    );
  },
  cloud: () => {
    const c = cloud(4, '#B9C3D6');
    c.scale.setScalar(0.65);
    c.position.y = 0.6;
    return c;
  },
  banner: () =>
    group(
      {},
      mesh(geo.cyl(0.04, 0.04, 2.0, 5), mat(C.woodDark), { p: [0, 1.0, 0] }),
      mesh(geo.box(0.8, 0.55, 0.03), mat('#3E7BD6'), { p: [0.42, 1.65, 0] }),
      mesh(geo.ball(0.12, 0), mat(C.gold), { p: [0.42, 1.65, 0.03] }),
      mesh(geo.ball(0.06, 0), mat(C.gold), { p: [0, 2.04, 0] }),
    ),
};

export function buildObstacle(id: ObstacleId): THREE.Group {
  const g = (OBSTACLES[id] ?? OBSTACLES.rock)();
  g.name = `obstacle:${id}`;
  return g;
}

export const OBSTACLE_IDS = Object.keys(OBSTACLES) as ObstacleId[];

// ---------------------------------------------------------------------------
// Peças da história (fundo das fases e chegada)
// ---------------------------------------------------------------------------

function ark(): THREE.Group {
  return group(
    {},
    mesh(geo.rbox(4.2, 1.1, 1.6, 0.3), mat(C.woodDark), { p: [0, 0.75, 0] }),
    mesh(geo.box(2.4, 0.9, 1.2), mat(C.wood), { p: [0, 1.7, 0] }),
    mesh(geo.cone(1.3, 0.6, 4), mat('#8E5A34'), { p: [0, 2.45, 0], r: [0, Math.PI / 4, 0], s: [1.45, 1, 0.75] }),
    mesh(geo.box(0.3, 0.3, 0.02), mat(C.ink), { p: [0.6, 1.75, 0.61], shadow: false }),
    mesh(geo.box(0.3, 0.3, 0.02), mat(C.ink), { p: [-0.6, 1.75, 0.61], shadow: false }),
  );
}

function tower(): THREE.Group {
  const parts: THREE.Object3D[] = [];
  for (let i = 0; i < 6; i++) parts.push(mesh(geo.cyl(1.4 - i * 0.2, 1.5 - i * 0.2, 0.75, 10), mat(i % 2 ? '#C9774B' : '#B7653E'), { p: [0, 0.37 + i * 0.75, 0] }));
  return group({}, ...parts);
}

function city(seed = 2): THREE.Group {
  const r = seeded(seed);
  const parts: THREE.Object3D[] = [];
  for (let i = 0; i < 6; i++) {
    const h = 0.8 + r() * 1.4;
    parts.push(mesh(geo.box(0.9, h, 0.9), mat(i % 2 ? '#E8D2A8' : '#D9BE8C'), { p: [(i - 2.5) * 0.95, h / 2, (r() - 0.5) * 0.6] }));
    if (r() > 0.5) parts.push(mesh(geo.sphere(0.36, 10, 5, Math.PI / 2), mat('#EFE1C4'), { p: [(i - 2.5) * 0.95, h, 0] }));
  }
  parts.push(mesh(geo.box(6, 0.6, 0.3), mat('#CDB083'), { p: [0, 0.3, 0.7] }));
  return group({}, ...parts);
}

function mishkan(): THREE.Group {
  const parts: THREE.Object3D[] = [
    mesh(geo.box(3.4, 1.3, 1.6), mat(C.gold, { emissive: C.goldDeep, emissiveIntensity: 0.15 }), { p: [0, 0.65, 0] }),
    mesh(geo.box(3.5, 0.1, 1.7), mat('#6C2C7A'), { p: [0, 1.36, 0] }),
    mesh(geo.box(1.0, 1.0, 0.04), mat('#3E5FB0'), { p: [0, 0.55, 0.81], shadow: false }),
  ];
  // O pátio com os panos de linho.
  for (const x of [-2.6, 2.6]) parts.push(mesh(geo.box(0.06, 0.9, 2.6), mat(C.linen), { p: [x, 0.45, 0] }));
  parts.push(cloud(8, '#FFFFFF').translateY(2.6).translateZ(-0.2));
  return group({}, ...parts);
}

function ladder(): THREE.Group {
  const parts: THREE.Object3D[] = [
    mesh(geo.box(0.1, 6, 0.1), mat(C.wood), { p: [0.5, 3, 0] }),
    mesh(geo.box(0.1, 6, 0.1), mat(C.wood), { p: [-0.5, 3, 0] }),
  ];
  for (let i = 0; i < 12; i++) parts.push(mesh(geo.box(1.0, 0.07, 0.07), mat(C.woodDark), { p: [0, 0.3 + i * 0.5, 0] }));
  parts.push(cloud(5, '#FFF6D8').translateY(6).translateX(0.2));
  return group({ r: [0, 0, -0.2] }, ...parts);
}

function cloudPillar(): THREE.Group {
  const parts: THREE.Object3D[] = [];
  for (let i = 0; i < 8; i++) parts.push(mesh(geo.ball(0.7 - (i % 2) * 0.12, 1), mat('#F2F4F8'), { p: [Math.sin(i) * 0.2, 0.6 + i * 0.75, 0], shadow: false }));
  return group({}, ...parts);
}

function candles(): THREE.Group {
  const candle = (x: number) =>
    group(
      { p: [x, 0, 0] },
      mesh(geo.cyl(0.14, 0.18, 0.12, 8), mat(C.goldDeep), { p: [0, 0.06, 0] }),
      mesh(geo.cyl(0.08, 0.08, 0.7, 8), mat(C.cream), { p: [0, 0.47, 0] }),
      mesh(geo.cone(0.07, 0.2, 6), glow(C.fireCore), { p: [0, 0.92, 0], shadow: false, name: 'flame' }),
    );
  return group({}, mesh(geo.rbox(1.3, 0.12, 0.6, 0.04), mat(C.white), {}), candle(0.3), candle(-0.3));
}

function bushFire(): THREE.Group {
  const b = new THREE.Group();
  b.add(mesh(geo.ball(0.6, 1), mat(C.leafDark), { p: [0, 0.5, 0] }));
  b.add(flames(0.9).translateY(0.5));
  return b;
}

function tablets(): THREE.Group {
  const stone = mat('#C9C3B5');
  const line = mat('#6E6A62');
  const tab = (x: number) => {
    const lines = [0, 1, 2, 3].map((i) => mesh(geo.box(0.32, 0.03, 0.02), line, { p: [0, 0.45 - i * 0.16, 0.08], shadow: false }));
    return group(
      { p: [x, 0.65, 0] },
      mesh(geo.box(0.5, 1.1, 0.14), stone, {}),
      mesh(geo.cyl(0.25, 0.25, 0.14, 12), stone, { p: [0, 0.55, 0], r: [Math.PI / 2, 0, 0] }),
      ...lines,
    );
  };
  return group({}, tab(0.28), tab(-0.28), mountain(3, '#8C7E74', false).translateZ(-2).translateY(-0.2));
}

function signpost(color: string = C.gold): THREE.Group {
  return group(
    {},
    mesh(geo.cyl(0.06, 0.07, 1.6, 6), mat(C.woodDark), { p: [0, 0.8, 0] }),
    mesh(geo.rbox(0.9, 0.36, 0.08, 0.04), mat(C.wood), { p: [0.3, 1.35, 0] }),
    mesh(geo.cone(0.18, 0.2, 3), mat(C.wood), { p: [0.82, 1.35, 0], r: [0, 0, -Math.PI / 2] }),
    mesh(geo.rbox(0.3, 0.2, 0.04, 0.03), mat(color), { p: [0.3, 1.35, 0.05] }),
  );
}

export function goalFlag(color: string = C.gold): THREE.Group {
  return group(
    {},
    mesh(geo.cyl(0.04, 0.04, 2.0, 6), mat('#E9E2D0'), { p: [0, 1.0, 0] }),
    mesh(geo.box(0.7, 0.45, 0.03), mat(color), { p: [0.36, 1.7, 0], name: 'cloth' }),
    mesh(geo.ball(0.08, 1), mat(C.gold), { p: [0, 2.05, 0] }),
  );
}

export function buildProp(id: PropId, seed = 1): THREE.Group {
  switch (id) {
    case 'ark':
      return ark();
    case 'tower':
      return tower();
    case 'city':
      return city(seed);
    case 'mishkan':
      return mishkan();
    case 'ladder':
      return ladder();
    case 'cloud-pillar':
      return cloudPillar();
    case 'candles':
      return candles();
    case 'bush-fire':
      return bushFire();
    case 'tablets':
      return tablets();
    case 'rainbow':
      return rainbow();
    case 'sun':
      return sun();
    case 'moon':
      return moon();
    case 'palms':
      return group({}, palm(seed), palm(seed + 3).translateX(1.4).translateZ(-0.6));
    case 'trees':
      return group({}, tree(seed), tree(seed + 2).translateX(1.5).translateZ(-0.5));
    case 'tents':
      return group({}, tent(seed), tent(seed + 1).translateX(1.6).translateZ(-0.4), tent(seed + 2).translateX(-1.4).translateZ(-0.7));
    case 'hills':
      return group({}, mesh(geo.sphere(2.4, 10, 5, Math.PI / 2), mat(C.leafLight), { s: [1.4, 0.55, 1] }));
    case 'mountain':
      return mountain(seed);
    case 'pyramids':
      return group({}, mesh(geo.cone(2, 2.2, 4), mat(C.sandDark), { p: [0, 1.1, 0], r: [0, Math.PI / 4, 0] }), mesh(geo.cone(1.3, 1.4, 4), mat(C.sand), { p: [2.4, 0.7, -0.6], r: [0, Math.PI / 4, 0] }));
    case 'stars':
    case 'sea-walls':
      return new THREE.Group();
  }
}

// ---------------------------------------------------------------------------
// Casas de estudo (fim de cada livro) e chegadas
// ---------------------------------------------------------------------------

export type BeitMidrashStyle = 'yeshiva' | 'tent' | 'beit-midrash' | 'desert-yeshiva' | 'synagogue';

function scaled<T extends THREE.Object3D>(o: T, s: number): T {
  o.scale.setScalar(s);
  return o;
}

/** Janelas acesas: lá dentro alguém estuda. */
function litWindow(p: Vec, w = 0.28, h = 0.4): THREE.Mesh {
  return mesh(geo.rbox(w, h, 0.04, 0.06), mat('#FFE7A0', { emissive: '#FFC94A', emissiveIntensity: 0.8 }), { p, shadow: false });
}

function books(p: Vec): THREE.Group {
  const colors = [C.red, C.velvet, C.leafDark, C.goldDeep, '#6B4A9A'];
  return group({ p }, ...colors.map((c, i) => mesh(geo.box(0.12, 0.42 - (i % 2) * 0.06, 0.3), mat(c), { p: [(i - 2) * 0.13, 0.21, 0] })));
}

export function buildBeitMidrash(style: BeitMidrashStyle): THREE.Group {
  const stone = mat('#E7D7B8');
  const stoneDark = mat('#CDB792');
  const roof = mat('#B05A3C');
  const door = mat('#6B4426');
  switch (style) {
    case 'yeshiva':
      return group(
        {},
        mesh(geo.box(3, 2, 2), stone, { p: [0, 1, 0] }),
        mesh(geo.cone(2.3, 1.2, 4), roof, { p: [0, 2.6, 0], r: [0, Math.PI / 4, 0], s: [1, 1, 0.75] }),
        mesh(geo.rbox(0.7, 1.2, 0.06, 0.3), door, { p: [0, 0.6, 1.01] }),
        litWindow([0.95, 1.3, 1.01]),
        litWindow([-0.95, 1.3, 1.01]),
        books([0.95, 0.0, 1.3]),
      );
    case 'tent':
      return group(
        {},
        mesh(geo.box(3.2, 1.7, 1.8), mat('#6E3F7E'), { p: [0, 0.85, 0] }),
        mesh(geo.box(3.3, 0.2, 1.9), mat('#3E5FB0'), { p: [0, 1.75, 0] }),
        mesh(geo.box(1.0, 1.3, 0.04), mat(C.linen), { p: [0, 0.65, 0.91] }),
        scaled(cloudPillar(), 0.55).translateY(1.9),
        ...[-1.8, 1.8].map((x) => mesh(geo.cyl(0.05, 0.05, 1.8, 6), mat(C.gold), { p: [x, 0.9, 0.95] })),
      );
    case 'beit-midrash':
      return group(
        {},
        mesh(geo.box(3.4, 2.2, 2), stone, { p: [0, 1.1, 0] }),
        mesh(geo.sphere(1, 12, 6, Math.PI / 2), mat(C.gold), { p: [0, 2.2, 0] }),
        mesh(geo.rbox(0.8, 1.3, 0.06, 0.35), door, { p: [0, 0.65, 1.01] }),
        litWindow([1.1, 1.4, 1.01]),
        litWindow([-1.1, 1.4, 1.01]),
        mesh(geo.box(3.6, 0.15, 2.2), stoneDark, { p: [0, 0.07, 0] }),
      );
    case 'desert-yeshiva':
      return group(
        {},
        scaled(tent(4, '#E2C9A3'), 1.8),
        tent(5, '#C9A27A').translateX(1.8).translateZ(-0.6),
        tent(6, '#B9875E').translateX(-1.8).translateZ(-0.6),
        litWindow([0, 0.35, 0.65], 0.3, 0.35),
        mesh(geo.cyl(0.04, 0.04, 2.6, 5), mat(C.woodDark), { p: [0.9, 1.3, 0.6] }),
        mesh(geo.box(0.6, 0.4, 0.03), mat('#3E7BD6'), { p: [1.22, 2.35, 0.6] }),
      );
    case 'synagogue': {
      const star = new THREE.Shape();
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + Math.PI / 2;
        const p = [Math.cos(a) * 0.32, Math.sin(a) * 0.32];
        if (i === 0) star.moveTo(p[0]!, p[1]!);
        else star.lineTo(p[0]!, p[1]!);
      }
      const star2 = new THREE.Shape();
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
        const p = [Math.cos(a) * 0.32, Math.sin(a) * 0.32];
        if (i === 0) star2.moveTo(p[0]!, p[1]!);
        else star2.lineTo(p[0]!, p[1]!);
      }
      const blue = mat('#3E7BD6', { emissive: '#3E7BD6', emissiveIntensity: 0.3 });
      return group(
        {},
        mesh(geo.box(3.6, 2.4, 2.2), stone, { p: [0, 1.2, 0] }),
        mesh(geo.box(3.8, 0.25, 2.4), stoneDark, { p: [0, 2.5, 0] }),
        mesh(geo.rbox(1, 1.5, 0.06, 0.45), door, { p: [0, 0.75, 1.11] }),
        mesh(geo.shape('magen-a', () => star, 0.05), blue, { p: [0, 1.85, 1.12] }),
        mesh(geo.shape('magen-b', () => star2, 0.05), blue, { p: [0, 1.85, 1.13] }),
        litWindow([1.25, 1.4, 1.11]),
        litWindow([-1.25, 1.4, 1.11]),
        ...[-1.6, 1.6].map((x) => goalFlag(C.techelet).translateX(x).translateZ(1.4)),
      );
    }
  }
}

export type GoalModel = { kind: 'prop'; prop: PropId } | { kind: 'signpost'; color: string } | { kind: 'beitMidrash'; style: BeitMidrashStyle } | { kind: 'flag' };

export function buildGoal(goal: GoalModel): THREE.Group {
  switch (goal.kind) {
    case 'prop':
      return buildProp(goal.prop, 3);
    case 'signpost':
      return signpost(goal.color);
    case 'beitMidrash':
      return buildBeitMidrash(goal.style);
    case 'flag':
      return goalFlag();
  }
}

/** Para enfeitar o céu de uma fase. */
export { cloud, moon, rainbow, sun };
