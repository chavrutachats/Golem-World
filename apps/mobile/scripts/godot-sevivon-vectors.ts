/**
 * Valores de referência das contas do sevivon (src/lib/sevivon.ts) para o teste do cliente
 * Godot (apps/godot/tests/test_sevivon.gd), que confere que o porte dá os mesmos números.
 *
 * Uso: pnpm --filter @trivia/mobile godot-sevivon-vectors
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { obstacleAt, stageAt } from '../src/lib/journey-level';
import { hashString, seeded } from '../src/three/kit';
import { faceNormal, idlePose, orientation, planDuration, planSpin, poseAt, restHeight, ticksFrom } from '../src/lib/sevivon';

const cases = [];
for (const [face, start, jitter, reducedMotion] of [
  [0, 0, 0.5, false],
  [3, 1.234, 0.1, false],
  [6, 5.5, 0.9, false],
  [7, -2.0, 0.0, true],
] as const) {
  const plan = planSpin(face, start, { jitter, reducedMotion });
  const total = planDuration(plan);
  const samples = [0, 100, plan.hopMs, plan.hopMs + 300, plan.hopMs + plan.spinMs * 0.7, plan.hopMs + plan.spinMs + plan.fallMs * 0.5, total - 300, total].map((ms) => {
    const pose = poseAt(plan, ms);
    const q = orientation(pose);
    return { ms, pose, q: [q.x, q.y, q.z, q.w], rest: restHeight(q) };
  });
  const end = orientation(poseAt(plan, total));
  const up = faceNormal(face, end);
  cases.push({ face, start, jitter, reducedMotion, plan, ticksFrom: ticksFrom(plan), total, samples, up: [up.x, up.y, up.z] });
}
const idle = [0, 750, 4000].map((ms) => ({ ms, pose: idlePose(ms, 0.3) }));
// Sorteio com semente e hash de texto (o desenho das ilhas e das fases depende deles).
const kit = {
  hashes: ['Genesis', 'Bereshit|day|grass|', 'שלום'].map((text) => ({ text, hash: hashString(text) })),
  seeded: [1, 77, 7919, 123456789].map((seed) => {
    const r = seeded(seed);
    return { seed, values: Array.from({ length: 6 }, () => r()) };
  }),
};
// Obstáculo e cenário de cada pergunta (fases da Torá, trilhas e casa de estudos).
const levels = ['bereshit:torah', 'noach:talmud', 'vayetze:kabbalah', 'beshalach:torah', 'beit-midrash:Genesis'].flatMap((nodeId) =>
  [0, 1, 3, 5].map((index) => {
    const st = stageAt(nodeId, index, 6);
    return { nodeId, index, count: 6, obstacle: obstacleAt(nodeId, index, 6).obstacle, sky: st.sky, ground: st.ground, props: [...st.props] };
  }),
);
const file = fileURLToPath(new URL('../../godot/tests/sevivon_vectors.json', import.meta.url));
writeFileSync(file, JSON.stringify({ cases, idle, kit, levels }, null, 1) + '\n');
console.log(`${cases.length} giros em ${file}`);
