/**
 * O Golem em 3D: barro facetado, olhos grandes e as letras אמת (verdade) na testa,
 * como na lenda. Montado com primitivas; os itens vestidos vão nos pontos de encaixe
 * (cabeça, rosto, corpo, mão direita e companhia ao lado).
 *
 * `buildGolem` devolve as peças com nome para animar; `poseGolem` aplica a pose
 * (parado, andando, pulando, tropeçando, comemorando) a cada quadro.
 *
 * Fase 9: o material (espaço "skin") muda a cor do barro, e o personagem (espaço
 * "costume") veste uma fantasia por cima de cabeça, corpo e mão (costumes.ts).
 */
import { COSTUME_HIDES, itemById, type GolemLook } from '@trivia/shared';
import * as THREE from 'three';
import { darker, dressCostume } from './costumes';
import { C, geo, glow, group, mat, mesh, type Vec } from './kit';

export type GolemPose = 'idle' | 'walk' | 'jump' | 'hurt' | 'cheer';

export interface GolemRig {
  root: THREE.Group;
  /** Tronco + cabeça (balança ao andar e respirar). */
  body: THREE.Group;
  head: THREE.Group;
  eyes: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  legL: THREE.Group;
  legR: THREE.Group;
  companion: GolemRig | null;
}

/** Altura do Golem (pés no chão em y = 0). */
export const GOLEM_HEIGHT = 2.05;

// ---------------------------------------------------------------------------
// As letras da testa
// ---------------------------------------------------------------------------

/** Traço de letra no espaço da letra (0..1 de largura, 0..1.2 de altura). */
type Stroke = readonly [x: number, y: number, w: number, h: number, rot?: number];

const LETTERS: Readonly<Record<'alef' | 'mem' | 'tav', readonly Stroke[]>> = {
  // ת: barra de cima, perna direita, perna esquerda com o pezinho para fora.
  tav: [
    [0.5, 1.1, 1, 0.2],
    [0.88, 0.5, 0.2, 1.0],
    [0.22, 0.5, 0.2, 1.0],
    [0.08, 0.06, 0.2, 0.14],
  ],
  // מ: aberta embaixo à esquerda.
  mem: [
    [0.5, 1.1, 1, 0.2],
    [0.88, 0.55, 0.2, 1.1],
    [0.12, 0.65, 0.2, 0.75],
    [0.62, 0.08, 0.6, 0.18],
  ],
  // א: diagonal com o braço de cima à direita e a perna de baixo à esquerda.
  alef: [
    [0.5, 0.6, 0.22, 1.35, 0.72],
    [0.82, 0.95, 0.18, 0.45, -0.25],
    [0.2, 0.25, 0.18, 0.5, -0.25],
  ],
};

function letter(strokes: readonly Stroke[], size: number, m: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  for (const [x, y, w, h, rot] of strokes) {
    const piece = mesh(geo.box(w * size, h * size, size * 0.18), m, { p: [(x - 0.5) * size, (y - 0.6) * size, 0], r: [0, 0, rot ?? 0] });
    piece.castShadow = false;
    g.add(piece);
  }
  return g;
}

/** אמת da direita para a esquerda, como se lê em hebraico. */
function emet(size: number): THREE.Group {
  const m = mat(C.gold, { emissive: C.gold, emissiveIntensity: 0.75 });
  const gap = size * 1.3;
  const word = new THREE.Group();
  word.add(letter(LETTERS.alef, size, m).translateX(gap));
  word.add(letter(LETTERS.mem, size, m));
  word.add(letter(LETTERS.tav, size, m).translateX(-gap));
  word.name = 'emet';
  return word;
}

// ---------------------------------------------------------------------------
// Itens
// ---------------------------------------------------------------------------

function kippah(color: string, rim?: string): THREE.Object3D {
  const cap = mesh(geo.sphere(0.4, 16, 6, Math.PI * 0.3), mat(color), { p: [0, -0.24, 0] });
  const parts: THREE.Object3D[] = [cap];
  if (rim) parts.push(mesh(geo.torus(0.325, 0.022, Math.PI * 2, 22), mat(rim, { smooth: true }), { p: [0, -0.06, 0], r: [Math.PI / 2, 0, 0] }));
  return group({ p: [0.04, 0.06, 0.02], r: [0.12, 0, 0.1] }, ...parts);
}

function glasses(): THREE.Object3D {
  const frame = mat('#3B2A20', { smooth: true });
  const lens = mat('#DDF1FF', { smooth: true, opacity: 0.35 });
  return group(
    { p: [0, 0.02, 0.05] },
    mesh(geo.torus(0.105, 0.018, Math.PI * 2, 18), frame, { p: [0.2, 0, 0] }),
    mesh(geo.torus(0.105, 0.018, Math.PI * 2, 18), frame, { p: [-0.2, 0, 0] }),
    mesh(geo.disc(0.1, 16), lens, { p: [0.2, 0, 0.005], shadow: false }),
    mesh(geo.disc(0.1, 16), lens, { p: [-0.2, 0, 0.005], shadow: false }),
    mesh(geo.box(0.1, 0.022, 0.022), frame, { p: [0, 0.02, 0] }),
  );
}

function magnifier(): THREE.Object3D {
  return group(
    { p: [0.24, -0.02, 0.1], r: [0, 0, -0.5] },
    mesh(geo.torus(0.15, 0.03, Math.PI * 2, 20), mat(C.gold, { smooth: true }), {}),
    mesh(geo.disc(0.14, 18), mat('#CFEAFF', { smooth: true, opacity: 0.4 }), { p: [0, 0, 0.01], shadow: false }),
    mesh(geo.cyl(0.03, 0.03, 0.28, 6), mat(C.woodDark), { p: [0, -0.3, 0] }),
  );
}

function tzitzit(): THREE.Object3D {
  const cloth = mat(C.white);
  const stripe = mat(C.techelet);
  const parts: THREE.Object3D[] = [
    mesh(geo.rbox(0.98, 0.62, 0.74, 0.12), cloth, { p: [0, 0.04, 0] }),
    mesh(geo.box(0.99, 0.06, 0.75), stripe, { p: [0, -0.12, 0] }),
  ];
  for (const x of [-0.42, 0.42]) {
    for (const z of [0.3, -0.3]) {
      parts.push(mesh(geo.cyl(0.012, 0.012, 0.32, 4), cloth, { p: [x, -0.42, z], shadow: false }));
      parts.push(mesh(geo.cyl(0.012, 0.012, 0.3, 4), stripe, { p: [x + 0.03, -0.41, z], shadow: false }));
    }
  }
  return group({}, ...parts);
}

function bookBag(): THREE.Object3D {
  return group(
    { p: [0, 0, -0.42] },
    mesh(geo.rbox(0.62, 0.62, 0.26, 0.08), mat('#6B4A9A'), {}),
    mesh(geo.rbox(0.5, 0.2, 0.06, 0.04), mat('#8C69BD'), { p: [0, -0.12, 0.14] }),
    mesh(geo.box(0.08, 0.7, 0.04), mat('#4E3473'), { p: [0.24, 0.2, 0.4] }),
    mesh(geo.box(0.08, 0.7, 0.04), mat('#4E3473'), { p: [-0.24, 0.2, 0.4] }),
    // Os livros aparecendo por cima.
    mesh(geo.box(0.16, 0.22, 0.12), mat(C.red), { p: [-0.12, 0.36, 0] }),
    mesh(geo.box(0.14, 0.18, 0.12), mat(C.techelet), { p: [0.08, 0.34, 0] }),
  );
}

function lamp(): THREE.Object3D {
  return group(
    { p: [0, -0.05, 0.14] },
    mesh(geo.sphere(0.13, 10, 6, Math.PI * 0.55), mat(C.clayLight), { r: [Math.PI, 0, 0], s: [1.4, 0.8, 1] }),
    mesh(geo.cyl(0.03, 0.05, 0.12, 6), mat(C.clayLight), { p: [0.2, 0.0, 0], r: [0, 0, -1.2] }),
    mesh(geo.cone(0.05, 0.16, 6), glow(C.fireCore), { p: [0.27, 0.12, 0], name: 'flame', shadow: false }),
  );
}

function quill(): THREE.Object3D {
  const feather = new THREE.Shape();
  feather.moveTo(0, 0);
  feather.quadraticCurveTo(0.12, 0.25, 0.04, 0.62);
  feather.quadraticCurveTo(-0.08, 0.3, 0, 0);
  return group(
    { p: [0.02, 0.04, 0.12], r: [0, 0, -0.35] },
    mesh(geo.shape('quill', () => feather, 0.02), mat(C.cream), { p: [0, 0.05, 0] }),
    mesh(geo.cyl(0.012, 0.008, 0.72, 4), mat('#8C7B62'), { p: [0.02, 0.28, 0.012] }),
  );
}

function shofar(): THREE.Object3D {
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0.18, 0.12, 0.05),
    new THREE.Vector3(0.36, 0.36, 0),
    new THREE.Vector3(0.38, 0.62, -0.05),
  ]);
  const horn = mat('#D9B98A');
  const parts: THREE.Object3D[] = [];
  const n = 9;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const pt = curve.getPoint(t);
    parts.push(mesh(geo.ball(0.035 + t * 0.07, 0), i === n - 1 ? mat('#B28E5C') : horn, { p: [pt.x, pt.y, pt.z] }));
  }
  return group({ p: [-0.05, -0.05, 0.12], r: [0, 0.3, 0] }, ...parts);
}

function flag(): THREE.Object3D {
  return group(
    { p: [0, -0.05, 0.12] },
    mesh(geo.cyl(0.022, 0.022, 1.0, 6), mat(C.woodDark), { p: [0, 0.4, 0] }),
    mesh(geo.box(0.46, 0.32, 0.02), mat(C.white), { p: [0.25, 0.72, 0], name: 'cloth' }),
    mesh(geo.box(0.46, 0.05, 0.025), mat(C.techelet), { p: [0.25, 0.83, 0] }),
    mesh(geo.box(0.46, 0.05, 0.025), mat(C.techelet), { p: [0.25, 0.61, 0] }),
    // A Torá desenhada na bandeira: dois rolos.
    mesh(geo.cyl(0.025, 0.025, 0.14, 6), mat(C.goldDeep), { p: [0.21, 0.72, 0.02] }),
    mesh(geo.cyl(0.025, 0.025, 0.14, 6), mat(C.goldDeep), { p: [0.29, 0.72, 0.02] }),
    mesh(geo.ball(0.035, 0), mat(C.red), { p: [0, 0.92, 0] }),
  );
}

function headItem(id: string | undefined): THREE.Object3D | null {
  switch (id) {
    case 'kipa-azul':
      return kippah(C.velvet, C.gold);
    case 'kipa-vermelha':
      return kippah(C.red);
    case 'kipa-shabat':
      return kippah(C.white, C.gold);
    default:
      return null;
  }
}

function faceItem(id: string | undefined): THREE.Object3D | null {
  if (id === 'oculos') return glasses();
  if (id === 'lupa') return magnifier();
  return null;
}

function bodyItem(id: string | undefined): THREE.Object3D | null {
  if (id === 'tzitzit') return tzitzit();
  if (id === 'sacola') return bookBag();
  return null;
}

function handItem(id: string | undefined): THREE.Object3D | null {
  switch (id) {
    case 'lamparina':
      return lamp();
    case 'pena':
      return quill();
    case 'shofar':
      return shofar();
    case 'bandeira':
      return flag();
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// O Golem
// ---------------------------------------------------------------------------

export interface GolemOptions {
  /** Cor do barro (a chavruta é mais clara). */
  clay?: string;
  /** Sem itens nem companhia (usado na própria chavruta). */
  bare?: boolean;
}

function limb(pivot: Vec, child: THREE.Object3D[]): THREE.Group {
  return group({ p: pivot }, ...child);
}

export function buildGolem(look?: GolemLook, opts: GolemOptions = {}): GolemRig {
  const e = opts.bare ? {} : (look?.equipped ?? {});
  const skin = e.skin ? itemById(e.skin)?.clay : undefined;
  const clayColor = opts.clay ?? skin ?? C.clay;
  const clay = mat(clayColor);
  const clayDark = mat(opts.clay ? C.clay : skin ? darker(skin) : C.clayDark);
  const ink = mat(C.ink, { smooth: true });
  const shine = glow('#FFFFFF');
  // Com fantasia, cabeça, corpo e mão ficam por baixo dela (as vantagens continuam valendo).
  const hidden = new Set(e.costume ? COSTUME_HIDES : []);

  // Pernas (pivô no quadril).
  const leg = () => [mesh(geo.rbox(0.3, 0.36, 0.34, 0.1), clayDark, { p: [0, -0.18, 0.02] })];
  const legL = limb([0.23, 0.38, 0], leg());
  const legR = limb([-0.23, 0.38, 0], leg());

  // Braços (pivô no ombro).
  const arm = (side: 1 | -1) => [
    mesh(geo.capsule(0.12, 0.3, 6), clay, { p: [0, -0.24, 0] }),
    mesh(geo.ball(0.15, 1), clay, { p: [0, -0.5, 0.02] }),
  ];
  const armL = limb([0.56, 1.02, 0], arm(1));
  const armR = limb([-0.56, 1.02, 0], arm(-1));
  armL.rotation.z = 0.14;
  armR.rotation.z = -0.14;

  // Tronco, com o "umbigo" de barro amassado.
  const torso = group(
    { p: [0, 0.76, 0] },
    mesh(geo.rbox(0.94, 0.8, 0.7, 0.18), clay),
  );

  // Olhos, bochechas, boca e a palavra na testa.
  const eye = (x: number) =>
    group(
      { p: [x, 0, 0] },
      mesh(geo.ball(0.085, 1), ink, { s: [1, 1.15, 0.6] }),
      mesh(geo.ball(0.026, 0), shine, { p: [0.025, 0.035, 0.045], shadow: false }),
    );
  const eyes = group({ p: [0, 0.02, 0.43] }, eye(0.21), eye(-0.21));
  eyes.name = 'eyes';
  const head = group(
    { p: [0, 1.6, 0] },
    mesh(geo.rbox(1.06, 0.88, 0.86, 0.24), clay),
    eyes,
    mesh(geo.disc(0.075, 12), mat(C.blush), { p: [0.34, -0.12, 0.432], shadow: false }),
    mesh(geo.disc(0.075, 12), mat(C.blush), { p: [-0.34, -0.12, 0.432], shadow: false }),
    mesh(geo.torus(0.075, 0.02, Math.PI, 10), ink, { p: [0, -0.15, 0.43], r: [0, 0, Math.PI] }),
    group({ p: [0, 0.27, 0.432] }, emet(0.11)),
  );

  const anchorsHead = hidden.has('head') ? null : headItem(e.head);
  if (anchorsHead) head.add(anchorsHead.translateY(0.44));
  const face = faceItem(e.face);
  if (face) head.add(face.translateZ(0.44));
  const bodyThing = hidden.has('body') ? null : bodyItem(e.body);
  if (bodyThing) torso.add(bodyThing);
  const hand = hidden.has('hand') ? null : handItem(e.hand);
  if (hand) {
    hand.position.y -= 0.5;
    hand.position.z += 0.12;
    armR.add(hand);
    armR.userData.holding = true;
  }

  const body = group({}, torso, head, armL, armR);
  const root = group({}, body, legL, legR);
  root.name = 'golem';
  if (e.costume) {
    const dressed = dressCostume(e.costume, { head, torso, armR, root });
    if (dressed?.holds) armR.userData.holding = true;
  }

  let companion: GolemRig | null = null;
  if (!opts.bare && e.companion === 'chavruta') {
    companion = buildGolem(undefined, { clay: C.clayLight, bare: true });
    companion.root.scale.setScalar(0.55);
    companion.root.position.set(-1.05, 0, -0.35);
    // Um livrinho nas mãos.
    companion.armL.add(mesh(geo.box(0.34, 0.26, 0.08), mat(C.velvet), { p: [-0.25, -0.55, 0.2], r: [0.3, 0, 0.3] }));
    root.add(companion.root);
  }
  return { root, body, head, eyes, armL, armR, legL, legR, companion };
}

/**
 * Aplica a pose no tempo `t` (segundos). Movimentos pequenos e redondos, como de
 * massinha: respira parado, balança andando, encolhe as pernas no pulo.
 */
export function poseGolem(rig: GolemRig, pose: GolemPose, t: number, still = false): void {
  const s = still ? 0 : 1;
  const { body, head, eyes, armL, armR, legL, legR } = rig;
  body.position.set(0, 0, 0);
  body.rotation.set(0, 0, 0);
  head.rotation.set(0, 0, 0);
  legL.rotation.set(0, 0, 0);
  legR.rotation.set(0, 0, 0);
  // Com algo na mão, o braço direito fica à frente, mostrando o item.
  const hold = armR.userData.holding ? -0.75 : 0;
  armL.rotation.set(0, 0, 0.14);
  armR.rotation.set(hold, 0, -0.14);
  // Piscar: um quadro rápido a cada ~3,7 s.
  const blink = (t % 3.7) < 0.12 && s ? 0.15 : 1;
  eyes.scale.set(1, blink, 1);

  switch (pose) {
    case 'idle': {
      const b = Math.sin(t * 2.2) * 0.02 * s;
      body.position.y = b;
      head.rotation.z = Math.sin(t * 1.1) * 0.04 * s;
      break;
    }
    case 'walk': {
      const w = t * 9;
      const swing = Math.sin(w) * 0.55 * s;
      legL.rotation.x = swing;
      legR.rotation.x = -swing;
      armL.rotation.x = -swing * 0.8;
      armR.rotation.x = hold + swing * (hold ? 0.3 : 0.8);
      body.position.y = Math.abs(Math.cos(w)) * 0.07 * s;
      body.rotation.z = Math.sin(w) * 0.04 * s;
      break;
    }
    case 'jump': {
      legL.rotation.x = -0.7;
      legR.rotation.x = -0.5;
      armL.rotation.z = 2.4;
      armR.rotation.z = -2.4;
      head.rotation.x = -0.12;
      break;
    }
    case 'hurt': {
      eyes.scale.set(1.15, 0.25, 1);
      head.rotation.z = 0.22 + Math.sin(t * 30) * 0.05 * s;
      body.rotation.z = -0.1;
      armL.rotation.z = 0.9;
      armR.rotation.z = -0.9;
      break;
    }
    case 'cheer': {
      const c = t * 7;
      armL.rotation.z = 2.5 + Math.sin(c) * 0.3 * s;
      armR.rotation.z = -2.5 - Math.sin(c) * 0.3 * s;
      body.position.y = Math.abs(Math.sin(c * 0.5)) * 0.18 * s;
      legL.rotation.x = Math.sin(c) * 0.2 * s;
      legR.rotation.x = -Math.sin(c) * 0.2 * s;
      break;
    }
  }
  if (rig.companion) poseGolem(rig.companion, pose === 'jump' ? 'walk' : pose, t + 0.4, still);
}
