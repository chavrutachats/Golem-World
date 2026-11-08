/**
 * Toda frase de erro que a API pode mostrar ao jogador existe em português, inglês
 * e hebraico (@trivia/shared/messages), e sai no idioma do Accept-Language.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { hasMessage, messageText } from '@trivia/shared';
import { describe, expect, it } from 'vitest';
import { AppError, Errors } from '../src/common/http.js';

const SRC = join(import.meta.dirname, '../src');

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? files(join(dir, e.name)) : e.name.endsWith('.ts') ? [join(dir, e.name)] : [],
  );
}

/** Texto entre o parêntese que abre em `start` e o que fecha. */
function callArgs(src: string, start: number): string {
  let depth = 0;
  for (let i = start; i < src.length; i++) {
    if (src[i] === '(') depth++;
    else if (src[i] === ')' && --depth === 0) return src.slice(start + 1, i);
  }
  return '';
}

function topLevelArgs(args: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let start = 0;
  for (let i = 0; i < args.length; i++) {
    const c = args[i]!;
    if (quote) {
      if (c === '\\') i++;
      else if (c === quote) quote = null;
    } else if (c === "'" || c === '`' || c === '"') quote = c;
    else if ('([{'.includes(c)) depth++;
    else if (')]}'.includes(c)) depth--;
    else if (c === ',' && depth === 0) {
      out.push(args.slice(start, i));
      start = i + 1;
    }
  }
  out.push(args.slice(start));
  return out;
}

/** Frases passadas a Errors.*(), new AppError() e limits.consume(), e as constantes `blocked`. */
function messagesInSource(): { file: string; text: string }[] {
  const out: { file: string; text: string }[] = [];
  for (const file of files(SRC)) {
    const src = readFileSync(file, 'utf8');
    const calls = [...src.matchAll(/(?:Errors\.\w+|new AppError|\.consume|new RateLimitedError)\(/g)];
    const chunks = calls.map((m) => {
      const args = callArgs(src, m.index + m[0].length - 1);
      // consume(regra, chave, frase): só a frase interessa.
      return m[0] === '.consume(' ? (topLevelArgs(args)[2] ?? '') : args;
    });
    chunks.push(...[...src.matchAll(/const blocked = ('[^']+')/g)].map((m) => m[1]!));
    for (const chunk of chunks) {
      for (const lit of chunk.matchAll(/'((?:[^'\\]|\\.)*)'|`([^`]*)`/g)) {
        const text = (lit[1] ?? lit[2] ?? '').replace(/\\'/g, "'");
        if (!/\s/.test(text)) continue; // códigos estáveis e pedaços de expressão, não frases
        out.push({ file: file.slice(SRC.length + 1), text });
      }
    }
  }
  return out;
}

describe('mensagens de erro da API', () => {
  it('encontra as frases no código', () => {
    expect(messagesInSource().length).toBeGreaterThan(40);
  });

  it('nenhuma frase monta texto com ${}: as partes variáveis vão em params', () => {
    expect(messagesInSource().filter((m) => m.text.includes('${'))).toEqual([]);
  });

  it('toda frase existe em inglês e hebraico', () => {
    const missing = messagesInSource().filter((m) => !hasMessage(m.text));
    expect(missing).toEqual([]);
  });

  it('escreve no idioma pedido, com os parâmetros', () => {
    const err = Errors.conflict('NO_LIVES', 'Suas vidas acabaram. A próxima volta em {wait} min — enquanto isso, que tal estudar no Golem World?', { wait: 7 });
    expect(err.bodyFor('en')).toMatchObject({ code: 'NO_LIVES', message: expect.stringContaining('in 7 min') });
    expect(err.bodyFor('he').message).toContain('בעוד 7 דק׳');
    expect((err.getResponse() as { message: string }).message).toContain('em 7 min');
  });

  it('traduz também os motivos de dados inválidos', () => {
    const err = new AppError(400, 'INVALID_INPUT', 'Dados inválidos.', undefined, {
      issues: [{ path: 'displayName', message: 'Este nome não pode ser usado no jogo. Escolha outro.' }],
    });
    expect(err.bodyFor('en')).toEqual({
      code: 'INVALID_INPUT',
      message: 'Invalid data.',
      issues: [{ path: 'displayName', message: 'This name cannot be used in the game. Choose another one.' }],
    });
  });

  it('limite de uso: causa e tempo de espera no idioma certo', () => {
    expect(Errors.rateLimited(3 * 60_000, 'Muitas tentativas seguidas.').bodyFor('en').message).toBe('Too many attempts in a row. Try again in 3 minutes.');
    expect(messageText('Muitas tentativas seguidas.', 'he')).toBe('יותר מדי ניסיונות ברצף.');
  });
});
