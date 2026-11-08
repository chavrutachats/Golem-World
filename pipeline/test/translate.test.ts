/**
 * Fase 8: tradução em lote (`pnpm pipeline translate`) e leitura de arquivos do
 * export com campos nulos (o Rashi on Genesis trazia versionSource: null).
 */
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createPrismaClient, type PrismaClient } from '@trivia/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FakeProvider } from '../src/llm/fake.js';
import { readVersionFile } from '../src/sefaria/export-reader.js';
import { translateQuestions, translateSegments } from '../src/translate.js';

describe('arquivos do export com campos nulos', () => {
  it('aceita versionSource, license e priority nulos', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'export-'));
    const file = path.join(dir, 'Rashi on Genesis.json');
    await writeFile(
      file,
      JSON.stringify({ title: 'Rashi on Genesis', versionTitle: 'X', language: 'en', license: null, versionSource: null, priority: null, isPrimary: null, heTitle: null, text: [] }),
    );
    const doc = await readVersionFile(file);
    expect(doc.title).toBe('Rashi on Genesis');
    expect(doc.versionSource).toBeNull();
  });
});

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('tradução em lote', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = createPrismaClient({ databaseUrl: url! });
    await prisma.$executeRawUnsafe('TRUNCATE "SegmentTranslation", "QuestionTranslation", "StudyText" CASCADE');
    await prisma.studyText.createMany({
      data: [
        { ref: 'Genesis 1:1', track: 'torah', bookTitle: 'Genesis', sequence: 0, heText: 'בְּרֵאשִׁית בָּרָא אֱלֹהִים אֵת הַשָּׁמַיִם וְאֵת הָאָרֶץ׃', heLicense: 'CC-BY-SA', enText: 'In the beginning God created the heaven and the earth.', enLicense: 'Public Domain', anchors: ['Genesis 1:1'], parashot: ['bereshit'], wordCount: 10, contentHash: 'a'.repeat(64) },
        { ref: 'Genesis 1:2', track: 'torah', bookTitle: 'Genesis', sequence: 1, heText: 'וְהָאָרֶץ הָיְתָה תֹהוּ וָבֹהוּ וְחֹשֶׁךְ עַל־פְּנֵי תְהוֹם', heLicense: 'CC-BY-SA', enText: 'Now the earth was unformed and void, and darkness was upon the face of the deep.', enLicense: 'Public Domain', anchors: ['Genesis 1:2'], parashot: ['bereshit'], wordCount: 10, contentHash: 'b'.repeat(64) },
        { ref: 'Genesis 1:3', track: 'torah', bookTitle: 'Genesis', sequence: 2, heText: 'וַיֹּאמֶר אֱלֹהִים יְהִי אוֹר וַיְהִי־אוֹר׃', heLicense: 'CC-BY-SA', ptText: "E disse D'us: Haja luz; e houve luz.", ptLicense: 'CC-BY', anchors: ['Genesis 1:3'], parashot: ['bereshit'], wordCount: 6, contentHash: 'c'.repeat(64) },
      ],
    });
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it('traduz só o que falta, grava com a licença herdada e reprova o que não passa', async () => {
    const provider = new FakeProvider('fake-translator', (req) => {
      const items = (JSON.parse(req.user) as { items: { id: string; ref: string }[] }).items;
      return {
        items: items.map((i) =>
          i.ref === 'Genesis 1:2'
            ? { id: i.id, text: 'Nota: não sei traduzir.' }
            : { id: i.id, text: "No princípio, D'us criou os céus e a terra." },
        ),
      };
    });
    const stats = await translateSegments(provider, prisma, { locale: 'pt', tracks: ['torah'], limit: 100, concurrency: 2, dryRun: false });
    // Genesis 1:3 já tem português do Sefaria: não entra.
    expect(stats.segments).toBe(2);
    expect(stats.translated).toBe(1);
    expect(stats.rejected).toBe(1);
    const saved = await prisma.segmentTranslation.findMany({ include: { studyText: { select: { ref: true } } } });
    expect(saved.map((s) => s.studyText.ref)).toEqual(['Genesis 1:1']);
    expect(saved[0]!.license).toBe('CC-BY-SA + Public Domain');
    expect(saved[0]!.sourceHash).toBe('a'.repeat(64));

    // De novo: só o reprovado volta para a fila.
    const again = await translateSegments(provider, prisma, { locale: 'pt', tracks: ['torah'], limit: 100, concurrency: 2, dryRun: true });
    expect(again.segments).toBe(1);
  });

  it('traduz perguntas do motor e descarta a que perde uma alternativa', async () => {
    const verse = await prisma.studyText.findFirstOrThrow({ where: { ref: 'Genesis 1:1' } });
    for (const [i, text] of ['Quem criou os céus e a terra?', 'O que havia sobre a face do abismo?'].entries()) {
      await prisma.question.create({
        data: {
          studyTextId: verse.id,
          category: 'torah',
          origin: 'llm',
          locale: 'pt',
          text,
          options: ['A', 'B', 'C', 'D'],
          correctIndex: 0,
          explanation: 'Explicação.',
          sourceRef: 'Genesis 1:1',
          evidenceQuote: 'In the beginning',
          evidenceLanguage: 'en',
          aiDifficulty: 'easy',
          difficulty: 'easy',
          status: 'approved',
          dedupeKey: String(i).repeat(64),
        },
      });
    }
    const provider = new FakeProvider('fake-translator', (req) => {
      const q = JSON.parse(req.user) as { text: string };
      const options = q.text.startsWith('Quem') ? ['A one', 'B two', 'C three', 'D four'] : ['A one', 'B two', 'C three'];
      return { text: `EN ${q.text}`, options, explanation: 'Explanation.', evidenceQuote: 'In the beginning', contextLabel: null, contextText: null };
    });
    const stats = await translateQuestions(provider, prisma, { locale: 'en', limit: 10, concurrency: 1, dryRun: false });
    expect(stats).toMatchObject({ segments: 2, translated: 1, rejected: 1 });
    expect(await prisma.questionTranslation.count({ where: { locale: 'en' } })).toBe(1);
  });
});
