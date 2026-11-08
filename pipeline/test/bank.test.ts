import path from 'node:path';
import { CATEGORY_IDS, findDivineNameIssues, stripHebrewMarks } from '@trivia/shared';
import { describe, expect, it } from 'vitest';
import { checkQuote, readBank, validate } from '../src/bank/build.js';
import { Corpus, OpeningIndex } from '../src/bank/corpus.js';
import { curatedDraft } from '../src/bank/curated.js';
import { finalize, perLocale, quoteOf } from '../src/bank/kit.js';
import type { Draft } from '../src/bank/model.js';
import { mishnahGenerators } from '../src/bank/gen/mishnah.js';

const FIXTURES = path.resolve(import.meta.dirname, '../fixtures/sefaria-export');
const corpus = new Corpus([FIXTURES]);

function draft(over: Partial<Draft> = {}, text = 'Qual é a primeira palavra da Torá?'): Draft {
  const he = corpus.text('Genesis', 'he')!;
  const en = corpus.text('Genesis', 'en')!;
  return {
    id: 'test:genesis-1-1',
    category: 'torah',
    difficulty: 'easy',
    kind: 'test',
    sourceRef: 'Genesis 1:1',
    i18n: perLocale((l) => ({
      text: l === 'pt' ? text : l === 'en' ? 'What is the first word of the Torah?' : 'מהי המילה הראשונה בתורה?',
      options: ['Bereshit', 'Shemot', 'Vayikra', 'Bamidbar'],
      explanation: 'A Torá começa com Bereshit.',
      evidence: l === 'en' ? quoteOf(en, 'In the beginning God created') : quoteOf(he, 'בראשית ברא'),
      context: null,
    })),
    ...over,
  };
}

describe('banco de perguntas', () => {
  it('lê o espelho do Sefaria-Export e escolhe só versões de licença aceita', () => {
    const he = corpus.text('Genesis', 'he')!;
    expect(['Public Domain', 'CC0', 'CC-BY', 'CC-BY-SA']).toContain(he.license);
    expect(stripHebrewMarks(he.byRef.get('Genesis 1:1')!.text)).toMatch(/^בראשית ברא/);
    const en = corpus.text('Genesis', 'en')!;
    expect(en.versionTitle).toMatch(/JPS 1917/);
    expect(corpus.text('Berakhot', 'he')!.byRef.has('Berakhot 2a:1')).toBe(true);
  });

  it('aceita a pergunta com a evidência literal do trecho, em cada idioma', () => {
    expect(validate(corpus, finalize(draft()))).toBeNull();
  });

  it('recusa evidência que não está no trecho citado, ou de outra versão', () => {
    const he = corpus.text('Genesis', 'he')!;
    const wrong = draft();
    wrong.i18n.pt = { ...wrong.i18n.pt, evidence: quoteOf(he, 'ויאמר אלהים יהי אור') };
    expect(validate(corpus, finalize(wrong))).toMatch(/pt evidência: o trecho não está em Genesis 1:1/);
    expect(checkQuote(corpus, 'Genesis 1:1', { text: 'בראשית ברא', lang: 'he', versionTitle: 'Outra', license: 'Public Domain' }, 'x')).toMatch(/versão/);
    expect(checkQuote(corpus, 'Genesis 1:1', { text: 'No princípio', lang: 'pt', versionTitle: 'x', license: 'unknown' }, 'x')).toMatch(/português/);
  });

  it('recusa Nome Divino por extenso, alternativas repetidas e "todas as anteriores"', () => {
    expect(validate(corpus, finalize(draft({}, 'O que יהוה disse primeiro?')))).toMatch(/Tetragrama/);
    const dup = draft();
    dup.i18n.en = { ...dup.i18n.en, options: ['Bereshit', 'bereshit!', 'Vayikra', 'Bamidbar'] };
    expect(validate(corpus, finalize(dup))).toMatch(/en: alternativas repetidas/);
    const lazy = draft();
    lazy.i18n.pt = { ...lazy.i18n.pt, options: ['Bereshit', 'Shemot', 'Vayikra', 'Todas as anteriores'] };
    expect(validate(corpus, finalize(lazy))).toMatch(/proibida/);
  });

  it('embaralha as alternativas igual nos três idiomas (números em ordem crescente)', () => {
    const q = finalize(draft());
    expect(q.i18n.pt.options[q.correctIndex]).toBe('Bereshit');
    expect(q.i18n.he.options[q.correctIndex]).toBe('Bereshit');
    expect(finalize(draft())).toEqual(q);
    const numeric = finalize({ ...draft(), numeric: true, i18n: perLocale((l) => ({ ...draft().i18n[l], options: ['31', '29', '33', '30'] })) });
    expect(numeric.i18n.pt.options).toEqual(['29', '30', '31', '33']);
    expect(numeric.i18n.pt.options[numeric.correctIndex]).toBe('31');
  });

  it('acha a abertura mais curta que só um trecho tem', () => {
    const index = new OpeningIndex(['ויאמר משה אל העם', 'ויאמר משה אל אהרן', 'ויאמר אהרן']);
    expect(index.unique('ויאמר משה אל העם', 1, 6)).toBe('ויאמר משה אל העם');
    expect(index.unique('ויאמר אהרן', 1, 6)).toBe('ויאמר אהרן');
    expect(index.count('ויאמר')).toBe(3);
  });

  it('perguntas escritas à mão passam pelas mesmas checagens', () => {
    const base = {
      id: 'teste',
      category: 'torah' as const,
      difficulty: 'easy' as const,
      ref: 'Genesis 1:1',
      he: 'בראשית ברא אלהים',
      pt_: { q: 'Com que palavra começa a Torá?', a: ['Bereshit', 'Shemot', 'Vayomer', 'Elle'], x: 'A Torá começa assim (Gn 1:1).' },
      en_: { q: 'Which word opens the Torah?', a: ['Bereshit', 'Shemot', 'Vayomer', 'Eleh'], x: 'The Torah opens like this (Gen 1:1).' },
      he_: { q: 'באיזו מילה פותחת התורה?', a: ['בראשית', 'שמות', 'ויאמר', 'אלה'], x: 'כך פותחת התורה (בראשית א׳:א׳).' },
    };
    const ok = curatedDraft(corpus, base);
    expect('error' in ok).toBe(false);
    expect(validate(corpus, finalize(ok as Draft))).toBeNull();
    const bad = curatedDraft(corpus, { ...base, he: 'ויאמר אלהים' });
    expect(validate(corpus, finalize(bad as Draft))).toMatch(/evidência/);
  });

  it('os geradores leem a estrutura do Sefaria (Mishná)', () => {
    const qs = mishnahGenerators(corpus).map(finalize);
    expect(qs.find((q) => q.kind === 'mishnah-seder-of-tractate')?.i18n.pt.options).toContain('Zeraim (Sementes)');
    for (const q of qs) expect(validate(corpus, q)).toBeNull();
  });

  it('o banco gravado no repositório tem mais de 1.000 perguntas por tema, nos três idiomas e sem Nome por extenso', () => {
    const bank = readBank();
    for (const c of CATEGORY_IDS) expect(bank.filter((q) => q.category === c).length).toBeGreaterThanOrEqual(1000);
    expect(new Set(bank.map((q) => q.id)).size).toBe(bank.length);
    for (const q of bank) {
      for (const l of ['pt', 'en', 'he'] as const) {
        const loc = q.i18n[l];
        expect(loc.options).toHaveLength(4);
        for (const s of [loc.text, loc.explanation, ...loc.options]) expect(findDivineNameIssues(s).filter((i) => i.severity === 'error')).toEqual([]);
      }
    }
  });
});
