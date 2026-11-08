#!/usr/bin/env node
/**
 * Gera src/three/sevivon-glyphs.ts: o contorno das palavras hebraicas das faces do
 * sevivon (תורה, נ״ך, משנה, תלמוד, הלכה, מדרש), tirado da Frank Ruhl Libre Bold (a mesma
 * fonte serifada do app, licença OFL), para virar letra em relevo no 3D sem textura nem
 * fonte carregada no aparelho.
 *
 * Uso: node apps/mobile/scripts/make-sevivon-glyphs.mjs (rode de novo se mudar uma palavra).
 */
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import opentype from 'opentype.js';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const fontPath = require.resolve('@expo-google-fonts/frank-ruhl-libre/700Bold/FrankRuhlLibre_700Bold.ttf');
const font = opentype.parse(readFileSync(fontPath).buffer);

/** As palavras vêm de CATEGORIES[...].shortLabelHe (conferido no teste do app). */
const WORDS = {
  torah: 'תורה',
  neviim_ketuvim: 'נ״ך',
  mishnah: 'משנה',
  talmud: 'תלמוד',
  halakhah: 'הלכה',
  midrash_aggadah: 'מדרש',
};

const SIZE = 100;
const CURVE_STEPS = 3;

/** Contornos (listas de pontos, y para cima) de uma palavra escrita da direita para a esquerda. */
function wordContours(word) {
  const glyphs = [...word].map((ch) => font.charToGlyph(ch));
  for (const [i, g] of glyphs.entries()) {
    if (!g || g.index === 0) throw new Error(`A fonte não tem a letra ${[...word][i]} (${word}).`);
  }
  const scale = SIZE / font.unitsPerEm;
  const total = glyphs.reduce((s, g) => s + g.advanceWidth * scale, 0);
  // Hebraico: a primeira letra fica à direita.
  let x = total;
  const contours = [];
  for (const g of glyphs) {
    x -= g.advanceWidth * scale;
    const path = g.getPath(x, 0, SIZE);
    let current = null;
    let last = [0, 0];
    for (const c of path.commands) {
      if (c.type === 'M') {
        if (current?.length) contours.push(current);
        current = [[c.x, -c.y]];
        last = [c.x, c.y];
      } else if (c.type === 'L') {
        current.push([c.x, -c.y]);
        last = [c.x, c.y];
      } else if (c.type === 'Q') {
        for (let s = 1; s <= CURVE_STEPS; s++) {
          const t = s / CURVE_STEPS;
          const u = 1 - t;
          const px = u * u * last[0] + 2 * u * t * c.x1 + t * t * c.x;
          const py = u * u * last[1] + 2 * u * t * c.y1 + t * t * c.y;
          current.push([px, -py]);
        }
        last = [c.x, c.y];
      } else if (c.type === 'C') {
        for (let s = 1; s <= CURVE_STEPS; s++) {
          const t = s / CURVE_STEPS;
          const u = 1 - t;
          const px = u * u * u * last[0] + 3 * u * u * t * c.x1 + 3 * u * t * t * c.x2 + t * t * t * c.x;
          const py = u * u * u * last[1] + 3 * u * u * t * c.y1 + 3 * u * t * t * c.y2 + t * t * t * c.y;
          current.push([px, -py]);
        }
        last = [c.x, c.y];
      } else if (c.type === 'Z') {
        if (current?.length) contours.push(current);
        current = null;
      }
    }
    if (current?.length) contours.push(current);
  }
  return contours.map(dedupe).filter((c) => c.length >= 3);
}

function dedupe(points) {
  const out = [];
  for (const p of points) {
    const q = out[out.length - 1];
    if (!q || Math.hypot(p[0] - q[0], p[1] - q[1]) > 0.05) out.push(p);
  }
  const first = out[0];
  const last = out[out.length - 1];
  if (out.length > 1 && Math.hypot(first[0] - last[0], first[1] - last[1]) < 0.05) out.pop();
  return out;
}

function area(c) {
  let a = 0;
  for (let i = 0; i < c.length; i++) {
    const [x1, y1] = c[i];
    const [x2, y2] = c[(i + 1) % c.length];
    a += x1 * y2 - x2 * y1;
  }
  return a / 2;
}

function inside([x, y], poly) {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

/** Agrupa os contornos em formas (contorno de fora + buracos), pela profundidade de aninhamento. */
function shapesOf(contours) {
  const depth = contours.map((c, i) => contours.filter((o, j) => j !== i && Math.abs(area(o)) > Math.abs(area(c)) && inside(c[0], o)).length);
  const shapes = [];
  contours.forEach((c, i) => {
    if (depth[i] % 2 === 0) shapes.push({ outer: orient(c, true), holes: [], index: i });
  });
  contours.forEach((c, i) => {
    if (depth[i] % 2 === 1) {
      const owner = shapes
        .filter((s) => inside(c[0], s.outer))
        .sort((a, b) => Math.abs(area(a.outer)) - Math.abs(area(b.outer)))[0];
      owner?.holes.push(orient(c, false));
    }
  });
  return shapes;
}

/** Contorno de fora no sentido anti-horário, buraco no horário (o que o three.js espera). */
function orient(c, ccw) {
  return area(c) > 0 === ccw ? c : [...c].reverse();
}

// Escala comum: a altura do corpo da letra (a do ה) vale 1 em todas as palavras, e a linha
// do meio desse corpo fica em y = 0. Assim o ל sobe e o ך desce como na escrita.
const ref = wordContours('ה').flat();
const refY0 = Math.min(...ref.map((p) => p[1]));
const refY1 = Math.max(...ref.map((p) => p[1]));
const k = 1 / (refY1 - refY0);
const cy = (refY0 + refY1) / 2;
const r3 = (n) => Math.round(n * 1000) / 1000;

const out = {};
for (const [id, word] of Object.entries(WORDS)) {
  const contours = wordContours(word);
  const xs = contours.flat().map((p) => p[0]);
  const ys = contours.flat().map((p) => p[1]);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const norm = (c) => c.flatMap(([x, y]) => [r3((x - cx) * k), r3((y - cy) * k)]);
  out[id] = {
    word,
    w: r3((Math.max(...xs) - Math.min(...xs)) * k),
    top: r3((Math.max(...ys) - cy) * k),
    bottom: r3((Math.min(...ys) - cy) * k),
    shapes: shapesOf(contours).map((s) => [norm(s.outer), ...s.holes.map(norm)]),
  };
}

const target = join(here, '..', 'src', 'three', 'sevivon-glyphs.ts');
const body = `/**
 * GERADO por scripts/make-sevivon-glyphs.mjs — não edite à mão.
 * Contorno das palavras das faces do sevivon na Frank Ruhl Libre Bold (OFL): o corpo da
 * letra (a altura do ה) mede 1 e fica centrado em y = 0; a palavra fica centrada em x = 0;
 * y para cima. Cada forma é [contorno, ...buracos], com os pontos em pares x, y.
 */
export interface FaceWord {
  word: string;
  /** Largura da palavra (o corpo da letra mede 1). */
  w: number;
  /** Até onde a palavra sobe (o ל passa de 0,5) e desce (o ך passa de −0,5). */
  top: number;
  bottom: number;
  shapes: readonly (readonly (readonly number[])[])[];
}

export const SEVIVON_GLYPHS: Readonly<Record<'torah' | 'neviim_ketuvim' | 'mishnah' | 'talmud' | 'halakhah' | 'midrash_aggadah', FaceWord>> = ${JSON.stringify(out)};
`;
writeFileSync(target, body);
console.log(`${target}: ${Object.values(out).map((o) => `${o.word} ${o.shapes.length} formas, ${o.shapes.flat().reduce((s, c) => s + c.length / 2, 0)} pontos`).join('; ')}`);
