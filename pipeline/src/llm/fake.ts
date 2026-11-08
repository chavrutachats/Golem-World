/**
 * Provedor de mentira, para testes: responde com o que o `handler` devolver.
 * Também simula a Batch API em memória.
 */
import type { BatchCapability, BatchResultItem, LlmProvider, StructuredRequest, StructuredResponse } from './types.js';

export type FakeHandler = (request: StructuredRequest, callIndex: number) => unknown | Promise<unknown>;

export class FakeProvider implements LlmProvider {
  readonly name = 'fake';
  readonly calls: StructuredRequest[] = [];
  readonly batch?: BatchCapability;
  private readonly batches = new Map<string, { customId: string; request: StructuredRequest }[]>();

  constructor(
    readonly model: string,
    private readonly handler: FakeHandler,
    options: { batch?: boolean } = {},
  ) {
    if (options.batch) {
      this.batch = {
        submit: async (requests) => {
          const batchId = `fakebatch_${this.batches.size + 1}`;
          this.batches.set(batchId, requests);
          return { batchId };
        },
        status: async () => ({ ended: true }),
        results: (batchId) => this.batchResults(batchId),
      };
    }
  }

  private async *batchResults(batchId: string): AsyncIterable<BatchResultItem> {
    for (const { customId, request } of this.batches.get(batchId) ?? []) {
      try {
        yield { customId, ok: true, response: await this.complete(request) };
      } catch (error) {
        yield { customId, ok: false, error: (error as Error).message };
      }
    }
  }

  async complete(request: StructuredRequest): Promise<StructuredResponse> {
    const index = this.calls.length;
    this.calls.push(request);
    const out = await this.handler(request, index);
    return {
      text: typeof out === 'string' ? out : JSON.stringify(out),
      usage: { inputTokens: request.system.length + request.user.length, outputTokens: 100 },
    };
  }
}
