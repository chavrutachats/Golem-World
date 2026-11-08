import { describe, expect, it } from 'vitest';
import {
  dedupeFingerprint,
  evidenceMatches,
  findDivineNameIssues,
  normalizeForMatch,
  renderDivineNamesForDisplay,
  sefariaUrlForRef,
  stripHebrewMarks,
} from '../src/text.js';
import { GENESIS_1_1_HE, GENESIS_22_2_EN, GENESIS_22_2_HE, GENESIS_2_4_HE } from './fixtures.js';

describe('stripHebrewMarks', () => {
  it('remove nikud e te\'amim preservando as letras', () => {
    expect(stripHebrewMarks(GENESIS_1_1_HE)).toBe('בראשית ברא אלהים את השמים ואת הארץ׃');
  });
});

describe('normalizeForMatch', () => {
  it('descarta notas de rodapé do Sefaria e o HTML', () => {
    const raw =
      'In the beginning<sup class="footnote-marker">*</sup><i class="footnote">Or "When God began"</i> <b>God</b> created';
    expect(normalizeForMatch(raw)).toBe('in the beginning god created');
  });

  it('trata maqaf como espaço e remove sof pasuq', () => {
    expect(normalizeForMatch('קַח־נָ֠א אֶת־בִּנְךָ֨׃')).toBe('קח נא את בנך');
  });

  it('remove marcadores de parashá', () => {
    expect(normalizeForMatch('וַיְכֻלּ֛וּ {פ}')).toBe('ויכלו');
  });
});

describe('evidenceMatches', () => {
  it('aceita citação hebraica sem nikud de um texto com nikud', () => {
    expect(evidenceMatches(GENESIS_1_1_HE, 'בראשית ברא אלהים')).toBe(true);
  });

  it('aceita citação com pontuação diferente do original', () => {
    expect(evidenceMatches(GENESIS_22_2_EN, 'whom thou lovest even Isaac')).toBe(true);
    expect(evidenceMatches(GENESIS_22_2_HE, 'אל ארץ המריה')).toBe(true);
  });

  it('rejeita pedaço de palavra', () => {
    expect(evidenceMatches(GENESIS_1_1_HE, 'ראשית ברא')).toBe(false);
  });

  it('rejeita citação de uma palavra só (trivial)', () => {
    expect(evidenceMatches(GENESIS_22_2_EN, 'Isaac')).toBe(false);
  });

  it('rejeita texto que não está na fonte (alucinação)', () => {
    expect(evidenceMatches(GENESIS_22_2_EN, 'land of Canaan')).toBe(false);
  });
});

describe('Nomes Divinos', () => {
  it('substitui o Tetragrama com nikud por ה׳ na exibição', () => {
    const shown = renderDivineNamesForDisplay(GENESIS_2_4_HE);
    expect(shown).toContain('ה׳');
    expect(stripHebrewMarks(shown)).not.toContain('יהוה');
    // Elohim fica intacto no modo padrão.
    expect(stripHebrewMarks(shown)).toContain('אלהים');
  });

  it('no modo strict também grafa Elohim de forma reverente', () => {
    const shown = stripHebrewMarks(renderDivineNamesForDisplay(GENESIS_2_4_HE, 'strict'));
    expect(shown).toContain('א-להים');
    expect(shown).not.toContain('אלהים');
  });

  it('acusa Tetragrama e transliterações em texto gerado', () => {
    expect(findDivineNameIssues('O que יְהֹוָה disse a Abraão?').map((i) => i.code)).toEqual([
      'tetragrammaton_spelled_out',
    ]);
    expect(findDivineNameIssues('O que Javé pediu?')[0]?.code).toBe('transliterated_divine_name');
    expect(findDivineNameIssues('Quem é YHWH?')[0]?.severity).toBe('error');
  });

  it('avisa sobre "Deus", mas aceita a convenção do app e palavras parecidas', () => {
    expect(findDivineNameIssues('Deus criou os céus')[0]?.severity).toBe('warning');
    expect(findDivineNameIssues("D'us criou os céus")).toEqual([]);
    expect(findDivineNameIssues('Em Deuteronômio, Hashem ordena…')).toEqual([]);
  });
});

describe('sefariaUrlForRef', () => {
  it.each([
    ['Genesis 1:1', 'https://www.sefaria.org/Genesis.1.1'],
    ['Genesis 1:1-5', 'https://www.sefaria.org/Genesis.1.1-5'],
    ['Genesis 1:1-2:3', 'https://www.sefaria.org/Genesis.1.1-2.3'],
    ['Berakhot 2a:3', 'https://www.sefaria.org/Berakhot.2a.3'],
    ['Pirkei Avot 1:1', 'https://www.sefaria.org/Pirkei_Avot.1.1'],
    ['Mishnah Berakhot 1', 'https://www.sefaria.org/Mishnah_Berakhot.1'],
  ])('%s → %s', (ref, url) => {
    expect(sefariaUrlForRef(ref)).toBe(url);
  });
});

describe('dedupeFingerprint', () => {
  it('ignora caixa, acentos e pontuação', () => {
    expect(dedupeFingerprint('Para onde Abraão levou Isaque?', 'Moriá')).toBe(
      dedupeFingerprint('para onde abraao levou isaque', 'MORIA'),
    );
  });
});
