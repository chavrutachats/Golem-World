/**
 * O que precisa estar no idioma do jogador para uma fase do Golem World rodar
 * (Fase 8): os versículos da parashá (alternativas e contexto dos moldes) e, nas
 * trilhas, uma amostra dos trechos daquela trilha. Na casa de estudos, a revisão
 * usa algumas parashiot do livro, não todas.
 */
import type { PrismaClient } from '@trivia/db';
import { parashotOfBook, type JourneyNode, type JourneyTrack, type TranslatedLocale } from '@trivia/shared';
import type { RandomSource } from '../common/infra.js';
import { QuestionFactory } from '../questions/question-factory.service.js';

/** Trechos de uma trilha que bastam para uma fase (8 obstáculos com folga). */
export const TRACK_SAMPLE = 40;
const TRACK_READY = 30;
/** Parashiot prontas que bastam para a revisão da casa de estudos. */
const REVIEW_PARASHOT = 4;

export interface PrepPlan {
  /** Trechos a traduzir (os já traduzidos são ignorados por quem traduz). */
  ids: string[];
  /** A fase já roda sem traduzir nada. */
  ready: boolean;
}

async function verseIds(prisma: PrismaClient, parashaId: string): Promise<string[]> {
  const rows = await prisma.studyText.findMany({ where: { track: 'torah', parashot: { has: parashaId } }, select: { id: true } });
  return rows.map((r) => r.id);
}

export async function journeyPrepPlan(
  prisma: PrismaClient,
  factory: QuestionFactory,
  node: JourneyNode,
  locale: TranslatedLocale,
  random: RandomSource,
): Promise<PrepPlan> {
  const readiness = await factory.readiness(locale);
  if (node.kind === 'beit-midrash') {
    const parashot = parashotOfBook(node.book).map((p) => p.id);
    const ready = parashot.filter((id) => QuestionFactory.isReady(readiness, id, 'torah'));
    if (ready.length >= Math.min(REVIEW_PARASHOT, parashot.length)) return { ids: [], ready: true };
    const pending = parashot.filter((id) => !ready.includes(id));
    const chosen: string[] = [];
    while (chosen.length < REVIEW_PARASHOT - ready.length && pending.length) chosen.push(pending.splice(random.int(pending.length), 1)[0]!);
    const ids = (await Promise.all(chosen.map((id) => verseIds(prisma, id)))).flat();
    return { ids, ready: false };
  }
  const track: JourneyTrack = node.track;
  const ids = await verseIds(prisma, node.parashaId);
  if (track === 'torah') return { ids, ready: QuestionFactory.isReady(readiness, node.parashaId, 'torah') };
  const ready = QuestionFactory.isReady(readiness, node.parashaId, track, TRACK_READY);
  if (!ready) {
    const lang = locale === 'pt' ? { ptText: null } : { enText: null };
    const candidates = await prisma.studyText.findMany({
      where: { track, parashot: { has: node.parashaId }, ...lang, translations: { none: { locale } } },
      select: { id: true },
      take: 2000,
    });
    const pool = candidates.map((c) => c.id);
    const sample: string[] = [];
    while (sample.length < TRACK_SAMPLE && pool.length) sample.push(pool.splice(random.int(pool.length), 1)[0]!);
    ids.push(...sample);
  }
  return { ids, ready };
}
