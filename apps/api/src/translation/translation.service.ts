/**
 * Traduções automáticas guardadas no servidor (Fase 8).
 *
 * - `ensureSegments`: traduz para pt/en os textos de estudo que ainda não têm texto
 *   nesse idioma (nem do Sefaria nem tradução em dia). Cada trecho é traduzido uma
 *   vez só, para todos os jogadores, e refeito se o Sefaria mudar o original.
 * - `ensureQuestion`: traduz uma pergunta do motor de IA (escrita em português).
 * - `prepare`/`status`: o preparo de uma fase ou partida roda em segundo plano e o
 *   app acompanha o progresso enquanto mostra a tela de "como jogar".
 *
 * Toda tradução passa pelas checagens de @trivia/shared antes de ir para o banco;
 * a reprovada é descartada (o trecho fica de fora da fase, sem misturar idioma).
 */
import { createHash } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { PrismaClient, Question } from '@trivia/db';
import {
  TRANSLATION_PROMPT_VERSION,
  checkQuestionTranslation,
  checkSegmentTranslation,
  parseQuestionLocale,
  type Locale,
  type QuestionToTranslate,
  type SegmentToTranslate,
  type TranslatedLocale,
} from '@trivia/shared';
import { PRISMA } from '../common/infra.js';
import { TRANSLATOR, type Translator } from './translator.js';

/** Trechos por pedido ao modelo e limite de letras do original por pedido. */
const BATCH_SIZE = 12;
const BATCH_CHARS = 6_000;
/** Preparos guardados na memória (os terminados somem depois disto). */
const PREP_TTL_MS = 10 * 60_000;

export interface PrepState {
  status: 'preparing' | 'ready' | 'failed';
  done: number;
  total: number;
  error?: string;
  updatedAt: number;
}

export interface EnsureResult {
  translated: number;
  failed: number;
  skipped: number;
}

export function questionSourceHash(q: Pick<Question, 'text' | 'options' | 'explanation' | 'evidenceQuote' | 'contextLabel' | 'contextText'>): string {
  return createHash('sha256')
    .update(JSON.stringify([q.text, q.options, q.explanation, q.evidenceQuote, q.contextLabel, q.contextText]))
    .digest('hex');
}

/** Corre `tasks` com no máximo `limit` ao mesmo tempo. */
async function pool<T>(items: readonly T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const item = items[next++]!;
      await fn(item);
    }
  });
  await Promise.all(workers);
}

@Injectable()
export class TranslationService {
  private readonly log = new Logger('Translation');
  private readonly preps = new Map<string, PrepState>();
  /** Trechos sendo traduzidos agora (evita traduzir o mesmo duas vezes). */
  private readonly inFlight = new Map<string, Promise<void>>();
  concurrency = 4;

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(TRANSLATOR) private readonly translator: Translator,
  ) {}

  get enabled(): boolean {
    return this.translator.enabled;
  }

  // -------------------------------------------------------------------------
  // Textos de estudo
  // -------------------------------------------------------------------------

  /** Quais destes trechos ainda precisam de tradução para `locale`. */
  async missingSegments(ids: readonly string[], locale: TranslatedLocale): Promise<string[]> {
    if (!ids.length) return [];
    const rows = await this.prisma.studyText.findMany({
      where: { id: { in: [...ids] } },
      select: {
        id: true,
        heText: true,
        enText: true,
        ptText: true,
        contentHash: true,
        translations: { where: { locale }, select: { sourceHash: true } },
      },
    });
    return rows
      .filter((r) => {
        const native = locale === 'pt' ? r.ptText : r.enText;
        if (native?.trim()) return false;
        // Sem original nem tradução inglesa não há o que traduzir.
        if (!r.heText?.trim() && !r.enText?.trim()) return false;
        const tr = r.translations[0];
        return !tr || tr.sourceHash !== r.contentHash;
      })
      .map((r) => r.id);
  }

  /**
   * Traduz os trechos que faltam. `onProgress` recebe quantos trechos já foram
   * resolvidos (traduzidos ou descartados).
   */
  async ensureSegments(ids: readonly string[], locale: TranslatedLocale, onProgress?: (resolved: number) => void): Promise<EnsureResult> {
    const result: EnsureResult = { translated: 0, failed: 0, skipped: 0 };
    if (!this.translator.enabled) {
      result.skipped = ids.length;
      return result;
    }
    const missing = await this.missingSegments(ids, locale);
    const waiting: Promise<void>[] = [];
    const mine: string[] = [];
    for (const id of missing) {
      const running = this.inFlight.get(`${locale}:${id}`);
      if (running) waiting.push(running);
      else mine.push(id);
    }
    const rows = await this.prisma.studyText.findMany({
      where: { id: { in: mine } },
      select: { id: true, ref: true, heText: true, heLicense: true, enText: true, enLicense: true, contentHash: true },
      orderBy: [{ bookTitle: 'asc' }, { sequence: 'asc' }],
    });
    const batches: (typeof rows)[] = [];
    let current: typeof rows = [];
    let chars = 0;
    for (const r of rows) {
      const size = (r.heText?.length ?? 0) + (r.enText?.length ?? 0);
      if (current.length && (current.length >= BATCH_SIZE || chars + size > BATCH_CHARS)) {
        batches.push(current);
        current = [];
        chars = 0;
      }
      current.push(r);
      chars += size;
    }
    if (current.length) batches.push(current);

    let resolved = 0;
    const settle = (n: number) => {
      resolved += n;
      onProgress?.(resolved);
    };
    const release: (() => void)[] = [];
    for (const r of rows) {
      let done!: () => void;
      this.inFlight.set(`${locale}:${r.id}`, new Promise<void>((res) => (done = res)));
      release.push(() => {
        this.inFlight.delete(`${locale}:${r.id}`);
        done();
      });
    }
    try {
      await pool(batches, this.concurrency, async (batch) => {
        const items: SegmentToTranslate[] = batch.map((r) => ({ id: r.id, ref: r.ref, he: r.heText, en: r.enText }));
        const ok = await this.translateBatch(locale, items, batch);
        result.translated += ok;
        result.failed += batch.length - ok;
        settle(batch.length);
      });
    } finally {
      release.forEach((f) => f());
    }
    await Promise.all(waiting);
    settle(waiting.length);
    return result;
  }

  /** Um pedido ao modelo; o que voltar reprovado é tentado de novo sozinho, uma vez. */
  private async translateBatch(
    locale: TranslatedLocale,
    items: SegmentToTranslate[],
    rows: { id: string; heLicense: string | null; enLicense: string | null; contentHash: string }[],
  ): Promise<number> {
    const byId = new Map(rows.map((r) => [r.id, r]));
    const good = new Map<string, string>();
    const retry: SegmentToTranslate[] = [];
    try {
      const out = await this.translator.translateSegments(locale, items);
      const texts = new Map(out.map((o) => [o.id, o.text]));
      for (const item of items) {
        const text = texts.get(item.id);
        if (text !== undefined && !checkSegmentTranslation(item, text, locale)) good.set(item.id, text.trim());
        else retry.push(item);
      }
    } catch (err) {
      this.log.warn(`Lote de ${items.length} trecho(s) falhou: ${(err as Error).message}`);
      retry.push(...items);
    }
    // Se o pedido inteiro falhou (rede, chave), um trecho testa o caminho antes de insistir nos outros.
    let providerDown = false;
    const retryOne = async (item: SegmentToTranslate) => {
      if (providerDown) return;
      try {
        const [out] = await this.translator.translateSegments(locale, [item]);
        if (out && out.id === item.id && !checkSegmentTranslation(item, out.text, locale)) good.set(item.id, out.text.trim());
        else this.log.warn(`Tradução de ${item.ref} reprovada nas checagens.`);
      } catch (err) {
        providerDown = true;
        this.log.warn(`Tradução de ${item.ref} falhou: ${(err as Error).message}`);
      }
    };
    if (retry.length) {
      await retryOne(retry[0]!);
      await pool(retry.slice(1), this.concurrency, retryOne);
    }
    for (const [id, text] of good) {
      const row = byId.get(id)!;
      // A tradução herda a licença do original (e do apoio inglês, quando houver).
      const license = row.enLicense && row.enLicense !== row.heLicense ? `${row.heLicense ?? 'unknown'} + ${row.enLicense}` : row.heLicense;
      const data = {
        text,
        sourceHash: row.contentHash,
        license: license?.slice(0, 80) ?? null,
        provider: this.translator.provider,
        model: this.translator.model,
        promptVersion: TRANSLATION_PROMPT_VERSION,
        status: 'machine',
      };
      await this.prisma.segmentTranslation.upsert({
        where: { studyTextId_locale: { studyTextId: id, locale } },
        create: { studyTextId: id, locale, ...data },
        update: data,
      });
    }
    return good.size;
  }

  // -------------------------------------------------------------------------
  // Perguntas do motor de IA
  // -------------------------------------------------------------------------

  /** A pergunta já pode ser servida neste idioma? */
  async questionReady(question: Question, locale: Locale): Promise<boolean> {
    if (parseQuestionLocale(question.locale) === locale) return true;
    const tr = await this.prisma.questionTranslation.findUnique({
      where: { questionId_locale: { questionId: question.id, locale } },
      select: { sourceHash: true },
    });
    return !!tr && tr.sourceHash === questionSourceHash(question);
  }

  /** Traduz a pergunta se preciso. Devolve false se não deu (desligado ou reprovada). */
  async ensureQuestion(question: Question, locale: Locale): Promise<boolean> {
    if (await this.questionReady(question, locale)) return true;
    if (!this.translator.enabled) return false;
    const key = `q:${locale}:${question.id}`;
    const running = this.inFlight.get(key);
    if (running) {
      await running;
      return this.questionReady(question, locale);
    }
    let done!: () => void;
    this.inFlight.set(key, new Promise<void>((res) => (done = res)));
    try {
      const source: QuestionToTranslate = {
        id: question.id,
        text: question.text,
        options: question.options,
        explanation: question.explanation,
        evidenceQuote: question.evidenceQuote,
        contextLabel: question.contextLabel,
        contextText: question.contextText,
      };
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const out = await this.translator.translateQuestion(locale, source);
          const problem = checkQuestionTranslation(source, out, locale);
          if (problem) {
            this.log.warn(`Tradução da pergunta ${question.id} reprovada (${problem}).`);
            continue;
          }
          const data = {
            text: out.text.trim(),
            options: out.options.map((o) => o.trim()),
            explanation: out.explanation.trim(),
            evidenceQuote: out.evidenceQuote.trim(),
            contextLabel: out.contextLabel?.trim() ?? null,
            contextText: out.contextText?.trim() ?? null,
            sourceHash: questionSourceHash(question),
            provider: this.translator.provider,
            model: this.translator.model,
            promptVersion: TRANSLATION_PROMPT_VERSION,
            status: 'machine',
          };
          await this.prisma.questionTranslation.upsert({
            where: { questionId_locale: { questionId: question.id, locale } },
            create: { questionId: question.id, locale, ...data },
            update: data,
          });
          return true;
        } catch (err) {
          this.log.warn(`Tradução da pergunta ${question.id} falhou: ${(err as Error).message}`);
        }
      }
      return false;
    } finally {
      this.inFlight.delete(key);
      done();
    }
  }

  // -------------------------------------------------------------------------
  // Preparo em segundo plano
  // -------------------------------------------------------------------------

  status(key: string): PrepState | null {
    const state = this.preps.get(key);
    if (state && state.status !== 'preparing' && Date.now() - state.updatedAt > PREP_TTL_MS) {
      this.preps.delete(key);
      return null;
    }
    return state ?? null;
  }

  /**
   * Começa (ou acompanha) um preparo. `work` recebe uma função para avisar o
   * progresso; se der erro, o estado vira "failed" e um novo pedido tenta de novo.
   */
  prepare(key: string, total: number, work: (progress: (done: number) => void) => Promise<void>): PrepState {
    const existing = this.status(key);
    if (existing && existing.status !== 'failed') return existing;
    const state: PrepState = { status: total === 0 ? 'ready' : 'preparing', done: 0, total, updatedAt: Date.now() };
    this.preps.set(key, state);
    if (total === 0) return state;
    void work((done) => {
      state.done = Math.min(total, done);
      state.updatedAt = Date.now();
    })
      .then(() => {
        state.status = 'ready';
        state.done = total;
        state.updatedAt = Date.now();
      })
      .catch((err: unknown) => {
        this.log.error(`Preparo ${key} falhou: ${(err as Error).message}`);
        state.status = 'failed';
        state.error = (err as Error).message;
        state.updatedAt = Date.now();
      });
    return state;
  }

  /** Para os testes: espera os preparos em andamento terminarem. */
  async settle(): Promise<void> {
    for (let i = 0; i < 200 && [...this.preps.values()].some((p) => p.status === 'preparing'); i++) {
      await new Promise((r) => setTimeout(r, 10));
    }
  }
}
