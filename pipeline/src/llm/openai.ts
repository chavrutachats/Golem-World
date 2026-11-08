/**
 * Provedor OpenAI via Responses API com `text.format` = json_schema.
 *
 * A Batch API da OpenAI (upload de arquivo JSONL) ainda não está implementada aqui;
 * com este provedor o pipeline roda sempre em modo síncrono.
 */
import OpenAI from 'openai';
import { LlmOutputError, type LlmProvider, type StructuredRequest, type StructuredResponse } from './types.js';

export interface OpenAiProviderOptions {
  apiKey: string;
  model: string;
  client?: OpenAI;
}

export class OpenAiProvider implements LlmProvider {
  readonly name = 'openai';
  readonly model: string;
  private readonly client: OpenAI;

  constructor(options: OpenAiProviderOptions) {
    this.model = options.model;
    this.client = options.client ?? new OpenAI({ apiKey: options.apiKey, maxRetries: 4 });
  }

  async complete(req: StructuredRequest): Promise<StructuredResponse> {
    const response = await this.client.responses.create({
      model: this.model,
      instructions: req.system,
      input: req.user,
      max_output_tokens: req.maxOutputTokens,
      text: {
        format: { type: 'json_schema', name: req.schemaName, schema: req.jsonSchema, strict: false },
      },
      ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
    });
    if (response.status === 'incomplete') {
      throw new LlmOutputError(
        `Resposta incompleta (${response.incomplete_details?.reason ?? 'motivo desconhecido'}).`,
        response.output_text,
      );
    }
    return {
      text: response.output_text,
      ...(response.usage
        ? { usage: { inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens } }
        : {}),
      stopReason: response.status ?? null,
    };
  }
}
