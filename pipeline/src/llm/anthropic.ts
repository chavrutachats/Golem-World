/**
 * Provedor Anthropic (Claude) com saída estruturada via `output_config.format`
 * e suporte à Message Batches API (processamento assíncrono com ~50% de desconto).
 *
 * O prompt de sistema é marcado para cache (`cache_control`): ele é idêntico em
 * todas as chamadas de um lote, então as chamadas seguintes pagam menos por ele.
 */
import Anthropic from '@anthropic-ai/sdk';
import {
  LlmOutputError,
  type BatchCapability,
  type BatchResultItem,
  type LlmProvider,
  type StructuredRequest,
  type StructuredResponse,
} from './types.js';

export interface AnthropicProviderOptions {
  apiKey: string;
  model: string;
  /** Injetável em testes. */
  client?: Anthropic;
}

export function buildAnthropicParams(model: string, req: StructuredRequest): Anthropic.MessageCreateParamsNonStreaming {
  return {
    model,
    max_tokens: req.maxOutputTokens,
    system: [{ type: 'text', text: req.system, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: req.user }],
    output_config: { format: { type: 'json_schema', schema: req.jsonSchema } },
    ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
  };
}

export function anthropicMessageToResponse(message: Anthropic.Message): StructuredResponse {
  const text = message.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('');
  if (message.stop_reason === 'max_tokens') {
    throw new LlmOutputError('Resposta cortada por limite de tokens (aumente LLM_MAX_OUTPUT_TOKENS).', text);
  }
  if (message.stop_reason === 'refusal') {
    throw new LlmOutputError('O modelo recusou a solicitação.', text);
  }
  return {
    text,
    usage: { inputTokens: message.usage.input_tokens, outputTokens: message.usage.output_tokens },
    stopReason: message.stop_reason,
  };
}

export class AnthropicProvider implements LlmProvider {
  readonly name = 'anthropic';
  readonly model: string;
  readonly batch: BatchCapability;
  private readonly client: Anthropic;

  constructor(options: AnthropicProviderOptions) {
    this.model = options.model;
    this.client = options.client ?? new Anthropic({ apiKey: options.apiKey, maxRetries: 4 });
    const client = this.client;
    const model = this.model;

    this.batch = {
      async submit(requests) {
        const batch = await client.messages.batches.create({
          requests: requests.map((r) => ({ custom_id: r.customId, params: buildAnthropicParams(model, r.request) })),
        });
        return { batchId: batch.id };
      },
      async status(batchId) {
        const batch = await client.messages.batches.retrieve(batchId);
        return {
          ended: batch.processing_status === 'ended',
          counts: { ...batch.request_counts },
        };
      },
      async *results(batchId): AsyncIterable<BatchResultItem> {
        for await (const item of await client.messages.batches.results(batchId)) {
          const result = item.result;
          if (result.type === 'succeeded') {
            try {
              yield { customId: item.custom_id, ok: true, response: anthropicMessageToResponse(result.message) };
            } catch (error) {
              yield { customId: item.custom_id, ok: false, error: (error as Error).message };
            }
          } else if (result.type === 'errored') {
            yield { customId: item.custom_id, ok: false, error: `errored: ${JSON.stringify(result.error)}` };
          } else {
            yield { customId: item.custom_id, ok: false, error: result.type };
          }
        }
      },
    };
  }

  async complete(request: StructuredRequest): Promise<StructuredResponse> {
    const message = await this.client.messages.create(buildAnthropicParams(this.model, request));
    return anthropicMessageToResponse(message);
  }
}
