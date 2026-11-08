/**
 * Interface comum aos provedores de LLM. O resto do pipeline só conhece estes tipos,
 * então trocar Anthropic por OpenAI (ou usar um para gerar e outro para verificar)
 * é só configuração.
 */

export interface StructuredRequest {
  system: string;
  user: string;
  /** JSON Schema já adaptado ao que o provedor aceita (ver json-schema.ts). */
  jsonSchema: Record<string, unknown>;
  /** Nome curto do formato (exigido pela OpenAI). */
  schemaName: string;
  maxOutputTokens: number;
  temperature?: number;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface StructuredResponse {
  /** Texto bruto devolvido pelo modelo (deve ser JSON). */
  text: string;
  usage?: TokenUsage;
  stopReason?: string | null;
}

export type BatchResultItem =
  | { customId: string; ok: true; response: StructuredResponse }
  | { customId: string; ok: false; error: string };

export interface BatchStatus {
  ended: boolean;
  counts?: Record<string, number>;
}

/** Processamento assíncrono em lote (ex.: Message Batches API da Anthropic, ~50% mais barato). */
export interface BatchCapability {
  submit(requests: { customId: string; request: StructuredRequest }[]): Promise<{ batchId: string }>;
  status(batchId: string): Promise<BatchStatus>;
  results(batchId: string): AsyncIterable<BatchResultItem>;
}

export interface LlmProvider {
  readonly name: string;
  readonly model: string;
  complete(request: StructuredRequest): Promise<StructuredResponse>;
  readonly batch?: BatchCapability;
}

export class LlmOutputError extends Error {
  constructor(
    message: string,
    readonly raw?: string,
  ) {
    super(message);
    this.name = 'LlmOutputError';
  }
}
