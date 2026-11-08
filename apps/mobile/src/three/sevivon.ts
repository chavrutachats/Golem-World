/**
 * O sevivon em 3D: corpo octogonal de madeira envernizada, ponta embaixo, cabo com botão
 * de ouro. Os materiais têm brilho (Phong): o verniz e o ouro refletem a luz quente de
 * cima, e as faces parecem esmalte.
 * Cada uma das 8 faces tem a cor de um resultado do sevivon e a palavra em relevo
 * (תורה, נ״ך, משנה, תלמוד, הלכה, מדרש), a Coroa ou a moeda do Prêmio.
 *
 * O modelo fica com o centro do corpo na origem e o eixo em Y; quem o põe na mesa (altura
 * e orientação) é o componente, com as contas de lib/sevivon.ts. Tudo é montado com
 * primitivas e contornos, sem textura nem arquivo de modelo (mesmo código no celular e
 * na web).
 */
import { CATEGORIES, CATEGORY_IDS, CROWN_COLOR, PRIZE_COLOR, PRIZE_ON_COLOR, WHEEL_SLICES, type WheelSlice } from '@trivia/shared';
import * as THREE from 'three';
import { FACE_ANGLE, FACE_COUNT, INNER_RADIUS, SEVIVON } from '@/lib/sevivon';
import { C, geo, glow, group, mat, mesh } from './kit';
import { SEVIVON_GLYPHS } from './sevivon-glyphs';

const { radius: R, body: H, point: P, shoulder: S, handle: K, handleRadius, knobRadius } = SEVIVON;
/** Largura de cada face (entre duas quinas). */
export const FACE_WIDTH = 2 * R * Math.sin(Math.PI / FACE_COUNT);
const WOOD = '#A8743F';
const WOOD_DARK = '#6E4524';
const GOLD = '#E3B04A';
const VELVET = '#1E2766';

/** Materiais com brilho, só do sevivon e da mesa (o resto do jogo é barro fosco). */
const glossy = new Map<string, THREE.MeshPhongMaterial>();
function gloss(color: string, kind: 'wood' | 'gold' | 'enamel' | 'felt', emissive?: string, emissiveIntensity = 0): THREE.MeshPhongMaterial {
  const key = `${color}|${kind}|${emissive ?? ''}|${emissiveIntensity}`;
  let m = glossy.get(key);
  if (!m) {
    const look = {
      wood: { specular: '#3A2414', shininess: 38 },
      gold: { specular: '#FFE7A8', shininess: 90 },
      enamel: { specular: '#5A5A66', shininess: 60 },
      felt: { specular: '#000000', shininess: 2 },
    }[kind];
    m = new THREE.MeshPhongMaterial({
      color,
      specular: new THREE.Color(look.specular),
      shininess: look.shininess,
      flatShading: kind !== 'gold' && kind !== 'felt',
      ...(emissive ? { emissive: new THREE.Color(emissive), emissiveIntensity } : {}),
    });
    glossy.set(key, m);
  }
  return m;
}

export interface FaceStyle {
  panel: string;
  ink: string;
}

export function faceStyle(slice: WheelSlice): FaceStyle {
  if (slice === 'crown') return { panel: VELVET, ink: CROWN_COLOR };
  if (slice === 'prize') return { panel: PRIZE_COLOR, ink: PRIZE_ON_COLOR };
  const c = CATEGORIES[slice];
  return { panel: c.color, ink: c.onColor };
}

/** Prisma octogonal com as faces centradas em 0°, 45°, 90°… (quinas entre elas). */
function octo(rTop: number, rBottom: number, h: number): THREE.CylinderGeometry {
  return new THREE.CylinderGeometry(rTop, rBottom, h, FACE_COUNT, 1, false, -Math.PI / FACE_COUNT);
}

let shared: { body: THREE.BufferGeometry; point: THREE.BufferGeometry; roof: THREE.BufferGeometry; trim: THREE.BufferGeometry } | null = null;
function geometries() {
  shared ??= {
    body: octo(R, R, H),
    point: octo(R, 0.001, P),
    roof: octo(R * 0.42, R, S),
    trim: octo(R * 1.025, R * 1.025, 0.04),
  };
  return shared;
}

const wordGeometries = new Map<string, THREE.ExtrudeGeometry>();

/** Palavra hebraica em relevo, com o corpo da letra medindo `letter`. */
function wordGeometry(id: keyof typeof SEVIVON_GLYPHS, letter: number): THREE.ExtrudeGeometry {
  const key = `${id}|${letter.toFixed(3)}`;
  let g = wordGeometries.get(key);
  if (!g) {
    const shapes = SEVIVON_GLYPHS[id].shapes.map(([outer, ...holes]) => {
      const s = new THREE.Shape(pairs(outer!, letter));
      for (const h of holes) s.holes.push(new THREE.Path(pairs(h, letter)));
      return s;
    });
    g = new THREE.ExtrudeGeometry(shapes, { depth: 0.022, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.004, bevelSegments: 1, curveSegments: 1 });
    wordGeometries.set(key, g);
  }
  return g;
}

function pairs(flat: readonly number[], scale: number): THREE.Vector2[] {
  const out: THREE.Vector2[] = [];
  for (let i = 0; i < flat.length; i += 2) out.push(new THREE.Vector2(flat[i]! * scale, flat[i + 1]! * scale));
  return out;
}

/** Coroa em relevo (o mesmo desenho do selo da Coroa, em 32×32 com y para baixo). */
function crownEmblem(ink: THREE.Material): THREE.Group {
  const s = 0.0105;
  const pts: [number, number][] = [
    [5, 25],
    [3.5, 10.5],
    [10.5, 16],
    [16, 6.5],
    [21.5, 16],
    [28.5, 10.5],
    [27, 25],
  ];
  const shape = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2((x - 16) * s, (16 - y) * s)));
  const crown = mesh(geo.shape('sevivon-crown', () => shape, 0.03), ink, { p: [0, 0.02, 0.015], shadow: false });
  const band = mesh(geo.box(22 * s, 3 * s, 0.032), ink, { p: [0, (16 - 26.5) * s + 0.02, 0.016], shadow: false });
  const jewels = [
    [16, 5],
    [3.5, 9.5],
    [28.5, 9.5],
  ].map(([x, y]) => mesh(geo.ball(0.022, 1), ink, { p: [(x! - 16) * s, (16 - y!) * s + 0.02, 0.03], shadow: false }));
  return group({}, crown, band, ...jewels);
}

/** Moeda do Prêmio: aro dourado, miolo claro e a romã do shekel. */
function prizeEmblem(): THREE.Group {
  const rim = mesh(geo.cyl(0.155, 0.155, 0.03, 28), gloss(GOLD, 'gold'), { p: [0, 0, 0.015], r: [Math.PI / 2, 0, 0], shadow: false });
  const face = mesh(geo.cyl(0.125, 0.125, 0.034, 28), mat('#FFFDF7', { smooth: true }), { p: [0, 0, 0.018], r: [Math.PI / 2, 0, 0], shadow: false });
  const fruit = mesh(geo.ball(0.062, 2), mat('#C4283E', { smooth: true }), { p: [0, -0.012, 0.05], s: [1, 0.95, 0.55], shadow: false });
  const crownTip = mesh(geo.cone(0.026, 0.04, 6), mat('#9E1C30'), { p: [0, 0.058, 0.05], shadow: false });
  const leaf = mesh(geo.box(0.05, 0.016, 0.01), mat('#3F8F4A'), { p: [0.04, 0.062, 0.048], r: [0, 0, 0.5], shadow: false });
  return group({}, rim, face, fruit, crownTip, leaf);
}

export interface SevivonRig {
  root: THREE.Group;
  /** Material do painel de cada face (para a face sorteada brilhar). */
  panels: THREE.MeshPhongMaterial[];
}

export function buildSevivon(): SevivonRig {
  const g = geometries();
  const wood = gloss(WOOD, 'wood');
  const woodDark = gloss(WOOD_DARK, 'wood');
  const gold = gloss(GOLD, 'gold', '#5A3C00', 0.2);
  const root = new THREE.Group();
  root.name = 'sevivon';
  root.add(mesh(g.body, wood));
  const point = mesh(g.point, woodDark, { p: [0, -H / 2 - P / 2, 0] });
  root.add(point);
  root.add(mesh(g.roof, woodDark, { p: [0, H / 2 + S / 2, 0] }));
  root.add(mesh(g.trim, gold, { p: [0, H / 2 - 0.02, 0] }));
  root.add(mesh(g.trim, gold, { p: [0, -H / 2 + 0.02, 0] }));
  root.add(mesh(geo.cyl(handleRadius, handleRadius * 1.15, K, 12), wood, { p: [0, H / 2 + S + K / 2, 0] }));
  root.add(mesh(geo.ball(knobRadius, 3), gloss(GOLD, 'gold', '#5A3C00', 0.25), { p: [0, H / 2 + S + K + knobRadius * 0.6, 0] }));

  const panels: THREE.MeshPhongMaterial[] = [];
  const panelW = FACE_WIDTH * 0.82;
  const panelH = H * 0.8;
  const letter = Math.min(0.15, (panelW * 0.86) / Math.max(...CATEGORY_IDS.map((id) => SEVIVON_GLYPHS[id].w)));
  WHEEL_SLICES.forEach((slice, k) => {
    const style = faceStyle(slice);
    // Cada face tem o seu material (a sorteada brilha sozinha).
    const panelMat = new THREE.MeshPhongMaterial({
      color: style.panel,
      flatShading: true,
      specular: new THREE.Color('#5A5A66'),
      shininess: 60,
      emissive: new THREE.Color(style.panel),
      emissiveIntensity: 0.08,
    });
    panels.push(panelMat);
    const ink = slice === 'crown' || style.ink.toUpperCase() === CROWN_COLOR.toUpperCase() ? gloss(style.ink, 'gold', style.ink, 0.12) : gloss(style.ink, 'enamel', style.ink, 0.15);
    const face = new THREE.Group();
    face.add(mesh(geo.box(panelW, panelH, 0.02), panelMat, { shadow: false }));
    if (slice === 'crown') face.add(crownEmblem(ink));
    else if (slice === 'prize') face.add(prizeEmblem());
    else {
      const word = mesh(wordGeometry(slice, letter), ink, { p: [0, 0, 0.01], shadow: false });
      face.add(word);
      // Dois losangos dourados emolduram a palavra, como nos sevivonim pintados.
      for (const y of [panelH * 0.36, -panelH * 0.36]) face.add(mesh(geo.box(0.04, 0.04, 0.012), glow(style.ink, 0.9), { p: [0, y, 0.012], r: [0, 0, Math.PI / 4], shadow: false }));
    }
    // A face fica encostada no corpo, virada para fora.
    const a = k * FACE_ANGLE;
    face.position.set(Math.sin(a) * (INNER_RADIUS + 0.011), 0, Math.cos(a) * (INNER_RADIUS + 0.011));
    face.rotation.y = a;
    face.name = `face-${slice}`;
    root.add(face);
  });
  return { root, panels };
}

/**
 * A mesa redonda onde o sevivon gira: um tampo de nogueira envernizada inteiro à vista
 * (o fundo escuro aparece em volta), feltro azul-tekhelet no meio e um filete de ouro
 * entre os dois. Cabe o sevivon deitado em qualquer direção.
 */
export const TABLE_RADIUS = 1.55;
export function buildTable(felt = '#1F2866'): THREE.Group {
  const R0 = TABLE_RADIUS;
  const wood = mesh(geo.cyl(R0, R0 * 0.97, 0.16, 64), gloss('#4A2C18', 'wood'), { p: [0, -0.085, 0], shadow: false });
  wood.receiveShadow = true;
  const top = mesh(geo.cyl(R0 - 0.2, R0 - 0.2, 0.1, 64), gloss(felt, 'felt'), { p: [0, -0.045, 0], shadow: false });
  top.receiveShadow = true;
  const inlay = mesh(geo.torus(R0 - 0.18, 0.016, Math.PI * 2, 96), gloss(GOLD, 'gold'), { p: [0, 0.005, 0], r: [Math.PI / 2, 0, 0], shadow: false });
  // Halo atrás, bem fraco (discos sobrepostos fazem o degradê): dá profundidade ao fundo.
  const halo = group(
    { p: [0, 1.25, -3.4] },
    // Menor que o quadro da câmera: o degradê some antes da borda da tela.
    ...[2.2, 1.95, 1.7, 1.45, 1.2, 0.95, 0.7].map((r, i) => mesh(new THREE.CircleGeometry(r, 64), glow('#4352C4', 0.028), { p: [0, 0, i * 0.01], shadow: false })),
  );
  return group({}, wood, top, inlay, halo);
}

/** Chanukiá pequena com as velas da noite (1 a 8) e o shamash, para os dias de Chanucá. */
export function buildChanukiah(night: number): THREE.Group {
  const silver = new THREE.MeshPhongMaterial({ color: '#C9CED9', specular: new THREE.Color('#FFFFFF'), shininess: 80 });
  const parts: THREE.Object3D[] = [mesh(geo.cyl(0.05, 0.12, 0.5, 10), silver, { p: [0, 0.25, 0] }), mesh(geo.box(1.2, 0.05, 0.08), silver, { p: [0, 0.52, 0] })];
  const flame = (x: number, y: number) =>
    group({ p: [x, y, 0] }, mesh(geo.ball(0.035, 1), glow(C.fireCore), { s: [1, 1.6, 1], shadow: false }), mesh(geo.ball(0.022, 1), glow('#FFFFFF'), { p: [0, -0.01, 0.01], shadow: false }));
  // Do ponto de vista de quem acende: as velas entram da direita para a esquerda.
  for (let i = 0; i < 8; i++) {
    const x = 0.55 - i * (1.1 / 7) - (i >= 4 ? 0.0 : 0);
    parts.push(mesh(geo.cyl(0.022, 0.022, 0.16, 6), mat(i < night ? '#F7F1E1' : '#B9BDC8'), { p: [x, 0.62, 0] }));
    if (i < night) parts.push(flame(x, 0.74));
  }
  parts.push(mesh(geo.cyl(0.025, 0.025, 0.18, 6), mat('#F7F1E1'), { p: [0, 0.83, 0.04] }));
  parts.push(mesh(geo.box(0.06, 0.24, 0.06), silver, { p: [0, 0.66, 0.04] }));
  parts.push(flame(0, 0.96));
  return group({}, ...parts);
}
