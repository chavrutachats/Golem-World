/**
 * Desenho do mapa do Golem World (lógica pura, testável): onde fica cada fase de um
 * mundo, as "pedrinhas" do caminho entre elas, o trajeto do Golem andando de uma fase
 * a outra e as decorações espalhadas pela terra.
 *
 * Unidades: pixels da arte. O mapa tem MAP_W de largura; a tela escala.
 */
import { beitMidrashNodeId, parashaNodeId, parashotOfBook, WORLDS, type TorahBook } from '@trivia/shared';
import { seeded } from './confetti';

export const MAP_W = 120;
/** Distância vertical entre duas parashiot no caminho (com espaço para a cena entre elas). */
export const NODE_STEP = 50;
/** Espaço do topo do mundo (faixa com o nome). */
export const WORLD_TOP = 30;
const DOT_SPACING = 6;

export interface MapPoint {
  x: number;
  y: number;
}

export interface MapNodeLayout extends MapPoint {
  id: string;
  kind: 'main' | 'beitMidrash';
  parashaId: string | null;
  /** Posição na ordem do caminho deste mundo. */
  index: number;
  /** Lado do nome da fase (do lado de fora da curva). */
  labelSide: 'left' | 'right';
}

export interface MapDecor extends MapPoint {
  sprite: string;
}

/**
 * Cena animada entre duas fases (Fase 12): conta a parashá seguinte (entre Bereshit e
 * Nôach, a arca sendo construída e os animais embarcando).
 */
export interface MapVignette extends MapPoint {
  /** Parashá que a cena conta (a da fase seguinte no caminho). */
  parashaId: string;
  /** Índice do nó de onde se sai (a cena fica entre os nós index e index + 1). */
  index: number;
}

/** Tamanho da área de uma cena (unidades do mapa), livre de enfeites. */
export const VIGNETTE_W = 42;
export const VIGNETTE_H = 38;

export interface WorldLayout {
  book: TorahBook;
  nodes: MapNodeLayout[];
  /** Cenas animadas entre as fases. */
  vignettes: MapVignette[];
  /** dots[i]: pedrinhas entre o nó i e o nó i+1. */
  dots: MapPoint[][];
  decor: MapDecor[];
  height: number;
}

/** Caixa onde vai o nome de uma fase (para não pôr árvore em cima). */
export function labelBox(n: MapNodeLayout): { x0: number; x1: number; y0: number; y1: number } {
  if (n.kind === 'beitMidrash') return { x0: n.x - 26, x1: n.x + 26, y0: n.y - 40, y1: n.y + 16 };
  return n.labelSide === 'right'
    ? { x0: n.x + 6, x1: Math.min(MAP_W, n.x + 58), y0: n.y - 10, y1: n.y + 12 }
    : { x0: Math.max(0, n.x - 58), x1: n.x - 6, y0: n.y - 10, y1: n.y + 12 };
}

export function curveDots(a: MapPoint, b: MapPoint, bend: number): MapPoint[] {
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  // Ponto de controle deslocado na perpendicular: o caminho faz uma curvinha.
  const cx = mx + (-dy / len) * bend;
  const cy = my + (dx / len) * bend;
  const samples = 60;
  const pts: MapPoint[] = [];
  let prev = a;
  let acc = 0;
  for (let i = 1; i <= samples; i++) {
    const t = i / samples;
    const x = (1 - t) * (1 - t) * a.x + 2 * (1 - t) * t * cx + t * t * b.x;
    const y = (1 - t) * (1 - t) * a.y + 2 * (1 - t) * t * cy + t * t * b.y;
    acc += Math.hypot(x - prev.x, y - prev.y);
    prev = { x, y };
    if (acc >= DOT_SPACING) {
      acc = 0;
      const p = { x: Math.round(x), y: Math.round(y) };
      if (Math.hypot(p.x - a.x, p.y - a.y) > 8 && Math.hypot(p.x - b.x, p.y - b.y) > 8) pts.push(p);
    }
  }
  return pts;
}

export function layoutWorld(
  book: TorahBook,
  sizeOf: (sprite: string) => { w: number; h: number } = () => ({ w: 16, h: 16 }),
  decorSprites: readonly string[] = ['tree', 'bush', 'flower'],
  maxDecor = 44,
): WorldLayout {
  const world = WORLDS.find((w) => w.id === book)!;
  const parashot = parashotOfBook(book);
  const nodes: MapNodeLayout[] = parashot.map((p, i) => {
    const x = Math.round(MAP_W / 2 + 30 * Math.sin(i * 1.15 + world.number * 0.7));
    const y = WORLD_TOP + 16 + i * NODE_STEP;
    const side = Math.abs(x - MAP_W / 2) < 6 ? (i % 2 === 0 ? 'right' : 'left') : x < MAP_W / 2 ? 'right' : 'left';
    return { id: parashaNodeId(p.id), kind: 'main', parashaId: p.id, index: i, x, y, labelSide: side };
  });
  const last = nodes[nodes.length - 1]!;
  nodes.push({
    id: beitMidrashNodeId(book),
    kind: 'beitMidrash',
    parashaId: null,
    index: nodes.length,
    x: MAP_W / 2,
    y: last.y + NODE_STEP + 30,
    labelSide: 'right',
  });
  const dots: MapPoint[][] = [];
  for (let i = 0; i < nodes.length - 1; i++) dots.push(curveDots(nodes[i]!, nodes[i + 1]!, i % 2 === 0 ? 7 : -7));
  const height = nodes[nodes.length - 1]!.y + 28;

  // Uma cena entre cada par de parashiot, do lado em que sobra mais terra.
  const vignettes: MapVignette[] = [];
  for (let i = 0; i < nodes.length - 1; i++) {
    const a = nodes[i]!;
    const b = nodes[i + 1]!;
    if (b.kind !== 'main' || !b.parashaId) continue;
    // Do lado oposto ao do caminho, onde não há nomes de fase.
    const mx = (a.x + b.x) / 2;
    const x = mx < MAP_W / 2 ? MAP_W - 28 : 28;
    // Um pouco abaixo do meio: as peças altas sobem na tela e não cobrem o nome da fase de cima.
    vignettes.push({ x: Math.round(x), y: Math.round((a.y + b.y) / 2 + 4), parashaId: b.parashaId, index: i });
  }

  // Decorações: sorteio com semente (o mapa é sempre o mesmo), longe do caminho e dos nomes.
  const rand = seeded(world.number * 7919);
  const allDots = dots.flat();
  const boxes = nodes.map(labelBox);
  const decor: MapDecor[] = [];
  const collides = (sprite: string, x: number, y: number) => {
    const { w, h } = sizeOf(sprite);
    const cx = x + w / 2;
    const cy = y + h / 2;
    return (
      nodes.some((n) => Math.hypot(n.x - cx, n.y - cy) < (n.kind === 'beitMidrash' ? 34 : 15) + w / 2) ||
      vignettes.some((v) => Math.abs(v.x - cx) < (VIGNETTE_W + w) / 2 && Math.abs(v.y - cy) < (VIGNETTE_H + h) / 2) ||
      allDots.some((d) => Math.abs(d.x - cx) < w / 2 + 3 && Math.abs(d.y - cy) < h / 2 + 3) ||
      boxes.some((b) => x < b.x1 && x + w > b.x0 && y < b.y1 && y + h > b.y0) ||
      decor.some((d) => {
        const s = sizeOf(d.sprite);
        return x < d.x + s.w && x + w > d.x && y < d.y + s.h && y + h > d.y;
      })
    );
  };
  // Primeiro, fileiras de árvores junto à praia (como os bosques dos mapas de 16 bits).
  const edgeSprite = decorSprites[0]!;
  const edgeW = sizeOf(edgeSprite).w;
  for (let y = WORLD_TOP + 6, k = 0; y < height - 24; y += 13, k++) {
    for (const x of [13 + (k % 2) * 3, MAP_W - 13 - edgeW - (k % 2) * 3]) {
      if (rand() < 0.75 && !collides(edgeSprite, x, y)) decor.push({ sprite: edgeSprite, x, y });
    }
  }
  for (let tries = 0; tries < 2000 && decor.length < maxDecor; tries++) {
    const sprite = decorSprites[Math.floor(rand() * decorSprites.length)]!;
    const { w, h } = sizeOf(sprite);
    const x = Math.round(8 + rand() * (MAP_W - 16 - w));
    const y = Math.round(WORLD_TOP + 4 + rand() * (height - WORLD_TOP - 8 - h));
    if (!collides(sprite, x, y)) decor.push({ sprite, x, y });
  }
  decor.sort((a, b) => a.y + sizeOf(a.sprite).h - (b.y + sizeOf(b.sprite).h));
  return { book, nodes, vignettes, dots, decor, height };
}

/**
 * Trajeto do Golem andando do nó `from` ao nó `to` pelo caminho (passando pelas
 * pedrinhas e pelas fases do meio), em qualquer direção.
 */
export function walkPoints(layout: WorldLayout, from: number, to: number): MapPoint[] {
  if (from === to) return [layout.nodes[from]!];
  const step = to > from ? 1 : -1;
  const pts: MapPoint[] = [layout.nodes[from]!];
  for (let i = from; i !== to; i += step) {
    const seg = step > 0 ? layout.dots[i]! : [...layout.dots[i - 1]!].reverse();
    pts.push(...seg, layout.nodes[i + step]!);
  }
  return pts.map((p) => ({ x: p.x, y: p.y }));
}
