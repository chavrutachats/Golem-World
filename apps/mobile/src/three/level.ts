/**
 * O cenário de uma fase em 3D, como um diorama visto de lado: céu em degradê, fundo
 * com as peças da parashá (andando devagar, em paralaxe), uma faixa de chão com a
 * borda de terra à mostra e enfeites que passam pelo Golem.
 *
 * `buildLevelEnvironment` só monta e reposiciona objetos do three, sem React: a cena
 * do app (LevelScene3D) chama `update` a cada quadro com a rolagem do diretor.
 */
import type { PropId, SceneStage } from '@trivia/shared';
import * as THREE from 'three';
import { C, geo, group, hashString, mat, mesh, seeded } from './kit';
import type { LightMood } from './lighting';
import { cloud, decor, moon, rainbow, skyBackdrop, stars, sun, type DecorKind } from './nature';
import { buildProp } from './story';

/** Posições fixas da fase (unidades do mundo; o Golem tem ~2 de altura). */
export const LEVEL = {
  golemX: -2.4,
  /** Onde o obstáculo para, na frente do Golem. */
  stopX: -0.6,
  /** De onde o obstáculo (ou a chegada) entra, fora da tela à direita. */
  spawnX: 6.2,
  /** Para onde o obstáculo vai depois do pulo. */
  passX: -5.2,
  /** Onde a chegada para, logo depois do Golem. */
  goalX: -0.4,
  camera: { fov: 34, position: [0, 2.15, 9.2] as const, lookAt: [0, 1.15, 0] as const },
} as const;

export const SKY_STOPS: Readonly<Record<SceneStage['sky'], readonly string[]>> = {
  day: ['#5FA8F0', '#9ED0FF', '#DDF0FF'],
  dawn: ['#6F7FD3', '#F2A3B5', '#FFE0B5'],
  dusk: ['#3F3683', '#DD7A7E', '#FFC48A'],
  night: ['#0B1033', '#1C2766', '#373C86'],
  gold: ['#F1BC48', '#FFE29C', '#FFF4D6'],
  desert: ['#5DA2E6', '#A9D2F2', '#F6E2B8'],
  storm: ['#35404F', '#5F6B7E', '#8F9BAD'],
  void: ['#04050C', '#0B0D28', '#17193F'],
};

export const SKY_MOOD: Readonly<Record<SceneStage['sky'], LightMood>> = {
  day: 'day',
  dawn: 'dawn',
  dusk: 'dusk',
  night: 'night',
  gold: 'gold',
  desert: 'day',
  storm: 'storm',
  void: 'void',
};

export const GROUND_COLORS: Readonly<Record<SceneStage['ground'], { top: string; side: string; speck: string }>> = {
  grass: { top: '#8BC46A', side: '#6E4A2E', speck: '#6FA853' },
  sand: { top: '#E8C88E', side: '#B98C55', speck: '#D4AE6E' },
  mud: { top: '#8E6A48', side: '#5E422A', speck: '#77583A' },
  water: { top: '#3C8FD8', side: '#2A5E9A', speck: '#7CC0F2' },
  stone: { top: '#C9C3B5', side: '#8E887C', speck: '#AFA898' },
  field: { top: '#D9C25A', side: '#7A5A32', speck: '#C4A944' },
};

const NEAR_DECOR: Readonly<Record<SceneStage['ground'], readonly DecorKind[]>> = {
  grass: ['flower', 'bush', 'flower', 'rock'],
  sand: ['rock', 'flower', 'rock'],
  mud: ['reeds', 'rock', 'reeds'],
  water: [],
  stone: ['rock', 'flower', 'rock'],
  field: ['flower', 'bush', 'flower'],
};

const MID_DECOR: Readonly<Record<SceneStage['ground'], readonly DecorKind[]>> = {
  grass: ['tree', 'bush', 'tree', 'cypress'],
  sand: ['palm', 'dune', 'rock', 'palm'],
  mud: ['reeds', 'tree', 'rock'],
  water: [],
  stone: ['cypress', 'rock', 'cypress'],
  field: ['tree', 'bush', 'tree'],
};

/** Peças que ficam no céu, sem paralaxe. */
const SKY_PROPS = new Set<PropId>(['sun', 'moon', 'rainbow', 'stars']);

interface WrapItem {
  obj: THREE.Object3D;
  base: number;
}

/** Faixa de objetos que andam com a rolagem e voltam pelo outro lado. */
class WrapLayer {
  readonly group = new THREE.Group();
  private readonly items: WrapItem[] = [];
  constructor(
    private readonly period: number,
    private readonly parallax: number,
  ) {}
  add(obj: THREE.Object3D, base: number): void {
    this.items.push({ obj, base });
    this.group.add(obj);
  }
  update(scroll: number): void {
    const shift = scroll * this.parallax;
    const half = this.period / 2;
    for (const it of this.items) {
      const x = ((((it.base - shift) % this.period) + this.period) % this.period) - half;
      it.obj.position.x = x;
    }
  }
}

export interface LevelEnvironment {
  root: THREE.Group;
  mood: LightMood;
  fog: THREE.Fog;
  background: THREE.Color;
  update(scroll: number, timeSec: number): void;
}

export function buildLevelEnvironment(stage: SceneStage, seedText = ''): LevelEnvironment {
  const seed = hashString(`${seedText}|${stage.sky}|${stage.ground}|${stage.props.join(',')}`);
  const r = seeded(seed);
  const stops = SKY_STOPS[stage.sky];
  const root = new THREE.Group();
  const horizon = new THREE.Color(stops[stops.length - 1]!);

  // Céu.
  const sky = skyBackdrop(stops, 120, 46);
  sky.position.set(0, 14, -40);
  root.add(sky);
  const dark = stage.sky === 'night' || stage.sky === 'void';
  if (dark || stage.props.includes('stars')) {
    const s = stars(stage.sky === 'void' ? 40 : 90, 70, 20, seed);
    s.position.set(0, 4, -38);
    root.add(s);
  }
  if (stage.props.includes('sun')) root.add(place(sun(), [5.5, 6.2, -30], 1.4));
  if (stage.props.includes('moon')) root.add(place(moon(), [5.8, 6.4, -30], 1.3));
  if (stage.props.includes('rainbow')) root.add(place(rainbow(), [0, 0.5, -30], 3.2));

  const clouds = new WrapLayer(60, 0.08);
  if (!dark && stage.sky !== 'gold') {
    const color = stage.sky === 'storm' ? '#7D8799' : '#FFFFFF';
    for (let i = 0; i < 6; i++) {
      const c = cloud(seed + i, color);
      c.position.set(0, 5.5 + r() * 3.5, -24 - r() * 6);
      c.scale.setScalar(1.6 + r() * 1.2);
      clouds.add(c, i * 10 + r() * 4);
    }
  }
  root.add(clouds.group);

  // Fundo: as peças da parashá, em paralaxe lenta.
  const far = new WrapLayer(34, 0.22);
  const story = stage.props.filter((p) => !SKY_PROPS.has(p) && p !== 'sea-walls');
  story.forEach((p, i) => {
    const o = buildProp(p, seed + i);
    o.position.set(0, -0.2, -11 - (i % 2) * 3);
    o.scale.setScalar(1.25);
    far.add(o, i * (34 / Math.max(1, story.length)) + 4);
  });
  // Morros no horizonte para o fundo nunca ficar vazio.
  const hillColor = stage.ground === 'sand' ? C.sandDark : stage.ground === 'stone' ? '#B9B2A2' : stage.ground === 'water' ? '#6FA0C8' : '#79B05C';
  for (let i = 0; i < 5; i++) {
    const h = mesh(geo.sphere(4 + r() * 3, 10, 5, Math.PI / 2), mat(hillColor), { p: [0, -0.4, -22 - r() * 4], s: [1.6, 0.35 + r() * 0.25, 1], shadow: false });
    far.add(h, i * 7 + r() * 3);
  }
  root.add(far.group);

  if (stage.props.includes('sea-walls')) {
    // Kriat Yam Suf: as águas em pé dos dois lados do caminho.
    for (const z of [-3.2, 3.6]) {
      const wall = mesh(geo.box(40, z < 0 ? 4.5 : 1.2, 1.4), mat(C.water, { opacity: z < 0 ? 0.9 : 0.6 }), { p: [0, z < 0 ? 2.1 : 0.5, z], shadow: false });
      root.add(wall);
      root.add(mesh(geo.box(40, 0.18, 1.45), mat(C.waterLight), { p: [0, z < 0 ? 4.4 : 1.15, z], shadow: false }));
    }
  }

  // Meio: árvores, palmeiras e pedras, um pouco mais rápidas.
  const mid = new WrapLayer(26, 0.55);
  const midKinds = MID_DECOR[stage.ground];
  for (let i = 0; i < (midKinds.length ? 7 : 0); i++) {
    const o = decor(midKinds[i % midKinds.length]!, seed + 10 + i);
    o.position.set(0, -0.1, -4 - r() * 3);
    o.scale.setScalar(1 + r() * 0.4);
    mid.add(o, i * (26 / 7) + r() * 1.5);
  }
  root.add(mid.group);

  // Chão: a faixa do diorama, com a terra à mostra na frente.
  const g = GROUND_COLORS[stage.ground];
  const ground = group(
    {},
    mesh(geo.box(60, 0.5, 9), mat(g.top), { p: [0, -0.25, -1.8], shadow: false }),
    mesh(geo.box(60, 1.6, 0.6), mat(g.side), { p: [0, -1.05, 2.4], shadow: false }),
  );
  (ground.children[0] as THREE.Mesh).receiveShadow = true;
  root.add(ground);

  // Perto: florzinhas, pedrinhas e manchas do chão passando pelo Golem.
  const near = new WrapLayer(16, 1);
  const nearKinds = NEAR_DECOR[stage.ground];
  for (let i = 0; i < 14; i++) {
    const speck = mesh(geo.box(0.5 + r() * 0.6, 0.02, 0.18 + r() * 0.2), mat(g.speck), { p: [0, 0.011, -0.6 + r() * 2.6], shadow: false });
    near.add(speck, i * (16 / 14) + r() * 0.6);
  }
  nearKinds.forEach((k, i) => {
    const o = decor(k, seed + 30 + i);
    o.position.set(0, 0, 1.2 + r() * 0.8);
    o.scale.setScalar(0.7);
    near.add(o, i * (16 / Math.max(1, nearKinds.length)) + 2);
  });
  if (stage.ground === 'water') {
    for (let i = 0; i < 10; i++) {
      const foam = mesh(geo.box(0.6, 0.03, 0.08), mat('#E8F6FF'), { p: [0, 0.02, -0.8 + r() * 2.6], shadow: false });
      near.add(foam, i * 1.6);
    }
  }
  root.add(near.group);

  const layers = [clouds, far, mid, near];
  return {
    root,
    mood: SKY_MOOD[stage.sky],
    fog: new THREE.Fog(horizon, 16, 46),
    background: horizon,
    update(scroll: number) {
      for (const l of layers) l.update(scroll);
    },
  };
}

function place<T extends THREE.Object3D>(o: T, p: readonly [number, number, number], s: number): T {
  o.position.set(p[0], p[1], p[2]);
  o.scale.setScalar(s);
  return o;
}
