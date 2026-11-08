/**
 * O mundo 3D sem tela: todo episódio, peça e casa de estudos tem modelo; o Golem
 * veste cada item; o diretor anima no tempo certo; e a conta que põe os nomes do
 * mapa por cima da cena bate com a projeção da câmera.
 */
import { ITEMS, OBSTACLE_IDS as SHARED_OBSTACLES, PARASHOT, PROP_IDS, WORLDS } from '@trivia/shared';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { COSTUME_IDS } from '../src/three/costumes';
import { SceneDirector, ease } from '../src/three/director';
import { buildGolem, GOLEM_HEIGHT, poseGolem } from '../src/three/golem';
import { buildLevelEnvironment } from '../src/three/level';
import { aimCamera, buildIsland, contentPoint, layoutWorld3D, mapToWorld, mapZoom } from '../src/three/map';
import { buildBeitMidrash, buildObstacle, buildProp, OBSTACLE_IDS } from '../src/three/story';

function size(o: THREE.Object3D): THREE.Vector3 {
  return new THREE.Box3().setFromObject(o).getSize(new THREE.Vector3());
}

function meshCount(o: THREE.Object3D): number {
  let n = 0;
  o.traverse((c) => ((c as THREE.Mesh).isMesh ? n++ : null));
  return n;
}

describe('modelos', () => {
  it('todo obstáculo do catálogo tem modelo, do tamanho de um obstáculo', () => {
    expect([...OBSTACLE_IDS].sort()).toEqual([...SHARED_OBSTACLES].sort());
    for (const id of OBSTACLE_IDS) {
      const s = size(buildObstacle(id));
      expect(s.y, id).toBeGreaterThan(0.25);
      expect(s.y, id).toBeLessThan(3.2);
      expect(s.x, id).toBeLessThan(3.6);
    }
  });

  it('toda peça de cenário tem modelo (estrelas e mar aberto são desenhados à parte)', () => {
    for (const id of PROP_IDS) {
      const o = buildProp(id);
      if (id === 'stars' || id === 'sea-walls') continue;
      expect(meshCount(o), id).toBeGreaterThan(0);
    }
  });

  it('as cinco casas de estudo', () => {
    for (const w of WORLDS) expect(meshCount(buildBeitMidrash(w.beitMidrash.style)), w.beitMidrash.style).toBeGreaterThan(5);
  });

  it('o Golem veste cada item e continua com a altura certa', () => {
    const bare = size(buildGolem(undefined).root);
    expect(bare.y).toBeCloseTo(GOLEM_HEIGHT, 0);
    for (const item of ITEMS) {
      const rig = buildGolem({ equipped: { [item.slot]: item.id } });
      if (item.slot === 'skin') {
        // O material não acrescenta peças: muda a cor do barro.
        const color = ((rig.head.children[0] as THREE.Mesh).material as THREE.MeshLambertMaterial).color.getHexString();
        expect(`#${color}`.toLowerCase(), item.id).toBe(item.clay!.toLowerCase());
      } else {
        expect(meshCount(rig.root), item.id).toBeGreaterThan(meshCount(buildGolem(undefined).root));
      }
      for (const pose of ['idle', 'walk', 'jump', 'hurt', 'cheer'] as const) poseGolem(rig, pose, 1.3);
      expect(size(rig.root).y, item.id).toBeLessThan(GOLEM_HEIGHT + 1.4);
    }
    expect(buildGolem({ equipped: { companion: 'chavruta' } }).companion).not.toBeNull();
  });

  it('cada personagem tem fantasia, e ela cobre cabeça, corpo e mão', () => {
    const costumes = ITEMS.filter((i) => i.slot === 'costume').map((i) => i.id);
    expect([...COSTUME_IDS].sort()).toEqual([...costumes].sort());
    const kit = { head: 'kipa-shabat', body: 'tzitzit', hand: 'lamparina', face: 'oculos' } as const;
    const plain = meshCount(buildGolem({ equipped: kit }).root);
    for (const id of costumes) {
      const rig = buildGolem({ equipped: { ...kit, costume: id } });
      expect(rig.root.userData.costume, id).toBe(id);
      // Os óculos (rosto) continuam à mostra; kipá, talit e lamparina ficam por baixo.
      expect(meshCount(rig.root), id).not.toBe(plain);
    }
    // Quem segura algo (cajado, harpa, tamborim) leva o braço à frente.
    expect(buildGolem({ equipped: { costume: 'moises' } }).armR.userData.holding).toBe(true);
    expect(buildGolem({ equipped: { costume: 'adao' } }).armR.userData.holding).toBeUndefined();
  });

  it('todo cenário de parashá monta (céu, chão e peças)', () => {
    for (const p of PARASHOT) {
      for (const st of [p.scene, ...(p.scene.stages ?? [])]) {
        const env = buildLevelEnvironment(st, p.id);
        env.update(12.5, 0);
        expect(meshCount(env.root), p.id).toBeGreaterThan(10);
      }
    }
  });
});

describe('diretor das animações', () => {
  it('anima no tempo, com curva, e resolve no fim', async () => {
    const d = new SceneDirector({ x: 0, y: 0 });
    d.update(0);
    let done = false;
    const p = d.to('x', 10, 1000, ease.linear).then(() => (done = true));
    d.update(500);
    expect(d.get('x')).toBeCloseTo(5);
    d.update(1000);
    await p;
    expect(done).toBe(true);
    expect(d.get('x')).toBe(10);
    expect(d.busy).toBe(false);
  });

  it('sequência sobe e desce; tempo zero vai direto (movimento reduzido)', async () => {
    const d = new SceneDirector({ y: 0 });
    d.update(0);
    const p = d.sequence('y', [
      { to: 2, ms: 100, easing: ease.outQuad },
      { to: 0, ms: 100, easing: ease.inQuad },
    ]);
    d.update(100);
    expect(d.get('y')).toBeCloseTo(2);
    d.update(150);
    expect(d.get('y')).toBeGreaterThan(0);
    d.update(200);
    await p;
    expect(d.get('y')).toBe(0);
    await d.to('y', 7, 0);
    expect(d.get('y')).toBe(7);
  });

  it('uma animação nova no canal encerra a anterior sem travar quem esperava', async () => {
    const d = new SceneDirector({ x: 0 });
    d.update(0);
    const first = d.to('x', 10, 1000);
    const second = d.to('x', -1, 100);
    await first;
    d.update(100);
    await second;
    expect(d.get('x')).toBe(-1);
  });
});

describe('mapa', () => {
  it('a posição dos nomes bate com a câmera para qualquer rolagem', () => {
    const width = 390;
    const height = 700;
    const zoom = mapZoom(width);
    const cam = new THREE.OrthographicCamera(-width / 2, width / 2, height / 2, -height / 2, 0.1, 400);
    for (const scroll of [0, 350, 2400]) {
      aimCamera(cam, scroll, height, zoom);
      cam.updateMatrixWorld();
      for (const [mx, my] of [
        [10, 40],
        [60, 300],
        [110, 600],
      ] as const) {
        const p = mapToWorld(mx, my);
        const ndc = p.clone().project(cam);
        const screen = { x: ((ndc.x + 1) / 2) * width, y: ((1 - ndc.y) / 2) * height };
        const content = contentPoint(p, zoom, width);
        expect(screen.x).toBeCloseTo(content.x, 1);
        expect(screen.y).toBeCloseTo(content.y - scroll, 1);
      }
    }
  });

  it('as ilhas juntam as peças paradas em poucas malhas', () => {
    for (const w of WORLDS) {
      const island = buildIsland(w.id, layoutWorld3D(w.id), 0);
      expect(island.children.length, w.id).toBeLessThan(40);
    }
  });
});

describe('cenas animadas do mapa (Fase 12)', () => {
  it('toda parashá depois de Bereshit tem cena, e a Criação abre o mapa', async () => {
    const { PARASHOT } = await import('@trivia/shared');
    const { buildVignette, PARASHA_VIGNETTE } = await import('../src/three/vignettes');
    expect(Object.keys(PARASHA_VIGNETTE).sort()).toEqual(PARASHOT.slice(1).map((p) => p.id).sort());
    for (const p of PARASHOT.slice(1)) {
      const g = buildVignette(p.id)!;
      const size = new THREE.Box3().setFromObject(g).getSize(new THREE.Vector3());
      // Cabe na área reservada no mapa (VIGNETTE_W unidades do mapa = 4,4 do mundo).
      expect(Math.max(size.x, size.z)).toBeLessThan(5);
    }
    expect(buildVignette('bereshit')).toBeNull();
  });

  it('os movimentos são função do tempo (mesmo instante, mesma cena)', async () => {
    const { animate, buildVignette } = await import('../src/three/vignettes');
    const a = buildVignette('noach')!;
    const b = buildVignette('noach')!;
    animate(a, 3.7);
    animate(b, 1.2);
    animate(b, 3.7);
    const pos = (g: THREE.Object3D) => g.children.map((c) => c.position.toArray().map((x) => x.toFixed(4)).join(','));
    expect(pos(a)).toEqual(pos(b));
  });

  it('a Criação: trevas no começo; com movimento reduzido, tudo já criado', async () => {
    const { buildCreation } = await import('../src/three/vignettes');
    const c = buildCreation();
    c.update(0.5, false);
    const visible = () => c.root.children.filter((o) => o.visible).length;
    const dark = visible();
    c.update(0, true);
    expect(visible()).toBeGreaterThan(dark);
  });
});
