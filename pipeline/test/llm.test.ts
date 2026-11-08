import type Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { GenerationOutputSchema } from '@trivia/shared';
import { AnthropicProvider, buildAnthropicParams } from '../src/llm/anthropic.js';
import { parseModelJson, toProviderJsonSchema } from '../src/llm/json-schema.js';
import type { StructuredRequest } from '../src/llm/types.js';

function collectKeys(node: unknown, keys = new Set<string>()): Set<string> {
  if (Array.isArray(node)) node.forEach((n) => collectKeys(n, keys));
  else if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) {
      keys.add(k);
      collectKeys(v, keys);
    }
  }
  return keys;
}

describe('toProviderJsonSchema', () => {
  const schema = toProviderJsonSchema(GenerationOutputSchema);

  it('remove restrições que a saída estruturada não aceita', () => {
    const keys = collectKeys(schema);
    for (const k of ['minLength', 'maxLength', 'minimum', 'maximum', 'maxItems', '$schema']) {
      expect(keys.has(k), k).toBe(false);
    }
  });

  it('fecha todos os objetos e preserva as regras como descrição', () => {
    expect(schema.additionalProperties).toBe(false);
    const options = (schema as any).properties.questions.items.properties.options;
    expect(options.description).toContain('exatamente 4 itens');
    expect((schema as any).properties.questions.items.additionalProperties).toBe(false);
  });
});

describe('parseModelJson', () => {
  const S = z.object({ a: z.number() });
  it('aceita JSON puro ou dentro de cerca de código', () => {
    expect(parseModelJson('{"a":1}', S)).toEqual({ a: 1 });
    expect(parseModelJson('```json\n{"a":2}\n```', S)).toEqual({ a: 2 });
  });
  it('explica o erro quando o JSON é inválido ou foge do schema', () => {
    expect(() => parseModelJson('não é json', S)).toThrow(/JSON válido/);
    expect(() => parseModelJson('{"a":"x"}', S)).toThrow(/fora do schema/);
  });
});

const request: StructuredRequest = {
  system: 'regras',
  user: 'trecho',
  jsonSchema: { type: 'object', properties: {}, additionalProperties: false },
  schemaName: 'x',
  maxOutputTokens: 1000,
};

function fakeMessage(text: string, stop: string = 'end_turn'): Anthropic.Message {
  return {
    id: 'msg_1',
    type: 'message',
    role: 'assistant',
    model: 'claude-test',
    content: [{ type: 'text', text, citations: null }],
    stop_reason: stop,
    stop_sequence: null,
    usage: { input_tokens: 10, output_tokens: 5 },
  } as unknown as Anthropic.Message;
}

describe('AnthropicProvider', () => {
  it('monta a chamada com saída estruturada e cache do prompt de sistema', () => {
    const params = buildAnthropicParams('claude-test', request);
    expect(params.output_config).toEqual({ format: { type: 'json_schema', schema: request.jsonSchema } });
    expect(params.system).toEqual([{ type: 'text', text: 'regras', cache_control: { type: 'ephemeral' } }]);
    expect(params.messages).toEqual([{ role: 'user', content: 'trecho' }]);
    expect(params).not.toHaveProperty('temperature');
  });

  it('devolve o texto e o consumo de tokens', async () => {
    const client = { messages: { create: async () => fakeMessage('{"ok":true}') } } as unknown as Anthropic;
    const provider = new AnthropicProvider({ apiKey: 'x', model: 'claude-test', client });
    await expect(provider.complete(request)).resolves.toMatchObject({
      text: '{"ok":true}',
      usage: { inputTokens: 10, outputTokens: 5 },
    });
  });

  it('acusa resposta cortada por limite de tokens', async () => {
    const client = { messages: { create: async () => fakeMessage('{"ok":', 'max_tokens') } } as unknown as Anthropic;
    const provider = new AnthropicProvider({ apiKey: 'x', model: 'claude-test', client });
    await expect(provider.complete(request)).rejects.toThrow(/limite de tokens/);
  });

  it('usa a Message Batches API para enviar, consultar e coletar', async () => {
    const created: unknown[] = [];
    const client = {
      messages: {
        batches: {
          create: async (body: unknown) => {
            created.push(body);
            return { id: 'msgbatch_1' };
          },
          retrieve: async () => ({ processing_status: 'ended', request_counts: { succeeded: 1, errored: 1 } }),
          results: async () =>
            (async function* () {
              yield { custom_id: 'a', result: { type: 'succeeded', message: fakeMessage('{"x":1}') } };
              yield { custom_id: 'b', result: { type: 'errored', error: { type: 'invalid_request_error' } } };
            })(),
        },
      },
    } as unknown as Anthropic;
    const provider = new AnthropicProvider({ apiKey: 'x', model: 'claude-test', client });
    await expect(provider.batch.submit([{ customId: 'a', request }])).resolves.toEqual({ batchId: 'msgbatch_1' });
    expect((created[0] as any).requests[0]).toMatchObject({ custom_id: 'a', params: { model: 'claude-test' } });
    await expect(provider.batch.status('msgbatch_1')).resolves.toMatchObject({ ended: true });
    const items = [];
    for await (const item of provider.batch.results('msgbatch_1')) items.push(item);
    expect(items).toEqual([
      { customId: 'a', ok: true, response: expect.objectContaining({ text: '{"x":1}' }) },
      { customId: 'b', ok: false, error: expect.stringContaining('invalid_request_error') },
    ]);
  });
});
