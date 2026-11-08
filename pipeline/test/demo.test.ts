import { describe, expect, it } from 'vitest';
import { CATEGORIES, validateGeneratedQuestion, type CategoryId } from '@trivia/shared';
import { DEMO_QUESTIONS } from '../src/demo/questions.js';
import { DEMO_EXPORT_PATH } from '../src/demo/seed.js';
import { sourceTextsFor } from '../src/generation/engine.js';
import { buildPassageDrafts } from '../src/ingest/ingest.js';
import { groupBooks, loadBooksIndex } from '../src/sefaria/books-index.js';
import { loadBookStructure } from '../src/sefaria/export-reader.js';
import { chooseVersions, loadLocalVersions } from '../src/sefaria/versions.js';
import { FIXTURE_EXPORT } from './helpers.js';

async function fixturePassages() {
  const index = await loadBooksIndex(FIXTURE_EXPORT);
  const out = [];
  for (const group of groupBooks(index, { languages: ['he', 'en'] })) {
    const structure = await loadBookStructure(FIXTURE_EXPORT, group.title);
    if (!structure.simple) continue;
    const { chosen } = chooseVersions(await loadLocalVersions(FIXTURE_EXPORT, group), ['he', 'en'], {
      allowedLicenses: ['Public Domain', 'CC0', 'CC-BY', 'CC-BY-SA'],
      authorizedVersions: [],
    });
    out.push(...buildPassageDrafts(group, structure.addressTypes, chosen).map((d) => ({ id: d.ref, ...d })));
  }
  return out;
}

describe('perguntas de demonstração', () => {
  it('usam a mesma pasta de trechos dos testes', () => {
    expect(DEMO_EXPORT_PATH).toBe(FIXTURE_EXPORT);
  });

  it('passam em todas as checagens do pipeline, sem avisos', async () => {
    const passages = await fixturePassages();
    for (const q of DEMO_QUESTIONS) {
      const passage = passages.find((p) => p.segments.some((s) => s.ref === q.sourceRef));
      expect(passage, q.sourceRef).toBeDefined();
      const report = validateGeneratedQuestion(q, sourceTextsFor(passage!, q.sourceRef), [passage!.ref, ...passage!.segments.map((s) => s.ref)]);
      expect(report.errors, `${q.sourceRef}: ${q.question}`).toEqual([]);
      expect(report.warnings, `${q.sourceRef}: ${q.question}`).toEqual([]);
    }
  });

  it('cobrem Torá, Mishná e Talmud, com níveis variados', async () => {
    const passages = await fixturePassages();
    const categories = new Set<CategoryId>(
      DEMO_QUESTIONS.map((q) => passages.find((p) => p.segments.some((s) => s.ref === q.sourceRef))!.category),
    );
    expect([...categories].sort()).toEqual(['mishnah', 'talmud', 'torah']);
    expect(new Set(DEMO_QUESTIONS.map((q) => q.difficulty)).size).toBe(4);
    expect(CATEGORIES.torah).toBeDefined();
  });

  it('não repetem a resposta correta como alternativa mais longa', () => {
    for (const q of DEMO_QUESTIONS) {
      expect(new Set(q.options).size, q.question).toBe(4);
    }
  });
});
