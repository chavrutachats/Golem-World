/// <reference types="node" />
/**
 * Fase 8: toda frase da interface (t(), tn() e msg() no código) existe em inglês e
 * hebraico, mantém os mesmos {marcadores} e não há linha sobrando no dicionário.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { parse } from '@babel/parser';
import { hasMessage } from '@trivia/shared';
import { describe, expect, it } from 'vitest';
import { UI_ROWS } from '../src/locales/ui';

const SRC = join(import.meta.dirname, '../src');

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (e.isDirectory()) return e.name === 'locales' ? [] : files(join(dir, e.name));
    return /\.tsx?$/.test(e.name) ? [join(dir, e.name)] : [];
  });
}

interface Found {
  key: string;
  where: string;
}

/** Frases literais passadas a t(texto), tn(n, um, vários) e msg(texto). */
function keysInSource(): Found[] {
  const out: Found[] = [];
  for (const file of files(SRC)) {
    const code = readFileSync(file, 'utf8');
    const ast = parse(code, { sourceType: 'module', plugins: ['typescript', 'jsx'], errorRecovery: true });
    const visit = (node: unknown): void => {
      if (!node || typeof node !== 'object') return;
      if (Array.isArray(node)) return node.forEach(visit);
      const n = node as { type?: string; callee?: { type: string; name?: string }; arguments?: { type: string; value?: string; quasis?: { value: { cooked: string } }[]; expressions?: unknown[] }[]; loc?: { start: { line: number } } };
      if (n.type === 'CallExpression' && n.callee?.type === 'Identifier' && ['t', 'tn', 'msg'].includes(n.callee.name ?? '')) {
        const idx = n.callee.name === 'tn' ? [1, 2] : [0];
        for (const i of idx) {
          const a = n.arguments?.[i];
          if (a?.type === 'StringLiteral' && a.value !== undefined) out.push({ key: a.value, where: `${relative(SRC, file)}:${n.loc?.start.line}` });
          else if (a?.type === 'TemplateLiteral' && a.expressions?.length === 0) out.push({ key: a.quasis![0]!.value.cooked, where: `${relative(SRC, file)}:${n.loc?.start.line}` });
        }
      }
      for (const v of Object.values(n)) if (v && typeof v === 'object') visit(v);
    };
    visit(ast.program);
  }
  return out;
}

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe('dicionário da interface', () => {
  const found = keysInSource();
  const rows = new Map(UI_ROWS.map((r) => [r[0], r]));

  it('encontra as frases do app', () => {
    expect(found.length).toBeGreaterThan(300);
  });

  it('não repete linhas', () => {
    const seen = new Set<string>();
    const dup = UI_ROWS.map((r) => r[0]).filter((k) => (seen.has(k) ? true : (seen.add(k), false)));
    expect(dup).toEqual([]);
  });

  it('toda frase do código tem inglês e hebraico', () => {
    const missing = found.filter((f) => !rows.has(f.key) && !hasMessage(f.key));
    expect(missing).toEqual([]);
  });

  it('nenhuma linha está sobrando', () => {
    const used = new Set(found.map((f) => f.key));
    expect(UI_ROWS.map((r) => r[0]).filter((k) => !used.has(k))).toEqual([]);
  });

  it('as traduções mantêm os mesmos {marcadores} e não ficam vazias', () => {
    const bad = UI_ROWS.filter(([pt, en, he]) => {
      const p = JSON.stringify(placeholders(pt));
      return !en.trim() || !he.trim() || JSON.stringify(placeholders(en)) !== p || JSON.stringify(placeholders(he)) !== p;
    });
    expect(bad).toEqual([]);
  });

  it('o hebraico está em hebraico e nunca escreve o Tetragrama', () => {
    const latinOnly = UI_ROWS.filter(([, , he]) => !/[֐-׿]/.test(he) && !/^[\s\d{}\w.()+-]*$/.test(he.replace(/\{\w+\}/g, '')));
    expect(latinOnly).toEqual([]);
    expect(UI_ROWS.filter(([, , he]) => /יהוה/.test(he))).toEqual([]);
  });
});

describe('t()', async () => {
  const { t, tn, useLocale } = await import('../src/lib/i18n');

  it('traduz, preenche os marcadores e usa as mensagens da API', () => {
    useLocale.setState({ locale: 'en' });
    expect(t('Rodada {n} de {max}', { n: 2, max: 25 })).toBe('Round 2 of 25');
    expect(tn(1, '{n} ponto', '{n} pontos')).toBe('1 point');
    expect(t('Essa senha é fácil de adivinhar. Escolha outra.')).toBe('This password is easy to guess. Choose another one.');
    useLocale.setState({ locale: 'he' });
    expect(t('Sua vez!')).toBe('התור שלך!');
    useLocale.setState({ locale: 'pt' });
    expect(t('Rodada {n} de {max}', { n: 2, max: 25 })).toBe('Rodada 2 de 25');
  });

  it('frase desconhecida volta como veio (mensagem do servidor já traduzida)', () => {
    useLocale.setState({ locale: 'en' });
    expect(t('This game is already over.')).toBe('This game is already over.');
  });
});
