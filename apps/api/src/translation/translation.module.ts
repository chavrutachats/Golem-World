import { Global, Inject, Injectable, Logger, Module, type OnApplicationShutdown, type OnModuleInit } from '@nestjs/common';
import type { PrismaClient } from '@trivia/db';
import { TORAH_BOOKS, TRANSLATED_LOCALES, type Locale } from '@trivia/shared';
import { PRISMA } from '../common/infra.js';
import { APP_CONFIG, type AppConfig } from '../config/app-config.js';
import { TranslationService } from './translation.service.js';
import { AnthropicTranslator, FakeTranslator, TRANSLATOR, offTranslator, type Translator } from './translator.js';

const WARM_EVERY_MS = 30_000;
const WARM_VERSES = 48;
const WARM_QUESTIONS = 6;

/**
 * Tradução aos poucos, em segundo plano, do que ainda falta: os versículos da Torá
 * (pt e en, na ordem da leitura) e as perguntas aprovadas do motor de IA (en e he).
 * Assim a tela de preparo quase nunca precisa esperar.
 */
@Injectable()
export class TranslationWarmer implements OnModuleInit, OnApplicationShutdown {
  private readonly log = new Logger('TranslationWarmer');
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(TranslationService) private readonly translations: TranslationService,
  ) {}

  onModuleInit(): void {
    this.translations.concurrency = this.config.translation.concurrency;
    if (!this.config.translation.warmer || !this.translations.enabled) return;
    this.timer = setInterval(() => void this.tick(), WARM_EVERY_MS);
    this.timer.unref();
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      for (const locale of TRANSLATED_LOCALES) {
        const ids: string[] = [];
        for (const book of TORAH_BOOKS) {
          if (ids.length >= WARM_VERSES) break;
          const rows = await this.prisma.studyText.findMany({
            where: {
              track: 'torah',
              bookTitle: book,
              heText: { not: null },
              ...(locale === 'pt' ? { ptText: null } : { enText: null }),
              translations: { none: { locale } },
            },
            orderBy: { sequence: 'asc' },
            take: WARM_VERSES - ids.length,
            select: { id: true },
          });
          ids.push(...rows.map((r) => r.id));
        }
        if (ids.length) await this.translations.ensureSegments(ids, locale);
      }
      for (const locale of ['en', 'he'] as const satisfies readonly Locale[]) {
        const questions = await this.prisma.question.findMany({
          where: { status: 'approved', origin: 'llm', locale: { not: locale }, translations: { none: { locale } } },
          orderBy: { createdAt: 'asc' },
          take: WARM_QUESTIONS,
        });
        for (const q of questions) await this.translations.ensureQuestion(q, locale);
      }
    } catch (err) {
      this.log.warn(`Rodada de tradução falhou: ${(err as Error).message}`);
    } finally {
      this.running = false;
    }
  }
}

@Global()
@Module({
  providers: [
    {
      provide: TRANSLATOR,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig): Translator => {
        const t = config.translation;
        if (t.provider === 'anthropic') return new AnthropicTranslator({ apiKey: t.apiKey, model: t.model });
        if (t.provider === 'fake') return new FakeTranslator();
        return offTranslator;
      },
    },
    TranslationService,
    TranslationWarmer,
  ],
  exports: [TRANSLATOR, TranslationService],
})
export class TranslationModule {}
