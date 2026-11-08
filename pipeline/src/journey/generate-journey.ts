/**
 * Geração automática por IA para o Golem World.
 *
 * O jogo já monta perguntas na hora a partir dos textos (moldes determinísticos, sem
 * IA). Este módulo acrescenta perguntas de compreensão escritas pelo motor de IA
 * (gerador + validação por código + verificador às cegas), fase por fase, começando
 * pelas fases que estão com menos perguntas, na ordem do mapa.
 *
 * Com `--watch`, roda sem parar: a cada intervalo procura as fases com estoque baixo
 * e gera mais. As regras de revisão continuam valendo: com REQUIRE_HUMAN_REVIEW=true
 * (padrão), as perguntas novas esperam aprovação no /admin antes de entrar no jogo.
 */
import type { Prisma, PrismaClient, StudyText } from '@trivia/db';
import { PARASHOT, SUB_TRACKS, TRACKS, sourceBookNamePt, type CategoryId, type JourneyTrack, localeFromTag } from '@trivia/shared';
import { log, mapWithConcurrency } from '../util.js';
import { generateForPassage, rejectionCodes, type Engine, type PassageInput, type PassageOutcome } from '../generation/engine.js';
import { emptyStats, type BatchStats } from '../generation/persist.js';

/** Quantas perguntas do motor queremos por fase antes de parar de gerar para ela. */
export const JOURNEY_TARGET_PER_NODE = 12;
const MAX_WORDS = 220;
const MAX_SEGMENTS = 5;

/** Categoria usada no prompt (o prompt descreve o tipo de texto pela categoria). */
function promptCategory(track: JourneyTrack): CategoryId {
  return TRACKS[track].category ?? (track === 'commentators' ? 'torah' : 'midrash_aggadah');
}

export interface JourneyPassage extends PassageInput {
  track: JourneyTrack;
  parashot: string[];
  /** Segmentos de origem (para gravar o texto de estudo de cada pergunta). */
  studyTexts: Pick<StudyText, 'id' | 'ref' | 'parashot'>[];
}

/** Junta segmentos vizinhos do mesmo livro em passagens de até ~220 palavras. */
export function groupStudyTexts(rows: readonly StudyText[]): JourneyPassage[] {
  const out: JourneyPassage[] = [];
  let cur: StudyText[] = [];
  let words = 0;
  const flush = () => {
    if (!cur.length) return;
    const first = cur[0]!;
    const join = (k: 'heText' | 'enText' | 'ptText') => cur.map((s) => s[k]).filter(Boolean).join(' ') || null;
    out.push({
      id: first.id,
      ref: first.ref,
      bookTitle: first.author ? `${first.author} sobre ${first.bookTitle.split(' on ')[1] ?? first.bookTitle}` : sourceBookNamePt(first.bookTitle),
      category: promptCategory(first.track),
      segments: cur.map((s) => ({
        ref: s.ref,
        ...(s.heText ? { he: s.heText } : {}),
        ...(s.enText ? { en: s.enText } : {}),
        ...(s.ptText ? { pt: s.ptText } : {}),
      })),
      heText: join('heText'),
      enText: join('enText'),
      ptText: join('ptText'),
      track: first.track,
      parashot: [...new Set(cur.flatMap((s) => s.parashot))],
      studyTexts: cur.map((s) => ({ id: s.id, ref: s.ref, parashot: s.parashot })),
    });
    cur = [];
    words = 0;
  };
  for (const row of rows) {
    const prev = cur[cur.length - 1];
    const contiguous = prev && prev.bookTitle === row.bookTitle && row.sequence === prev.sequence + 1;
    if (!contiguous || cur.length >= MAX_SEGMENTS || words + row.wordCount > MAX_WORDS) flush();
    cur.push(row);
    words += row.wordCount;
  }
  flush();
  return out;
}

export interface JourneyNodeStock {
  parashaId: string;
  track: JourneyTrack;
  questions: number;
  freeTexts: number;
}

/** Estoque de perguntas do motor por fase (parashá × trilha), na ordem do mapa. */
export async function journeyStock(prisma: PrismaClient, tracks: readonly JourneyTrack[]): Promise<JourneyNodeStock[]> {
  const questionRows = await prisma.$queryRaw<{ parasha: string; track: JourneyTrack; n: number }[]>`
    SELECT p AS parasha, q.track, COUNT(*)::int AS n
    FROM "Question" q, unnest(q.parashot) p
    WHERE q.origin = 'llm' AND q.track IS NOT NULL AND q.status IN ('approved', 'pending_review')
    GROUP BY p, q.track`;
  const textRows = await prisma.$queryRaw<{ parasha: string; track: JourneyTrack; n: number }[]>`
    SELECT p AS parasha, s.track, COUNT(*)::int AS n
    FROM "StudyText" s, unnest(s.parashot) p
    WHERE NOT EXISTS (SELECT 1 FROM "Question" q WHERE q."studyTextId" = s.id AND q.origin = 'llm')
    GROUP BY p, s.track`;
  const key = (p: string, t: string) => `${p}:${t}`;
  const qMap = new Map(questionRows.map((r) => [key(r.parasha, r.track), Number(r.n)]));
  const tMap = new Map(textRows.map((r) => [key(r.parasha, r.track), Number(r.n)]));
  const out: JourneyNodeStock[] = [];
  for (const p of PARASHOT) {
    for (const track of ['torah' as const, ...SUB_TRACKS]) {
      if (!tracks.includes(track)) continue;
      const freeTexts = tMap.get(key(p.id, track)) ?? 0;
      if (freeTexts === 0) continue;
      out.push({ parashaId: p.id, track, questions: qMap.get(key(p.id, track)) ?? 0, freeTexts });
    }
  }
  return out;
}

export async function selectJourneyPassages(
  prisma: PrismaClient,
  input: { parashaId: string; track: JourneyTrack; limit: number },
): Promise<JourneyPassage[]> {
  const rows = await prisma.studyText.findMany({
    where: { track: input.track, parashot: { has: input.parashaId }, questions: { none: { origin: 'llm' } } },
    orderBy: [{ bookTitle: 'asc' }, { sequence: 'asc' }],
    take: input.limit * MAX_SEGMENTS,
  });
  return groupStudyTexts(rows).slice(0, input.limit);
}

export async function persistJourneyOutcome(
  prisma: PrismaClient,
  passage: JourneyPassage,
  outcome: PassageOutcome,
  locale: string,
  stats: BatchStats,
): Promise<void> {
  stats.passages++;
  stats.usage.inputTokens += outcome.usage.inputTokens;
  stats.usage.outputTokens += outcome.usage.outputTokens;
  stats[outcome.passageStatus]++;
  const keys = outcome.candidates.map((c) => c.dedupeKey);
  const existing = new Set(
    keys.length ? (await prisma.question.findMany({ where: { dedupeKey: { in: keys } }, select: { dedupeKey: true } })).map((q) => q.dedupeKey) : [],
  );
  const rows: Prisma.QuestionCreateManyInput[] = [];
  for (const c of outcome.candidates) {
    if (existing.has(c.dedupeKey)) {
      stats.questions.duplicates++;
      continue;
    }
    stats.questions.total++;
    stats.questions[c.status]++;
    for (const code of rejectionCodes(c)) stats.rejectionReasons[code] = (stats.rejectionReasons[code] ?? 0) + 1;
    const q = c.question;
    const study = passage.studyTexts.find((s) => s.ref === q.sourceRef.trim()) ?? passage.studyTexts[0]!;
    rows.push({
      studyTextId: study.id,
      // Fase 8: o idioma vai em código curto (pt, en, he), não "pt-BR".
      locale: localeFromTag(locale),
      category: TRACKS[passage.track].category,
      origin: 'llm',
      track: passage.track,
      parashot: study.parashot,
      text: q.question,
      options: q.options,
      correctIndex: q.correctIndex,
      explanation: q.explanation,
      sourceRef: q.sourceRef,
      evidenceQuote: q.evidenceQuote,
      evidenceLanguage: q.evidenceLanguage,
      aiDifficulty: q.difficulty,
      difficulty: q.difficulty,
      difficultyRationale: q.difficultyRationale,
      status: c.status,
      validationReport: {
        errors: c.validation.errors,
        warnings: c.validation.warnings,
        rejectionCodes: rejectionCodes(c),
        verification: c.verification ?? null,
      } as unknown as Prisma.InputJsonValue,
      verifierConfidence: c.verification?.result?.confidence ?? null,
      dedupeKey: c.dedupeKey,
    });
  }
  if (rows.length) await prisma.question.createMany({ data: rows, skipDuplicates: true });
}

export interface JourneyGenerateOptions {
  tracks: readonly JourneyTrack[];
  /** Fases a atender nesta rodada (as de menor estoque, na ordem do mapa). */
  nodes: number;
  passagesPerNode: number;
  concurrency: number;
  locale: string;
  parashaId?: string;
}

export async function generateForJourney(engine: Engine, prisma: PrismaClient, options: JourneyGenerateOptions): Promise<BatchStats> {
  const stats = emptyStats();
  let stock = await journeyStock(prisma, options.tracks);
  if (options.parashaId) stock = stock.filter((s) => s.parashaId === options.parashaId);
  const low = stock.filter((s) => s.questions < JOURNEY_TARGET_PER_NODE).slice(0, options.nodes);
  if (low.length === 0) {
    log.info('Todas as fases com texto já têm perguntas suficientes do motor.');
    return stats;
  }
  for (const node of low) {
    const passages = await selectJourneyPassages(prisma, { parashaId: node.parashaId, track: node.track, limit: options.passagesPerNode });
    log.info(`${node.parashaId} · ${TRACKS[node.track].labelPt}: ${node.questions} pergunta(s) do motor; gerando a partir de ${passages.length} trecho(s)…`);
    await mapWithConcurrency(passages, options.concurrency, async (passage) => {
      const outcome = await generateForPassage(engine, passage);
      await persistJourneyOutcome(prisma, passage, outcome, options.locale, stats);
    });
  }
  return stats;
}
