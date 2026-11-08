/**
 * Escolha da pergunta servida a um jogador.
 *
 * 1. Sorteia o nível com pesos que acompanham a taxa de acerto recente do jogador
 *    (disputa de selo puxa para perguntas mais difíceis).
 * 2. Procura perguntas aprovadas da categoria, nesse nível, que o jogador ainda não viu;
 *    sem resultado, tenta os níveis vizinhos.
 * 3. Nas categorias com textos do Sefaria ingeridos (Torá, Mishná, Talmud, Midrash),
 *    parte das perguntas é montada NA HORA por moldes (QuestionFactory), e elas
 *    assumem de vez quando o jogador já viu todas as perguntas do motor de IA.
 * 4. Se o jogador já viu tudo, aceita repetir (melhor do que travar a partida).
 *
 * Fase 8: só entram perguntas no idioma do jogador (escritas nele ou com tradução)
 * e moldes de parashiot cujos textos já estão nesse idioma.
 */
import { Inject, Injectable } from '@nestjs/common';
import type { Prisma, PrismaClient, Question } from '@trivia/db';
import { CATEGORY_IDS, PARASHOT, questionLocale, type CategoryId, type Locale } from '@trivia/shared';
import { Errors } from '../common/http.js';
import { CLOCK, PRISMA, RANDOM, type Clock, type RandomSource } from '../common/infra.js';
import { CATEGORY_TRACKS, POOL_ORIGINS, QuestionFactory } from '../questions/question-factory.service.js';
import { difficultyFallbackOrder, difficultyWeights, drawDifficulty } from './rules.js';

type Db = PrismaClient | Prisma.TransactionClient;

const ACCURACY_WINDOW = 50;
const ACCURACY_MIN_SAMPLES = 5;
const AVAILABILITY_TTL_MS = 60_000;
/** Chance de servir uma pergunta de molde mesmo havendo pergunta inédita do motor. */
const TEMPLATE_SHARE = 0.35;

@Injectable()
export class QuestionSelector {
  private readonly availability = new Map<Locale, { at: number; categories: CategoryId[] }>();

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(RANDOM) private readonly random: RandomSource,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(QuestionFactory) private readonly factory: QuestionFactory,
  ) {}

  /** Categorias com ao menos uma pergunta aprovada no idioma (cache de 1 minuto). */
  async availableCategories(locale: Locale): Promise<CategoryId[]> {
    const now = this.clock.now().getTime();
    const hit = this.availability.get(locale);
    if (hit && now - hit.at < AVAILABILITY_TTL_MS) return hit.categories;
    const rows = await this.prisma.question.groupBy({
      by: ['category'],
      where: { status: 'approved', category: { not: null }, origin: { in: [...POOL_ORIGINS] }, ...this.inLocale(locale) },
    });
    const present = new Set(rows.map((r) => r.category));
    const ready = await this.factory.readiness(locale);
    for (const [category, tracks] of Object.entries(CATEGORY_TRACKS)) {
      if (tracks.some((track) => PARASHOT.some((p) => QuestionFactory.isReady(ready, p.id, track)))) present.add(category as CategoryId);
    }
    const categories = CATEGORY_IDS.filter((c) => present.has(c));
    this.availability.set(locale, { at: now, categories });
    return categories;
  }

  invalidateAvailability(): void {
    this.availability.clear();
  }

  /** Pergunta escrita no idioma ou com tradução para ele. */
  private inLocale(locale: Locale): Prisma.QuestionWhereInput {
    return { OR: [{ locale: questionLocale(locale) }, { translations: { some: { locale } } }] };
  }

  async recentAccuracy(db: Db, userId: string): Promise<number | null> {
    const plays = await db.questionPlay.findMany({
      where: { userId, answeredAt: { not: null } },
      orderBy: { answeredAt: 'desc' },
      take: ACCURACY_WINDOW,
      select: { isCorrect: true },
    });
    if (plays.length < ACCURACY_MIN_SAMPLES) return null;
    return plays.filter((p) => p.isCorrect).length / plays.length;
  }

  private async pickRandom(db: Db, where: Prisma.QuestionWhereInput): Promise<Question | null> {
    const count = await db.question.count({ where });
    if (count === 0) return null;
    return db.question.findFirst({ where, orderBy: { id: 'asc' }, skip: this.random.int(count) });
  }

  async pick(db: Db, input: { userId: string; category: CategoryId; isCrownChallenge: boolean; locale: Locale }): Promise<Question> {
    const accuracy = await this.recentAccuracy(db, input.userId);
    const target = drawDifficulty(difficultyWeights(accuracy, input.isCrownChallenge), this.random);
    const base: Prisma.QuestionWhereInput = { status: 'approved', category: input.category, ...this.inLocale(input.locale) };

    let fresh: Question | null = null;
    for (const difficulty of difficultyFallbackOrder(target)) {
      fresh = await this.pickRandom(db, {
        ...base,
        difficulty,
        origin: { in: [...POOL_ORIGINS] },
        plays: { none: { userId: input.userId } },
        journeyAnswers: { none: { userId: input.userId } },
      });
      if (fresh) break;
    }
    if (CATEGORY_TRACKS[input.category].length && (!fresh || this.random.int(100) < TEMPLATE_SHARE * 100)) {
      const made = await this.factory.wheelQuestion(db, { userId: input.userId, category: input.category, difficulty: target, locale: input.locale });
      if (made) return made;
    }
    if (fresh) return fresh;
    const repeat = await this.pickRandom(db, base);
    if (repeat) return repeat;
    throw Errors.unprocessable('NO_QUESTIONS', 'Ainda não há perguntas aprovadas nesta categoria.');
  }
}
