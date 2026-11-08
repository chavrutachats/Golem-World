/**
 * Converte um schema Zod no JSON Schema aceito pelos modos de saída estruturada
 * dos provedores.
 *
 * A saída estruturada da Anthropic não aceita restrições numéricas (minimum,
 * maximum), de tamanho de texto (minLength, maxLength) nem de tamanho de lista
 * além de minItems 0/1. Essas regras são removidas do schema enviado e descritas
 * em texto no campo `description`; a validação real continua sendo feita pelo Zod
 * na volta, então nada se perde.
 */
import { z } from 'zod';

type Json = Record<string, unknown>;

const UNSUPPORTED = [
  'minLength',
  'maxLength',
  'minimum',
  'maximum',
  'exclusiveMinimum',
  'exclusiveMaximum',
  'multipleOf',
  'maxItems',
  'pattern',
  'format',
] as const;

function describeConstraints(node: Json): string[] {
  const notes: string[] = [];
  const has = (k: string) => node[k] !== undefined;
  if (has('minLength') && has('maxLength')) notes.push(`entre ${node.minLength} e ${node.maxLength} caracteres`);
  else if (has('maxLength')) notes.push(`no máximo ${node.maxLength} caracteres`);
  else if (has('minLength')) notes.push(`no mínimo ${node.minLength} caracteres`);
  if (has('minimum') && has('maximum')) notes.push(`valor entre ${node.minimum} e ${node.maximum}`);
  else if (has('maximum')) notes.push(`valor no máximo ${node.maximum}`);
  else if (has('minimum')) notes.push(`valor no mínimo ${node.minimum}`);
  const minItems = typeof node.minItems === 'number' ? node.minItems : undefined;
  const maxItems = typeof node.maxItems === 'number' ? node.maxItems : undefined;
  if (minItems !== undefined && minItems === maxItems) notes.push(`exatamente ${minItems} itens`);
  else {
    if (minItems !== undefined && minItems > 1) notes.push(`no mínimo ${minItems} itens`);
    if (maxItems !== undefined) notes.push(`no máximo ${maxItems} itens`);
  }
  return notes;
}

function sanitize(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(sanitize);
  if (!node || typeof node !== 'object') return node;
  const src = node as Json;
  const notes = describeConstraints(src);
  const out: Json = {};
  for (const [key, value] of Object.entries(src)) {
    if (key === '$schema') continue;
    if ((UNSUPPORTED as readonly string[]).includes(key)) continue;
    if (key === 'minItems' && typeof value === 'number' && value > 1) continue;
    out[key] = sanitize(value);
  }
  if (out.type === 'object') out.additionalProperties = false;
  if (notes.length) {
    const base = typeof out.description === 'string' ? `${out.description} ` : '';
    out.description = `${base}(${notes.join('; ')})`;
  }
  return out;
}

export function toProviderJsonSchema(schema: z.ZodType): Record<string, unknown> {
  return sanitize(z.toJSONSchema(schema, { io: 'output' })) as Record<string, unknown>;
}

/** Extrai e valida o JSON devolvido pelo modelo (tolerando cercas de código ```json). */
export function parseModelJson<T>(text: string, schema: z.ZodType<T>): T {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  let data: unknown;
  try {
    data = JSON.parse(trimmed);
  } catch {
    throw new Error('O modelo não devolveu JSON válido.');
  }
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    const issues = parsed.error.issues.slice(0, 5).map((i) => `${i.path.join('.') || '(raiz)'}: ${i.message}`);
    throw new Error(`JSON fora do schema: ${issues.join('; ')}`);
  }
  return parsed.data;
}
