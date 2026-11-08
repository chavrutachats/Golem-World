/**
 * Personagens do Golem (Fase 9): fantasias, como no Purim, feitas com as mesmas
 * primitivas do resto do mundo. Cada fantasia cobre cabeça, corpo e mão (os itens
 * vestidos ficam "por baixo" e continuam valendo); o rosto de barro e as letras
 * אמת continuam à mostra. Nada de texto nas peças (nem no tzitz do Kohen Gadol).
 */
import * as THREE from 'three';
import { C, geo, group, mat, mesh } from './kit';

/** As peças do Golem onde a fantasia se prende. */
export interface CostumeAnchors {
  head: THREE.Group;
  torso: THREE.Group;
  armR: THREE.Group;
  root: THREE.Group;
}

// ---------------------------------------------------------------------------
// Peças comuns
// ---------------------------------------------------------------------------

/** Túnica em volta do tronco (presa no tronco, que fica em y = 0,76). */
function robe(color: string, length = 0.98, flare = 0.64): THREE.Object3D {
  return mesh(geo.cyl(0.52, flare, length, 9), mat(color), { p: [0, -0.06 - (length - 0.98) / 2, 0], s: [1, 1, 0.8] });
}

/** Faixas horizontais por cima da túnica (listras, a túnica colorida de José). */
function bands(colors: readonly string[], top = 0.34, height = 0.98, flare = 0.64): THREE.Object3D {
  const h = height / colors.length;
  return group(
    {},
    ...colors.map((c, i) => {
      const y = top - h * (i + 0.5);
      const t = (i + 0.5) / colors.length;
      const r = 0.525 + (flare + 0.005 - 0.525) * t;
      return mesh(geo.cyl(r, r + (flare - 0.52) / colors.length, h, 9), mat(c), { p: [0, y, 0], s: [1, 1, 0.8] });
    }),
  );
}

function beard(color: string, long = 0.46): THREE.Object3D {
  return mesh(geo.cone(0.3, long, 6), mat(color), { p: [0, -0.22 - long / 2, 0.36], r: [Math.PI, 0, 0], s: [1, 1, 0.55] });
}

/** Pano na cabeça caindo atrás e dos lados (os patriarcas, Moisés, Miriam). */
function headcloth(color: string, band?: string): THREE.Object3D {
  const cloth = mat(color);
  const parts: THREE.Object3D[] = [
    mesh(geo.sphere(0.7, 12, 6, Math.PI / 2), cloth, { p: [0, 0.18, -0.02], s: [0.86, 0.62, 0.72] }),
    mesh(geo.rbox(1.08, 0.9, 0.14, 0.06), cloth, { p: [0, -0.08, -0.46] }),
    mesh(geo.rbox(0.12, 0.72, 0.62, 0.05), cloth, { p: [0.56, -0.02, -0.12] }),
    mesh(geo.rbox(0.12, 0.72, 0.62, 0.05), cloth, { p: [-0.56, -0.02, -0.12] }),
  ];
  if (band) parts.push(mesh(geo.cyl(0.6, 0.6, 0.07, 14), mat(band), { p: [0, 0.3, -0.02], s: [0.9, 1, 0.76] }));
  return group({}, ...parts);
}

function hair(color: string, long = false): THREE.Object3D {
  const m = mat(color);
  const parts: THREE.Object3D[] = [mesh(geo.ball(0.6, 1), m, { p: [0, 0.32, -0.04], s: [1, 0.45, 0.88] })];
  if (long) parts.push(mesh(geo.rbox(1.02, 1.02, 0.22, 0.1), m, { p: [0, -0.16, -0.42] }));
  return group({}, ...parts);
}

function crown(color: string = C.gold, gem: string = C.red): THREE.Object3D {
  const gold = mat(color, { emissive: color, emissiveIntensity: 0.15 });
  const parts: THREE.Object3D[] = [mesh(geo.cyl(0.36, 0.38, 0.2, 10), gold, { p: [0, 0.54, 0] })];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    parts.push(mesh(geo.cone(0.07, 0.2, 4), gold, { p: [Math.sin(a) * 0.34, 0.74, Math.cos(a) * 0.34] }));
  }
  parts.push(mesh(geo.ball(0.06, 0), mat(gem), { p: [0, 0.56, 0.38] }));
  return group({}, ...parts);
}

/** Cajado na mão direita (Abraão, Moisés). */
function staff(color: string = C.woodDark): THREE.Object3D {
  const m = mat(color);
  return group(
    { p: [0, -0.5, 0.12] },
    mesh(geo.cyl(0.035, 0.035, 1.8, 6), m, { p: [0, 0.3, 0] }),
    mesh(geo.torus(0.1, 0.035, Math.PI, 8), m, { p: [0.1, 1.2, 0], r: [0, 0, 0] }),
  );
}

// ---------------------------------------------------------------------------
// Cada personagem
// ---------------------------------------------------------------------------

type Dresser = (a: CostumeAnchors) => { holds: boolean };

function dove(): THREE.Object3D {
  const white = mat(C.white);
  return group(
    { p: [0.5, 0.48, 0.05] },
    mesh(geo.ball(0.13, 1), white, { s: [1.3, 0.9, 1] }),
    mesh(geo.ball(0.08, 1), white, { p: [0.12, 0.08, 0.06] }),
    mesh(geo.box(0.22, 0.03, 0.12), white, { p: [-0.05, 0.08, -0.05], r: [0, 0, 0.5] }),
    mesh(geo.cone(0.025, 0.07, 4), mat(C.gold), { p: [0.21, 0.08, 0.06], r: [0, 0, -Math.PI / 2] }),
    // O ramo de oliveira no bico.
    mesh(geo.cyl(0.01, 0.01, 0.2, 4), mat(C.leafDark), { p: [0.26, 0.04, 0.06], r: [0, 0, 1.2] }),
    mesh(geo.ball(0.035, 0), mat(C.leaf), { p: [0.33, 0.0, 0.06], s: [1.6, 0.7, 0.8] }),
  );
}

function tambourine(): THREE.Object3D {
  const parts: THREE.Object3D[] = [
    mesh(geo.torus(0.2, 0.04, Math.PI * 2, 14), mat(C.woodDark), {}),
    mesh(geo.disc(0.19, 14), mat(C.cream), { p: [0, 0, -0.01] }),
  ];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    parts.push(mesh(geo.cyl(0.045, 0.045, 0.02, 8), mat(C.gold), { p: [Math.cos(a) * 0.2, Math.sin(a) * 0.2, 0.03], r: [Math.PI / 2, 0, 0] }));
  }
  return group({ p: [0, -0.62, 0.2], r: [0.3, 0, 0] }, ...parts);
}

function harp(): THREE.Object3D {
  const gold = mat(C.gold, { emissive: C.gold, emissiveIntensity: 0.1 });
  const string = mat(C.cream, { smooth: true });
  const parts: THREE.Object3D[] = [
    mesh(geo.cyl(0.03, 0.03, 0.62, 5), gold, { p: [-0.12, 0, 0] }),
    mesh(geo.cyl(0.03, 0.03, 0.5, 5), gold, { p: [0.08, 0.18, 0], r: [0, 0, -0.9] }),
    mesh(geo.cyl(0.03, 0.03, 0.42, 5), gold, { p: [0.12, -0.12, 0], r: [0, 0, 0.35] }),
  ];
  for (let i = 0; i < 4; i++) parts.push(mesh(geo.cyl(0.006, 0.006, 0.42 - i * 0.07, 3), string, { p: [-0.06 + i * 0.06, 0.02 + i * 0.03, 0], shadow: false }));
  return group({ p: [0, -0.62, 0.22], r: [0.2, 0, 0.2] }, ...parts);
}

function breastplate(): THREE.Object3D {
  const stones = ['#D64545', '#5CC46A', '#4C8DF0', '#F4F4F4', '#9B5BE0', '#FF9A3C', '#1FA59A', '#E85D9C', '#8BD3F7', '#7A4B2A', '#FFD04A', '#2F6B3A'];
  const parts: THREE.Object3D[] = [mesh(geo.box(0.46, 0.54, 0.05), mat(C.gold, { emissive: C.gold, emissiveIntensity: 0.12 }), {})];
  stones.forEach((c, i) => {
    parts.push(mesh(geo.box(0.1, 0.1, 0.04), mat(c, { smooth: true }), { p: [-0.13 + (i % 3) * 0.13, 0.19 - Math.floor(i / 3) * 0.125, 0.04] }));
  });
  return group({ p: [0, 0.06, 0.42] }, ...parts);
}

function pomegranateHem(): THREE.Object3D {
  const parts: THREE.Object3D[] = [];
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    const bell = i % 2 === 0;
    parts.push(mesh(geo.ball(0.05, 0), mat(bell ? C.gold : C.red), { p: [Math.sin(a) * 0.66, -0.58, Math.cos(a) * 0.52] }));
  }
  return group({}, ...parts);
}

function bigFish(): THREE.Object3D {
  const blue = mat('#7FC6E8');
  return group(
    { p: [-1.25, 0.95, -0.2], r: [0, 0.5, 0] },
    mesh(geo.ball(0.42, 1), blue, { s: [1.6, 1, 0.85] }),
    mesh(geo.cone(0.32, 0.42, 4), blue, { p: [-0.78, 0, 0], r: [0, 0, Math.PI / 2], s: [1, 1, 0.4] }),
    mesh(geo.ball(0.06, 0), mat(C.ink, { smooth: true }), { p: [0.46, 0.12, 0.3] }),
    mesh(geo.torus(0.1, 0.02, Math.PI, 8), mat(C.ink), { p: [0.6, -0.08, 0.25], r: [0, 0.6, Math.PI] }),
  );
}

const DRESS: Readonly<Record<string, Dresser>> = {
  adao: ({ head, torso }) => {
    torso.add(robe('#8A5A34', 0.8));
    head.add(hair('#3B2416'));
    return { holds: false };
  },
  eva: ({ head, torso }) => {
    torso.add(robe('#B07A50', 0.85));
    head.add(hair('#3B2416', true));
    head.add(group({ p: [0.48, 0.3, 0.26] }, mesh(geo.ball(0.09, 1), mat('#F4A6C1')), mesh(geo.ball(0.04, 0), mat(C.gold), { p: [0, 0, 0.07] })));
    return { holds: false };
  },
  serpente: ({ head, torso, root }) => {
    const green = mat('#2F6B3A');
    const light = mat('#7FD06B');
    torso.add(robe('#3E8C4A'));
    // O capuz de cobra, com a cabeça da serpente em cima.
    head.add(mesh(geo.ball(0.62, 1), green, { p: [0, 0.2, -0.08], s: [1, 0.72, 0.95] }));
    head.add(
      group(
        { p: [0, 0.62, 0.22] },
        mesh(geo.ball(0.24, 1), light, { s: [1.1, 0.6, 1.4] }),
        mesh(geo.ball(0.05, 0), mat(C.gold, { emissive: C.gold, emissiveIntensity: 0.4 }), { p: [0.1, 0.08, 0.22] }),
        mesh(geo.ball(0.05, 0), mat(C.gold, { emissive: C.gold, emissiveIntensity: 0.4 }), { p: [-0.1, 0.08, 0.22] }),
      ),
    );
    // A cauda enrolada no chão.
    root.add(mesh(geo.torus(0.62, 0.12, Math.PI * 1.4, 18), light, { p: [0, 0.12, -0.1], r: [Math.PI / 2, 0, 0.8] }));
    return { holds: false };
  },
  noe: ({ head, torso }) => {
    torso.add(robe('#6E4A2E'));
    head.add(headcloth('#D9C9A0', '#8A5A34'));
    head.add(beard('#F2F2F2'));
    torso.add(dove());
    return { holds: false };
  },
  abraao: ({ head, torso, armR }) => {
    torso.add(robe('#C9A46A'));
    torso.add(bands(['#C9A46A', '#7A5233', '#C9A46A', '#7A5233', '#C9A46A']));
    head.add(headcloth(C.linen, '#7A5233'));
    head.add(beard('#CFCFCF'));
    armR.add(staff());
    return { holds: true };
  },
  jose: ({ head, torso }) => {
    torso.add(bands(['#D64545', '#F2B630', '#4C8DF0', '#5CC46A', '#9B5BE0', '#FF9A3C']));
    head.add(hair('#2A1A10'));
    return { holds: false };
  },
  moises: ({ head, torso, armR }) => {
    torso.add(robe('#8E3B2F'));
    head.add(headcloth('#E9DCC0'));
    head.add(beard('#F4F4F4', 0.56));
    armR.add(staff('#6B4423'));
    return { holds: true };
  },
  miriam: ({ head, torso, armR }) => {
    torso.add(robe('#B0447A'));
    head.add(headcloth('#F2D7E3', '#B0447A'));
    armR.add(tambourine());
    return { holds: true };
  },
  aarao: ({ head, torso }) => {
    torso.add(robe('#2A3C9C'));
    torso.add(pomegranateHem());
    torso.add(breastplate());
    // Turbante branco com a placa de ouro na frente (sem inscrição).
    head.add(mesh(geo.cyl(0.5, 0.48, 0.34, 10), mat(C.white), { p: [0, 0.48, 0], s: [1, 1, 0.9] }));
    head.add(mesh(geo.box(0.36, 0.1, 0.03), mat(C.gold, { emissive: C.gold, emissiveIntensity: 0.3 }), { p: [0, 0.44, 0.45] }));
    return { holds: false };
  },
  davi: ({ head, torso, armR }) => {
    torso.add(robe('#6D3B9E'));
    head.add(hair('#7A3E1D'));
    head.add(crown());
    armR.add(harp());
    return { holds: true };
  },
  ester: ({ head, torso }) => {
    torso.add(robe('#8E3AA6', 1.02, 0.7));
    torso.add(mesh(geo.torus(0.36, 0.035, Math.PI * 2, 14), mat(C.gold, { smooth: true }), { p: [0, 0.38, 0.06], r: [Math.PI / 2 - 0.2, 0, 0] }));
    head.add(hair('#2A1A10', true));
    head.add(crown(C.gold, '#4C8DF0'));
    return { holds: false };
  },
  mordecai: ({ head, torso }) => {
    torso.add(robe('#F4F6FB'));
    torso.add(bands(['#F4F6FB', '#2D5DB8', '#F4F6FB', '#2D5DB8'], 0.1, 0.74));
    head.add(beard('#4A3324'));
    head.add(crown());
    return { holds: false };
  },
  jonas: ({ head, torso, root }) => {
    torso.add(robe('#2E7FB8'));
    head.add(hair('#3B2416'));
    root.add(bigFish());
    return { holds: false };
  },
};

export const COSTUME_IDS: readonly string[] = Object.keys(DRESS);

/** Veste a fantasia. Devolve se ela segura algo na mão direita (o braço vai à frente). */
export function dressCostume(id: string, anchors: CostumeAnchors): { holds: boolean } | null {
  const dress = DRESS[id];
  if (!dress) return null;
  const result = dress(anchors);
  anchors.root.userData.costume = id;
  return result;
}

/** Barro mais escuro para pernas e sombras, a partir da cor do material. */
export function darker(hex: string, amount = 0.2): string {
  return `#${new THREE.Color(hex).lerp(new THREE.Color('#000000'), amount).getHexString()}`;
}
