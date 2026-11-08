/**
 * Fase 8: idiomas. Catálogo completo em inglês e hebraico, referências e números
 * hebraicos, e as checagens que barram uma tradução ruim antes de ir para o banco.
 */
import { describe, expect, it } from 'vitest';
import {
  CATEGORIES,
  COMMENTATORS,
  DIFFICULTY_LABELS_PT,
  ITEM_SLOT_LABELS_PT,
  FIXED_TRACK_SOURCES,
  ITEMS,
  PARASHOT,
  TRACKS,
  WORLDS,
  catalogMissing,
  catalogText,
  checkQuestionTranslation,
  checkSegmentTranslation,
  hebrewNumeral,
  localeFromTag,
  parashaName,
  segmentSystemPrompt,
  shortRef,
  sourceBookName,
  torahBookName,
  PUZZLE_STONES,
} from '../src/index.js';

function catalogStrings(): string[] {
  const out = new Set<string>();
  const add = (s?: string | null) => s && out.add(s);
  for (const w of WORLDS) [w.namePt, w.beitMidrash.namePt, w.beitMidrash.subtitlePt].forEach(add);
  for (const p of PARASHOT) {
    [p.namePt, p.meaningPt, p.goal.captionPt].forEach(add);
    p.events.forEach((e) => add(e.captionPt));
    p.scene.stages?.forEach((s) => add(s.captionPt));
  }
  for (const t of Object.values(TRACKS)) [t.labelPt, t.descriptionPt, t.sourcesPt].forEach(add);
  for (const i of ITEMS) [i.namePt, i.perkPt, i.flavorPt].forEach(add);
  for (const c of Object.values(CATEGORIES)) for (const [k, v] of Object.entries(c)) if (k.endsWith('Pt') && typeof v === 'string') add(v);
  COMMENTATORS.forEach((c) => add(c.namePt));
  FIXED_TRACK_SOURCES.forEach((f) => add(f.namePt));
  Object.values(DIFFICULTY_LABELS_PT).forEach(add);
  Object.values(ITEM_SLOT_LABELS_PT).forEach(add);
  PUZZLE_STONES.forEach((s) => add(s.name));
  return [...out];
}

describe('catálogo do Golem World', () => {
  it.each(['en', 'he'] as const)('tem tudo traduzido para %s', (locale) => {
    expect(catalogMissing(catalogStrings(), locale)).toEqual([]);
  });

  it('nenhuma legenda em hebraico escreve o Tetragrama por extenso', () => {
    for (const s of catalogStrings()) expect(catalogText(s, 'he')).not.toMatch(/יהוה/);
  });

  it('nomes de parashiot em cada idioma', () => {
    const lech = PARASHOT.find((p) => p.id === 'lech-lecha')!;
    expect(parashaName(lech, 'pt')).toBe('Lech Lechá');
    expect(parashaName(lech, 'en')).toBe('Lech Lecha');
    expect(parashaName(lech, 'he')).toBe('לך לך');
    expect(catalogText('Trevas sobre a face do abismo', 'en')).toBe('Darkness upon the face of the deep');
  });
});

describe('referências', () => {
  it('números hebraicos, com ט״ו e ט״ז', () => {
    expect(hebrewNumeral(1)).toBe('א׳');
    expect(hebrewNumeral(15)).toBe('ט״ו');
    expect(hebrewNumeral(16)).toBe('ט״ז');
    expect(hebrewNumeral(32)).toBe('ל״ב');
    expect(hebrewNumeral(150)).toBe('ק״נ');
  });

  it('referência curta no idioma do jogador', () => {
    expect(shortRef('Genesis 1:3', 'pt')).toBe('Gn 1:3');
    expect(shortRef('Genesis 1:3', 'en')).toBe('Gen 1:3');
    expect(shortRef('Genesis 1:3', 'he')).toBe('בראשית א׳:ג׳');
    expect(shortRef('Exodus 15:16-17', 'he')).toBe('שמות ט״ו:ט״ז–י״ז');
    expect(shortRef('Berakhot 2a:1', 'he')).toBe('Berakhot 2a:1');
    expect(torahBookName('Genesis', 'en')).toBe('Bereshit (Genesis)');
    expect(torahBookName('Exodus', 'pt')).toBe('Shemot (Êxodo)');
  });

  it('nomes das fontes', () => {
    expect(sourceBookName('Mishnah Berakhot', 'he')).toBe('משנה ברכות');
    expect(sourceBookName('Sanhedrin', 'he')).toBe('סנהדרין');
    expect(sourceBookName('Rashi on Genesis', 'he')).toBe('רש״י');
    expect(sourceBookName('Mishnah Berakhot', 'pt')).toBe('Mishná Berakhot');
    expect(sourceBookName('Bereshit Rabbah', 'en')).toBe('Bereshit Rabbah');
  });

  it('idioma do aparelho', () => {
    expect(localeFromTag('pt-BR')).toBe('pt');
    expect(localeFromTag('en_US')).toBe('en');
    expect(localeFromTag('iw')).toBe('he');
    expect(localeFromTag('he-IL')).toBe('he');
    expect(localeFromTag('fr-FR')).toBe('pt');
    expect(localeFromTag(null)).toBe('pt');
  });
});

describe('checagens da tradução automática', () => {
  const verse = {
    id: 'x',
    ref: 'Genesis 1:1',
    he: 'בְּרֵאשִׁית בָּרָא אֱלֹהִים אֵת הַשָּׁמַיִם וְאֵת הָאָרֶץ׃',
    en: 'In the beginning God created the heaven and the earth.',
  };

  it('aceita uma tradução fiel', () => {
    expect(checkSegmentTranslation(verse, "No princípio, D'us criou os céus e a terra.", 'pt')).toBeNull();
  });

  it('reprova vazio, curta, longa demais, sem traduzir, conversa e Nome por extenso', () => {
    expect(checkSegmentTranslation(verse, '   ', 'pt')).toBe('empty');
    expect(checkSegmentTranslation(verse, 'No princípio.', 'pt')).toBe('too_short');
    expect(checkSegmentTranslation(verse, `No princípio ${'e '.repeat(300)}`, 'pt')).toBe('too_long');
    expect(checkSegmentTranslation(verse, `${verse.he} (os céus e a terra criou)`, 'pt')).toBe('untranslated');
    expect(checkSegmentTranslation(verse, 'Nota: aqui está a tradução do versículo inteiro.', 'pt')).toBe('chatter');
    expect(checkSegmentTranslation(verse, 'No princípio, Yahweh criou os céus e a terra inteira.', 'pt')).toBe('divine_name');
  });

  it('o prompt traz a grafia reverente do idioma', () => {
    expect(segmentSystemPrompt('pt')).toContain('"o Eterno"');
    expect(segmentSystemPrompt('pt')).toContain(`"D'us"`);
    expect(segmentSystemPrompt('en')).toContain('"Hashem"');
  });

  const q = {
    id: 'q',
    text: 'Em que dia foram criados os luminares?',
    options: ['No primeiro', 'No quarto', 'No sexto', 'No segundo'],
    explanation: 'No quarto dia.',
    evidenceQuote: 'And God made the two great lights',
    contextLabel: null,
    contextText: null,
  };
  const good = {
    text: 'On which day were the lights created?',
    options: ['On the first', 'On the fourth', 'On the sixth', 'On the second'],
    explanation: 'On the fourth day.',
    evidenceQuote: 'And G-d made the two great lights',
    contextLabel: null,
    contextText: null,
  };

  it('pergunta traduzida: 4 alternativas diferentes, sem perder campos', () => {
    expect(checkQuestionTranslation(q, good, 'en')).toBeNull();
    expect(checkQuestionTranslation(q, { ...good, options: good.options.slice(0, 3) }, 'en')).toBe('option_count');
    expect(checkQuestionTranslation(q, { ...good, options: ['On the first', 'On the first', 'On the sixth', 'On the second'] }, 'en')).toBe('duplicate_options');
    expect(checkQuestionTranslation(q, { ...good, contextText: 'extra' }, 'en')).toBe('null_mismatch');
    expect(checkQuestionTranslation(q, { ...good, text: 'x'.repeat(301) }, 'en')).toBe('too_long');
    expect(checkQuestionTranslation(q, good, 'he')).toBe('wrong_script');
  });
});
