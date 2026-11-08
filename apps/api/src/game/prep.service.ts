/**
 * Preparo da roleta no idioma do jogador (Fase 8). Antes da partida, o app mostra
 * a tela de "como jogar" enquanto o servidor garante, para cada categoria, perguntas
 * nesse idioma: uma parashá com os textos prontos para os moldes (Torá, Mishná,
 * Talmud, Midrash) e algumas perguntas do motor de IA traduzidas. O resto se traduz
 * aos poucos em segundo plano (TranslationWarmer).
 */
import { Inject, Injectable } from '@nestjs/common';
import type { PrismaClient, Question } from '@trivia/db';
import { CATEGORY_IDS, PARASHOT, isTranslatedLocale, localeFromTag, questionLocale, type Locale, type PrepStatus } from '@trivia/shared';
import { PRISMA, RANDOM, type RandomSource } from '../common/infra.js';
import { journeyPrepPlan } from '../journey/prep.js';
import { CATEGORY_TRACKS, QuestionFactory } from '../questions/question-factory.service.js';
import { TranslationService } from '../translation/translation.service.js';
import { QuestionSelector } from './question-selector.service.js';

/** Perguntas do motor de IA traduzidas por categoria antes da primeira partida. */
const LLM_PER_CATEGORY = 3;

@Injectable()
export class GamePrepService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(RANDOM) private readonly random: RandomSource,
    @Inject(QuestionFactory) private readonly factory: QuestionFactory,
    @Inject(QuestionSelector) private readonly selector: QuestionSelector,
    @Inject(TranslationService) private readonly translations: TranslationService,
  ) {}

  async prepare(userId: string): Promise<PrepStatus> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { locale: true } });
    const locale: Locale = localeFromTag(user.locale);
    if (locale === 'pt') return { status: 'ready', done: 0, total: 0 };
    const key = `wheel:${locale}`;
    const running = this.translations.status(key);
    if (running?.status === 'preparing') return { status: 'preparing', done: running.done, total: running.total };

    // 1. Moldes: uma parashá pronta por trilha da roleta (em hebraico já estão todas).
    const segmentIds: string[] = [];
    if (isTranslatedLocale(locale)) {
      const readiness = await this.factory.readiness(locale);
      const availability = await this.factory.availability();
      for (const track of new Set(Object.values(CATEGORY_TRACKS).flat())) {
        if (PARASHOT.some((p) => QuestionFactory.isReady(readiness, p.id, track))) continue;
        const first = PARASHOT.find((p) => availability.get(p.id)?.has(track));
        if (!first) continue;
        const plan = await journeyPrepPlan(this.prisma, this.factory, { kind: 'parasha', parashaId: first.id, track }, locale, this.random);
        segmentIds.push(...plan.ids);
      }
    }
    const missing = isTranslatedLocale(locale) ? await this.translations.missingSegments([...new Set(segmentIds)], locale) : [];

    // 2. Perguntas do motor de IA (nascem em português).
    const toTranslate: Question[] = [];
    for (const category of CATEGORY_IDS) {
      const ready = await this.prisma.question.count({
        where: {
          status: 'approved',
          origin: 'llm',
          category,
          OR: [{ locale: questionLocale(locale) }, { translations: { some: { locale } } }],
        },
      });
      if (ready >= LLM_PER_CATEGORY) continue;
      toTranslate.push(
        ...(await this.prisma.question.findMany({
          where: { status: 'approved', origin: 'llm', category, locale: { not: questionLocale(locale) }, translations: { none: { locale } } },
          take: LLM_PER_CATEGORY - ready,
          orderBy: { timesServed: 'desc' },
        })),
      );
    }

    const total = missing.length + toTranslate.length;
    if (total === 0 || !this.translations.enabled) {
      const categories = await this.selector.availableCategories(locale);
      return { status: categories.length ? 'ready' : 'unavailable', done: 0, total: 0 };
    }
    const state = this.translations.prepare(key, total, async (progress) => {
      let questionsDone = 0;
      let segmentsDone = 0;
      const report = () => progress(segmentsDone + questionsDone);
      const segments = isTranslatedLocale(locale) && missing.length
        ? this.translations.ensureSegments(missing, locale, (n) => {
            segmentsDone = n;
            report();
          })
        : Promise.resolve();
      const questions = (async () => {
        for (const q of toTranslate) {
          await this.translations.ensureQuestion(q, locale);
          questionsDone++;
          report();
        }
      })();
      await Promise.all([segments, questions]);
      this.factory.invalidateLocale(locale);
      this.selector.invalidateAvailability();
    });
    return { status: state.status === 'ready' ? 'ready' : 'preparing', done: state.done, total: state.total };
  }
}
