/**
 * Provedores de tradução automática usados pela API (Fase 8).
 *
 * - anthropic: Claude pela API de mensagens, com saída estruturada (JSON Schema);
 * - fake: tradução de teste, determinística (testes e demonstração sem chave);
 * - off: sem tradução; só aparecem textos que já existem no idioma do jogador.
 *
 * O prompt, o formato e as checagens ficam em @trivia/shared (translation.ts),
 * os mesmos do pipeline.
 */
import {
  QUESTION_TRANSLATION_JSON_SCHEMA,
  QuestionTranslationOutputSchema,
  SEGMENT_TRANSLATION_JSON_SCHEMA,
  SegmentTranslationOutputSchema,
  questionSystemPrompt,
  questionUserPrompt,
  segmentSystemPrompt,
  segmentUserPrompt,
  type Locale,
  type QuestionToTranslate,
  type QuestionTranslationOutput,
  type SegmentToTranslate,
  type TranslatedLocale,
} from '@trivia/shared';

export const TRANSLATOR = Symbol('TRANSLATOR');

export interface Translator {
  readonly provider: string;
  readonly model: string;
  readonly enabled: boolean;
  translateSegments(target: TranslatedLocale, items: readonly SegmentToTranslate[]): Promise<{ id: string; text: string }[]>;
  translateQuestion(target: Locale, question: QuestionToTranslate): Promise<QuestionTranslationOutput>;
}

export class TranslationUnavailableError extends Error {
  constructor(message = 'Tradução automática desligada.') {
    super(message);
    this.name = 'TranslationUnavailableError';
  }
}

export const offTranslator: Translator = {
  provider: 'off',
  model: 'none',
  enabled: false,
  translateSegments: () => Promise.reject(new TranslationUnavailableError()),
  translateQuestion: () => Promise.reject(new TranslationUnavailableError()),
};

const FAKE_WORDS: Readonly<Record<Locale, string[]>> = {
  pt: ['tradução', 'de', 'teste', 'do', 'texto', 'original'],
  en: ['test', 'translation', 'of', 'the', 'original', 'text'],
  he: ['תרגום', 'ניסיון', 'של', 'הטקסט'],
};

/** Texto de teste com tamanho parecido com o de uma tradução real. */
function fakeText(target: Locale, ref: string, sourceChars: number): string {
  const words = FAKE_WORDS[target];
  const out: string[] = [`[${target}] ${ref}:`];
  let i = 0;
  while (out.join(' ').length < Math.max(30, sourceChars * 1.5)) out.push(words[i++ % words.length]!);
  return out.join(' ');
}

export class FakeTranslator implements Translator {
  readonly provider = 'fake';
  readonly model = 'fake-1';
  readonly enabled = true;
  calls = 0;
  /** Quantos pedidos falham de propósito (para testar o descarte). */
  failNext = 0;

  async translateSegments(target: TranslatedLocale, items: readonly SegmentToTranslate[]): Promise<{ id: string; text: string }[]> {
    this.calls++;
    if (this.failNext > 0) {
      this.failNext--;
      throw new Error('falha simulada');
    }
    return items.map((i) => ({ id: i.id, text: fakeText(target, i.ref, (i.en ?? i.he ?? '').length) }));
  }

  async translateQuestion(target: Locale, q: QuestionToTranslate): Promise<QuestionTranslationOutput> {
    this.calls++;
    const t = (s: string) => (target === 'he' ? `${FAKE_WORDS.he.join(' ')} ${s.length}` : `[${target}] ${s}`);
    return {
      text: t(q.text),
      options: q.options.map((o, i) => (target === 'he' ? `תשובה ${'אבגד'[i]} ${o.length}` : `[${target}] ${o}`)),
      explanation: t(q.explanation),
      evidenceQuote: t(q.evidenceQuote),
      contextLabel: q.contextLabel === null ? null : t(q.contextLabel),
      contextText: q.contextText === null ? null : t(q.contextText),
    };
  }
}

export interface AnthropicTranslatorOptions {
  apiKey: string;
  model: string;
  /** Injetável em testes. */
  fetch?: typeof fetch;
  timeoutMs?: number;
}

/** Claude via HTTP (sem SDK na API), com o mesmo formato de saída estruturada do pipeline. */
export class AnthropicTranslator implements Translator {
  readonly provider = 'anthropic';
  readonly enabled = true;
  readonly model: string;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: AnthropicTranslatorOptions) {
    this.model = options.model;
    this.fetchImpl = options.fetch ?? fetch;
  }

  private async complete(system: string, user: string, schema: Record<string, unknown>, maxTokens: number): Promise<unknown> {
    const res = await this.fetchImpl('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': this.options.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: maxTokens,
        temperature: 0,
        system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: user }],
        output_config: { format: { type: 'json_schema', schema } },
      }),
      signal: AbortSignal.timeout(this.options.timeoutMs ?? 90_000),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Anthropic ${res.status}: ${body.slice(0, 300)}`);
    }
    const message = (await res.json()) as { content?: { type: string; text?: string }[]; stop_reason?: string };
    if (message.stop_reason === 'max_tokens') throw new Error('Resposta cortada por limite de tokens.');
    if (message.stop_reason === 'refusal') throw new Error('O modelo recusou a tradução.');
    const text = (message.content ?? []).filter((b) => b.type === 'text').map((b) => b.text ?? '').join('');
    return JSON.parse(text) as unknown;
  }

  async translateSegments(target: TranslatedLocale, items: readonly SegmentToTranslate[]): Promise<{ id: string; text: string }[]> {
    const sourceChars = items.reduce((n, i) => n + (i.he?.length ?? 0) + (i.en?.length ?? 0), 0);
    const raw = await this.complete(
      segmentSystemPrompt(target),
      segmentUserPrompt(items),
      SEGMENT_TRANSLATION_JSON_SCHEMA,
      Math.min(16_000, 1_000 + Math.ceil(sourceChars * 1.6)),
    );
    return SegmentTranslationOutputSchema.parse(raw).items;
  }

  async translateQuestion(target: Locale, question: QuestionToTranslate): Promise<QuestionTranslationOutput> {
    const raw = await this.complete(questionSystemPrompt(target), questionUserPrompt(question), QUESTION_TRANSLATION_JSON_SCHEMA, 3_000);
    return QuestionTranslationOutputSchema.parse(raw);
  }
}
