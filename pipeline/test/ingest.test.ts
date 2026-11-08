import { describe, expect, it } from 'vitest';
import { chunkSegments, type AlignedSegment } from '../src/ingest/chunker.js';
import { cleanSegmentText, ingest } from '../src/ingest/ingest.js';
import { testConfig } from './helpers.js';

function seg(chapter: number, verse: number, words: number): AlignedSegment {
  return { indices: [chapter, verse], ref: `X ${chapter + 1}:${verse + 1}`, en: Array(words).fill('w').join(' ') };
}

describe('chunkSegments', () => {
  it('respeita o máximo de segmentos e nunca atravessa o capítulo', () => {
    const segments = [...Array.from({ length: 7 }, (_, i) => seg(0, i, 10)), ...Array.from({ length: 3 }, (_, i) => seg(1, i, 10))];
    const chunks = chunkSegments(segments, { maxSegments: 5, maxWords: 1000, minWords: 0 });
    expect(chunks.map((c) => c.map((s) => s.ref))).toEqual([
      ['X 1:1', 'X 1:2', 'X 1:3', 'X 1:4', 'X 1:5'],
      ['X 1:6', 'X 1:7'],
      ['X 2:1', 'X 2:2', 'X 2:3'],
    ]);
  });

  it('respeita o teto de palavras', () => {
    const chunks = chunkSegments([seg(0, 0, 60), seg(0, 1, 60), seg(0, 2, 60)], { maxSegments: 10, maxWords: 130, minWords: 0 });
    expect(chunks.map((c) => c.length)).toEqual([2, 1]);
  });

  it('anexa uma sobra pequena do fim do capítulo à passagem anterior', () => {
    const chunks = chunkSegments([seg(0, 0, 50), seg(0, 1, 50), seg(0, 2, 5)], { maxSegments: 2, maxWords: 200, minWords: 20 });
    expect(chunks.map((c) => c.length)).toEqual([3]);
  });
});

describe('cleanSegmentText', () => {
  it('remove notas de rodapé, HTML e marcadores, preservando o nikud', () => {
    expect(cleanSegmentText('<big>בְּ</big>רֵאשִׁ֖ית  בָּרָ֣א {פ}')).toBe('בְּרֵאשִׁ֖ית בָּרָ֣א');
    expect(cleanSegmentText('When God<sup class="footnote-marker">*</sup><i class="footnote">nota</i> began')).toBe(
      'When God began',
    );
  });
});

describe('ingest (simulação, sem banco)', () => {
  it('gera passagens com referências do Sefaria para Tanach, Mishná e Talmud', async () => {
    const results = await ingest(testConfig(), null, { dryRun: true });
    const byTitle = Object.fromEntries(results.map((r) => [r.title, r]));
    expect(byTitle.Genesis).toMatchObject({ status: 'ingested', passages: expect.any(Number) });
    expect(byTitle.Genesis!.versions.he?.versionTitle).toBe("Tanach with Ta'amei Hamikra");
    expect(byTitle['Mishnah Berakhot']!.passages).toBe(5); // uma passagem por mishná no cap. 1
    expect(byTitle.Berakhot!.versions).toMatchObject({
      he: { license: 'CC-BY-SA' },
      en: { license: 'Public Domain' },
    });
  });

  it('inclui o português quando a versão é autorizada', async () => {
    const results = await ingest(testConfig({ SEFARIA_AUTHORIZED_VERSIONS: 'Tradução de teste [pt]' }), null, {
      titles: ['Genesis'],
      dryRun: true,
    });
    expect(results[0]!.versions.pt).toMatchObject({ versionTitle: 'Tradução de teste [pt]', authorized: true });
  });
});
