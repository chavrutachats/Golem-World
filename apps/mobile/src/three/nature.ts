/**
 * Natureza do Golem World: árvores, palmeiras, pedras, dunas, montanhas, nuvens,
 * sol, lua e estrelas. Peças pequenas e variadas pela semente, para o mapa e o
 * fundo das fases não parecerem carimbados.
 */
import * as THREE from 'three';
import { C, geo, glow, group, mat, mesh, seeded } from './kit';

export type DecorKind = 'tree' | 'palm' | 'bush' | 'rock' | 'dune' | 'hill' | 'mountain' | 'pyramid' | 'tent' | 'flower' | 'reeds' | 'cypress';

export function tree(seed = 1): THREE.Group {
  const r = seeded(seed);
  const h = 0.9 + r() * 0.5;
  const crown = [C.leaf, C.leafDark, C.leafLight][Math.floor(r() * 3)]!;
  return group(
    {},
    mesh(geo.cyl(0.09, 0.13, h, 6), mat(C.trunk), { p: [0, h / 2, 0] }),
    mesh(geo.ball(0.62, 1), mat(crown), { p: [0, h + 0.38, 0], s: [1, 0.9, 1] }),
    mesh(geo.ball(0.42, 1), mat(crown), { p: [0.34, h + 0.12, 0.12] }),
    mesh(geo.ball(0.38, 1), mat(crown), { p: [-0.32, h + 0.18, -0.08] }),
  );
}

export function cypress(seed = 1): THREE.Group {
  const r = seeded(seed);
  const h = 1.6 + r() * 0.8;
  return group(
    {},
    mesh(geo.cyl(0.06, 0.08, 0.3, 5), mat(C.trunk), { p: [0, 0.15, 0] }),
    mesh(geo.cone(0.32, h, 7), mat(C.leafDark), { p: [0, 0.3 + h / 2, 0] }),
  );
}

export function palm(seed = 1): THREE.Group {
  const r = seeded(seed);
  const h = 1.7 + r() * 0.6;
  const lean = (r() - 0.5) * 0.3;
  const trunk = new THREE.Group();
  const segs = 5;
  for (let i = 0; i < segs; i++) {
    trunk.add(mesh(geo.cyl(0.09, 0.12, h / segs + 0.02, 6), mat(i % 2 ? C.woodDark : C.wood), { p: [lean * i * 0.4, (i + 0.5) * (h / segs), 0] }));
  }
  const top = new THREE.Vector3(lean * segs * 0.4, h, 0);
  const leaves: THREE.Object3D[] = [];
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + r();
    leaves.push(
      mesh(geo.box(0.95, 0.04, 0.26), mat(i % 2 ? C.leaf : C.leafDark), {
        p: [top.x + Math.cos(a) * 0.42, top.y - 0.12, Math.sin(a) * 0.42],
        r: [0, -a, -0.45],
      }),
    );
  }
  leaves.push(mesh(geo.ball(0.08, 0), mat(C.trunk), { p: [top.x + 0.1, top.y - 0.12, 0.08] }));
  leaves.push(mesh(geo.ball(0.08, 0), mat(C.trunk), { p: [top.x - 0.08, top.y - 0.14, 0.06] }));
  return group({}, trunk, ...leaves);
}

export function bush(seed = 1): THREE.Group {
  const r = seeded(seed);
  const c = r() > 0.5 ? C.leaf : C.leafLight;
  return group(
    {},
    mesh(geo.ball(0.34, 1), mat(c), { p: [0, 0.24, 0] }),
    mesh(geo.ball(0.26, 1), mat(C.leafDark), { p: [0.3, 0.18, 0.05] }),
    mesh(geo.ball(0.24, 1), mat(c), { p: [-0.28, 0.16, -0.04] }),
  );
}

export function rock(seed = 1, color: string = C.stone): THREE.Group {
  const r = seeded(seed);
  return group(
    {},
    mesh(geo.dodeca(0.38), mat(color), { p: [0, 0.22, 0], s: [1.2, 0.75 + r() * 0.3, 1], r: [r(), r() * 3, r()] }),
    mesh(geo.dodeca(0.22), mat(C.stoneDark), { p: [0.36, 0.12, 0.1], r: [r(), r(), r()] }),
  );
}

export function dune(seed = 1): THREE.Group {
  const r = seeded(seed);
  return group({}, mesh(geo.sphere(1.3, 10, 5, Math.PI / 2), mat(r() > 0.5 ? C.sand : C.sandDark), { s: [1.4, 0.45 + r() * 0.2, 0.9] }));
}

export function hill(seed = 1, color: string = C.leafLight): THREE.Group {
  const r = seeded(seed);
  return group({}, mesh(geo.sphere(1.6, 10, 5, Math.PI / 2), mat(color), { s: [1.3, 0.55 + r() * 0.25, 1] }));
}

export function mountain(seed = 1, color = '#9C8F86', snow = true): THREE.Group {
  const r = seeded(seed);
  const h = 3.2 + r() * 1.4;
  const parts: THREE.Object3D[] = [mesh(geo.cone(2.2, h, 6), mat(color), { p: [0, h / 2, 0], r: [0, r(), 0] })];
  if (snow) parts.push(mesh(geo.cone(0.72, h * 0.32, 6), mat(C.cream), { p: [0, h - h * 0.16 + 0.01, 0], r: [0, r(), 0] }));
  parts.push(mesh(geo.cone(1.5, h * 0.6, 6), mat('#8A7D74'), { p: [1.6, h * 0.3, -0.4], r: [0, r(), 0] }));
  return group({}, ...parts);
}

export function pyramid(seed = 1): THREE.Group {
  const r = seeded(seed);
  const s = 1.6 + r() * 0.6;
  return group({}, mesh(geo.cone(s, s * 1.1, 4), mat(C.sandDark), { p: [0, s * 0.55, 0], r: [0, Math.PI / 4, 0] }));
}

export function tent(seed = 1, cloth?: string): THREE.Group {
  const r = seeded(seed);
  const colors = ['#C9A27A', '#B9875E', '#E2C9A3', '#9D6B4C'];
  const c = cloth ?? colors[Math.floor(r() * colors.length)]!;
  return group(
    {},
    mesh(geo.cone(0.95, 1.15, 4), mat(c), { p: [0, 0.58, 0], r: [0, Math.PI / 4, 0], s: [1.25, 1, 0.9] }),
    mesh(geo.box(0.32, 0.5, 0.02), mat(C.ink), { p: [0, 0.26, 0.6], shadow: false }),
    mesh(geo.cyl(0.025, 0.025, 1.45, 4), mat(C.woodDark), { p: [0, 0.72, 0] }),
  );
}

export function flower(seed = 1): THREE.Group {
  const r = seeded(seed);
  const petal = ['#F7D046', '#F08FB0', '#FFFFFF', '#B28CF2'][Math.floor(r() * 4)]!;
  return group(
    {},
    mesh(geo.cyl(0.015, 0.015, 0.28, 4), mat(C.leafDark), { p: [0, 0.14, 0], shadow: false }),
    mesh(geo.ball(0.08, 0), mat(petal), { p: [0, 0.3, 0], shadow: false }),
    mesh(geo.ball(0.035, 0), mat(C.gold), { p: [0, 0.31, 0.06], shadow: false }),
  );
}

export function reeds(seed = 1): THREE.Group {
  const r = seeded(seed);
  const parts: THREE.Object3D[] = [];
  for (let i = 0; i < 5; i++) {
    const h = 0.6 + r() * 0.5;
    parts.push(mesh(geo.cyl(0.02, 0.025, h, 4), mat(C.leaf), { p: [(r() - 0.5) * 0.4, h / 2, (r() - 0.5) * 0.3], r: [0, 0, (r() - 0.5) * 0.3], shadow: false }));
    parts.push(mesh(geo.capsule(0.035, 0.12, 4), mat(C.trunk), { p: [(r() - 0.5) * 0.4, h, (r() - 0.5) * 0.3], shadow: false }));
  }
  return group({}, ...parts);
}

export function decor(kind: DecorKind, seed = 1): THREE.Group {
  switch (kind) {
    case 'tree':
      return tree(seed);
    case 'cypress':
      return cypress(seed);
    case 'palm':
      return palm(seed);
    case 'bush':
      return bush(seed);
    case 'rock':
      return rock(seed);
    case 'dune':
      return dune(seed);
    case 'hill':
      return hill(seed);
    case 'mountain':
      return mountain(seed);
    case 'pyramid':
      return pyramid(seed);
    case 'tent':
      return tent(seed);
    case 'flower':
      return flower(seed);
    case 'reeds':
      return reeds(seed);
  }
}

// ---------------------------------------------------------------------------
// Céu
// ---------------------------------------------------------------------------

export function cloud(seed = 1, color: string = C.white): THREE.Group {
  const r = seeded(seed);
  const parts: THREE.Object3D[] = [];
  const n = 3 + Math.floor(r() * 3);
  for (let i = 0; i < n; i++) {
    parts.push(mesh(geo.ball(0.45 + r() * 0.35, 1), mat(color), { p: [(i - n / 2) * 0.55, r() * 0.25, r() * 0.3], shadow: false }));
  }
  return group({}, ...parts);
}

export function sun(): THREE.Group {
  const rays: THREE.Object3D[] = [];
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    rays.push(mesh(geo.box(0.16, 0.5, 0.05), glow('#FFE07A'), { p: [Math.cos(a) * 1.25, Math.sin(a) * 1.25, -0.05], r: [0, 0, a - Math.PI / 2], shadow: false }));
  }
  return group({}, mesh(geo.disc(0.9, 24), glow('#FFD23F'), { shadow: false }), ...rays);
}

export function moon(): THREE.Group {
  return group(
    {},
    mesh(geo.disc(0.75, 24), glow('#F4F1DC'), { shadow: false }),
    mesh(geo.disc(0.62, 24), glow('#2A3170'), { p: [0.38, 0.18, 0.01], shadow: false }),
  );
}

/** Estrelas em pontos (um único objeto, barato). */
export function stars(count: number, width: number, height: number, seed = 7): THREE.Points {
  const r = seeded(seed);
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = (r() - 0.5) * width;
    pos[i * 3 + 1] = r() * height;
    pos[i * 3 + 2] = 0;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  return new THREE.Points(g, new THREE.PointsMaterial({ color: '#FFF7D6', size: 3, sizeAttenuation: false }));
}

export function rainbow(): THREE.Group {
  const colors = ['#E8555A', '#F59B42', '#F5D547', '#6CC46A', '#4DA3E0', '#8A6BD8'];
  return group(
    {},
    ...colors.map((c, i) => mesh(geo.torus(3 - i * 0.22, 0.11, Math.PI, 28), glow(c, 0.85), { shadow: false })),
  );
}

/** Céu em degradê: um plano grande com cores por vértice (funciona em qualquer GPU). */
export function skyBackdrop(stops: readonly string[], width = 80, height = 40): THREE.Mesh {
  const g = new THREE.PlaneGeometry(width, height, 1, stops.length - 1);
  const colors: number[] = [];
  const c = new THREE.Color();
  const pos = g.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const t = (pos.getY(i) + height / 2) / height; // 0 embaixo, 1 em cima
    const idx = Math.min(stops.length - 1, Math.round((1 - t) * (stops.length - 1)));
    c.set(stops[idx]!).convertSRGBToLinear();
    colors.push(c.r, c.g, c.b);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, depthWrite: false, fog: false }));
  m.renderOrder = -10;
  return m;
}
