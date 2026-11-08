/**
 * Fábrica de perguntas dinâmicas, compartilhada pelo Golem World e pela roleta.
 *
 * Para cada pergunta pedida (parashá × trilha × nível):
 *  1. às vezes serve uma pergunta aprovada do motor de IA ligada à parashá (se houver
 *     uma que o jogador ainda não viu);
 *  2. senão, monta uma pergunta de molde NA HORA a partir dos textos do Sefaria
 *     (StudyText) — sem IA, então sem alucinação — e a grava no banco (a mesma
 *     pergunta montada de novo reaproveita a linha, para valer estatística e denúncia);
 *  3. em último caso, repete uma pergunta já vista (melhor do que travar a fase).
 *
 * Fase 8: tudo no idioma do jogador. Os moldes só usam trechos com texto nesse idioma
 * (original, versão do Sefaria ou tradução guardada) e as perguntas do motor só entram
 * se forem desse idioma ou tiverem tradução em dia.
 */
import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { Prisma, PrismaClient, Question } from '@trivia/db';
import {
  DIFFICULTIES,
  PARASHOT,
  TRACKS,
  difficultyNeighbors,
  questionLocale,
  type CategoryId,
  type Difficulty,
  type JourneyTrack,
  type Locale,
} from '@trivia/shared';
import { Errors } from '../common/http.js';
import { CLOCK, PRISMA, RANDOM, type Clock, type RandomSource } from '../common/infra.js';
import { buildTemplateQuestion, type StudySeg, type TemplateQuestion } from './templates.js';

type Db = PrismaClient | Prisma.TransactionClient;

const SEGMENT_TTL_MS = 10 * 60_000;
const AVAILABILITY_TTL_MS = 2 * 60_000;
const READY_TTL_MS = 30_000;
/** Uma parashá está pronta num idioma quando quase todos os versículos têm texto nele. */
const VERSES_READY_SHARE = 0.9;
/** Trechos prontos de uma trilha para ela entrar na roleta. */
const TRACK_READY_MIN = 8;
/** Chance de usar uma pergunta do motor de IA quando existe uma inédita. */
const LLM_SHARE = 0.5;
const STUDY_SELECT = {
  id: true,
  ref: true,
  track: true,
  bookTitle: true,
  author: true,
  sequence: true,
  heText: true,
  heVersionTitle: true,
  heLicense: true,
  enText: true,
  enVersionTitle: true,
  enLicense: true,
  ptText: true,
  ptVersionTitle: true,
  ptLicense: true,
  anchors: true,
  parashot: true,
  contentHash: true,
} satisfies Prisma.StudyTextSelect;

/** Trechos com texto em cada idioma, por parashá e trilha. */
export type ReadyMap = Map<string, Map<JourneyTrack, { ready: number; total: number }>>;

/**
 * Categoria do sevivon → trilhas do Golem World de onde saem as perguntas de molde
 * (Fase 12: as perguntas das trilhas também caem no sevivon).
 */
export const CATEGORY_TRACKS: Readonly<Record<CategoryId, readonly JourneyTrack[]>> = {
  torah: ['torah', 'commentators'],
  neviim_ketuvim: [],
  mishnah: ['mishnah'],
  talmud: ['talmud'],
  halakhah: ['mitzvot'],
  midrash_aggadah: ['midrash', 'kabbalah'],
};

/** Perguntas que vêm prontas do banco (Fase 12) ou do motor de IA: as que não são de molde. */
export const POOL_ORIGINS = ['llm', 'bank'] as const;

export interface PickInput {
  userId: string;
  parashaIds: readonly string[];
  track: JourneyTrack;
  difficulty: Difficulty;
  /** Revisão (casa de estudos): mistura parashiot e inclui "em qual parashá?". */
  review?: boolean;
  /** Para a roleta: grava a pergunta nesta categoria. */
  category?: CategoryId;
  locale: Locale;
}

function sha(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

/** Alternativas em hebraico vão da direita para a esquerda. */
export function optionsDirection(options: readonly string[]): 'ltr' | 'rtl' {
  const he = options.join('').match(/[֐-׿]/g)?.length ?? 0;
  const latin = options.join('').match(/[A-Za-zÀ-ÿ]/g)?.length ?? 0;
  return he > latin ? 'rtl' : 'ltr';
}

@Injectable()
export class QuestionFactory {
  private readonly segmentCache = new Map<string, { at: number; rows: StudySeg[] }>();
  private availabilityCache: { at: number; map: Map<string, Set<JourneyTrack>> } | null = null;
  private readonly readyCache = new Map<Locale, { at: number; map: ReadyMap }>();

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(RANDOM) private readonly random: RandomSource,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  invalidate(): void {
    this.segmentCache.clear();
    this.availabilityCache = null;
    this.readyCache.clear();
  }

  /** Depois de traduzir: os trechos e a prontidão daquele idioma são relidos. */
  invalidateLocale(locale: Locale): void {
    for (const key of [...this.segmentCache.keys()]) if (key.endsWith(`:${locale}`)) this.segmentCache.delete(key);
    this.readyCache.delete(locale);
  }

  /** Quantos trechos de cada parashá/trilha já têm texto no idioma (cache de 30 s). */
  async readiness(locale: Locale): Promise<ReadyMap> {
    const now = this.clock.now().getTime();
    const hit = this.readyCache.get(locale);
    if (hit && now - hit.at < READY_TTL_MS) return hit.map;
    const rows = await this.prisma.$queryRaw<{ parasha: string; track: JourneyTrack; ready: number; total: number }[]>`
      SELECT p AS parasha, s.track,
        count(*) FILTER (WHERE CASE
          WHEN ${locale} = 'he' THEN s."heText" IS NOT NULL
          WHEN ${locale} = 'pt' THEN s."ptText" IS NOT NULL OR t.id IS NOT NULL
          ELSE s."enText" IS NOT NULL OR t.id IS NOT NULL END)::int AS ready,
        count(*)::int AS total
      FROM "StudyText" s
      CROSS JOIN unnest(s.parashot) p
      LEFT JOIN "SegmentTranslation" t
        ON t."studyTextId" = s.id AND t.locale = ${locale} AND t."sourceHash" = s."contentHash"
      GROUP BY 1, 2`;
    const map: ReadyMap = new Map();
    for (const r of rows) {
      let tracks = map.get(r.parasha);
      if (!tracks) map.set(r.parasha, (tracks = new Map()));
      tracks.set(r.track, { ready: r.ready, total: r.total });
    }
    this.readyCache.set(locale, { at: now, map });
    return map;
  }

  /** A parashá já tem os versículos (e, se for trilha, trechos suficientes) no idioma? */
  static isReady(map: ReadyMap, parashaId: string, track: JourneyTrack, minTrack = TRACK_READY_MIN): boolean {
    const tracks = map.get(parashaId);
    const verses = tracks?.get('torah');
    if (!verses || verses.total === 0 || verses.ready < verses.total * VERSES_READY_SHARE) return false;
    if (track === 'torah') return true;
    const t = tracks!.get(track);
    return !!t && t.ready >= Math.min(minTrack, t.total);
  }

  /** Trilhas com conteúdo em cada parashá (textos ingeridos ou perguntas aprovadas). */
  async availability(): Promise<Map<string, Set<JourneyTrack>>> {
    const now = this.clock.now().getTime();
    if (this.availabilityCache && now - this.availabilityCache.at < AVAILABILITY_TTL_MS) return this.availabilityCache.map;
    const rows = await this.prisma.$queryRaw<{ parasha: string; track: JourneyTrack }[]>`
      SELECT DISTINCT p AS parasha, s.track FROM "StudyText" s, unnest(s.parashot) p
      UNION
      SELECT DISTINCT p AS parasha, q.track FROM "Question" q, unnest(q.parashot) p
      WHERE q.status = 'approved' AND q.track IS NOT NULL`;
    const map = new Map<string, Set<JourneyTrack>>();
    for (const r of rows) {
      let set = map.get(r.parasha);
      if (!set) map.set(r.parasha, (set = new Set()));
      set.add(r.track);
    }
    // Sem os versículos não há moldes para os subcaminhos (os distratores são versículos).
    for (const [parasha, set] of map) if (!set.has('torah')) map.set(parasha, new Set());
    this.availabilityCache = { at: now, map };
    return map;
  }

  async hasContent(parashaId: string, track: JourneyTrack): Promise<boolean> {
    return (await this.availability()).get(parashaId)?.has(track) ?? false;
  }

  /** Trechos de uma parashá/trilha, com a tradução guardada para o idioma (se estiver em dia). */
  async segments(parashaId: string, track: JourneyTrack, locale: Locale): Promise<StudySeg[]> {
    const key = `${parashaId}:${track}:${locale}`;
    const now = this.clock.now().getTime();
    const hit = this.segmentCache.get(key);
    if (hit && now - hit.at < SEGMENT_TTL_MS) return hit.rows;
    const raw = await this.prisma.studyText.findMany({
      where: { track, parashot: { has: parashaId } },
      orderBy: [{ bookTitle: 'asc' }, { sequence: 'asc' }],
      select: {
        ...STUDY_SELECT,
        translations: locale === 'he' ? false : { where: { locale }, select: { text: true, sourceHash: true, license: true } },
      },
      take: 4000,
    });
    const rows: StudySeg[] = raw.map(({ translations, contentHash, ...r }) => {
      const tr = (translations as { text: string; sourceHash: string; license: string | null }[] | undefined)?.[0];
      return { ...r, tr: tr && tr.sourceHash === contentHash ? { text: tr.text, license: tr.license } : null };
    });
    if (this.segmentCache.size > 400) this.segmentCache.clear();
    this.segmentCache.set(key, { at: now, rows });
    return rows;
  }

  private async poolQuestion(db: Db, input: PickInput): Promise<Question | null> {
    const base: Prisma.QuestionWhereInput = {
      status: 'approved',
      origin: { in: [...POOL_ORIGINS] },
      track: input.track,
      parashot: { hasSome: [...input.parashaIds] },
      OR: [{ locale: questionLocale(input.locale) }, { translations: { some: { locale: input.locale } } }],
    };
    for (const difficulty of difficultyNeighbors(input.difficulty).slice(0, 2)) {
      const where: Prisma.QuestionWhereInput = {
        ...base,
        difficulty,
        journeyAnswers: { none: { userId: input.userId } },
        plays: { none: { userId: input.userId } },
      };
      const count = await db.question.count({ where });
      if (count) return db.question.findFirst({ where, orderBy: { id: 'asc' }, skip: this.random.int(count) });
    }
    return null;
  }

  /** Monta perguntas de molde e devolve a primeira que o jogador ainda não viu. */
  private async templateQuestion(db: Db, input: PickInput): Promise<Question | null> {
    const candidates: { q: TemplateQuestion; parashot: string[]; key: string }[] = [];
    const order = [...input.parashaIds].sort(() => this.random.int(3) - 1);
    for (let i = 0; i < 6 && order.length; i++) {
      const parashaId = order[i % order.length]!;
      const verses = await this.segments(parashaId, 'torah', input.locale);
      if (verses.length < 6) continue;
      const segments = input.track === 'torah' ? verses : await this.segments(parashaId, input.track, input.locale);
      if (!segments.length) continue;
      const q = buildTemplateQuestion(
        input.track,
        { verses, segments, parashaId, difficulty: input.difficulty, rng: this.random, locale: input.locale },
        { review: !!input.review },
      );
      if (!q) continue;
      const key = sha(`template|${q.fingerprint}`);
      if (candidates.some((c) => c.key === key)) continue;
      candidates.push({ q, parashot: [parashaId], key });
    }
    if (!candidates.length) return null;
    const existing = await db.question.findMany({
      where: { dedupeKey: { in: candidates.map((c) => c.key) } },
      select: {
        id: true,
        dedupeKey: true,
        status: true,
        _count: { select: { journeyAnswers: { where: { userId: input.userId } }, plays: { where: { userId: input.userId } } } },
      },
    });
    const byKey = new Map(existing.map((e) => [e.dedupeKey, e]));
    for (const c of candidates) {
      const row = byKey.get(c.key);
      if (row && (row.status !== 'approved' || row._count.journeyAnswers + row._count.plays > 0)) continue;
      if (row) return db.question.findUniqueOrThrow({ where: { id: row.id } });
      return this.persist(db, c.q, c.parashot, input, c.key);
    }
    // Todas já vistas: repete a primeira (uma pergunta retirada por denúncia nunca volta).
    const reusable = candidates.find((c) => byKey.get(c.key)?.status === 'approved');
    return reusable ? db.question.findUniqueOrThrow({ where: { id: byKey.get(reusable.key)!.id } }) : null;
  }

  private async persist(db: Db, q: TemplateQuestion, parashot: string[], input: PickInput, key: string): Promise<Question> {
    const data: Prisma.QuestionUncheckedCreateInput = {
      studyTextId: q.studyTextId,
      category: input.category ?? TRACKS[input.track].category,
      origin: 'template',
      template: q.template,
      locale: questionLocale(input.locale),
      machineTranslated: q.machineTranslated,
      track: input.track,
      parashot,
      text: q.text,
      options: q.options,
      correctIndex: q.correctIndex,
      explanation: q.explanation,
      sourceRef: q.sourceRef,
      evidenceQuote: q.evidenceQuote,
      evidenceLanguage: q.evidenceLanguage,
      aiDifficulty: q.difficulty,
      difficulty: q.difficulty,
      difficultyRationale: `Molde "${q.template}" (montado por código a partir do texto${q.machineTranslated ? ' traduzido automaticamente' : ''}).`,
      status: 'approved',
      contextLabel: q.context?.label ?? null,
      contextText: q.context?.text ?? null,
      contextLanguage: q.context?.language ?? null,
      versionTitle: q.versionTitle,
      license: q.license,
      dedupeKey: key,
    };
    return db.question.upsert({ where: { dedupeKey: key }, create: data, update: {} });
  }

  /** Pergunta para uma fase do Golem World. */
  async journeyQuestion(db: Db, input: PickInput): Promise<Question> {
    if (this.random.int(1000) < LLM_SHARE * 1000) {
      const pooled = await this.poolQuestion(db, input);
      if (pooled) return pooled;
    }
    for (const difficulty of [input.difficulty, ...DIFFICULTIES.filter((d) => d !== input.difficulty)]) {
      const q = await this.templateQuestion(db, { ...input, difficulty });
      if (q) return q;
    }
    const pooled = await this.poolQuestion(db, input);
    if (pooled) return pooled;
    const any = await db.question.findFirst({
      where: {
        status: 'approved',
        track: input.track,
        parashot: { hasSome: [...input.parashaIds] },
        OR: [{ locale: questionLocale(input.locale) }, { translations: { some: { locale: input.locale } } }],
      },
      orderBy: { timesServed: 'asc' },
    });
    if (any) return any;
    throw Errors.unprocessable('NO_QUESTIONS', 'Ainda não há textos desta fase neste idioma.');
  }

  /**
   * Pergunta de molde para o sevivon, de uma das trilhas da categoria (CATEGORY_TRACKS).
   * Devolve null se não houver textos dessa categoria no idioma.
   */
  async wheelQuestion(db: Db, input: { userId: string; category: CategoryId; difficulty: Difficulty; locale: Locale }): Promise<Question | null> {
    const ready = await this.readiness(input.locale);
    const options = CATEGORY_TRACKS[input.category]
      .map((track) => ({ track, parashot: PARASHOT.filter((p) => QuestionFactory.isReady(ready, p.id, track)).map((p) => p.id) }))
      .filter((o) => o.parashot.length > 0);
    if (!options.length) return null;
    const { track, parashot } = options[this.random.int(options.length)]!;
    const chosen = Array.from({ length: Math.min(3, parashot.length) }, () => parashot[this.random.int(parashot.length)]!);
    return this.templateQuestion(db, {
      userId: input.userId,
      parashaIds: chosen,
      track,
      difficulty: input.difficulty,
      review: track === 'torah',
      category: input.category,
      locale: input.locale,
    });
  }
}
