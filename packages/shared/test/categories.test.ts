import { describe, expect, it } from 'vitest';
import { categoryForSefariaPath, isExcludedSefariaPath } from '../src/categories.js';

describe('categoryForSefariaPath', () => {
  it.each([
    [['Tanakh', 'Torah'], 'torah'],
    [['Tanakh', 'Prophets'], 'neviim_ketuvim'],
    [['Tanakh', 'Writings'], 'neviim_ketuvim'],
    [['Mishnah', 'Seder Zeraim'], 'mishnah'],
    [['Talmud', 'Bavli', 'Seder Moed'], 'talmud'],
    [['Halakhah', 'Mishneh Torah', 'Sefer Madda'], 'halakhah'],
    [['Halakhah', 'Shulchan Arukh'], 'halakhah'],
    [['Midrash', 'Aggadah', 'Midrash Rabbah'], 'midrash_aggadah'],
    [['Midrash', 'Halakhah'], 'midrash_aggadah'],
  ])('%j → %s', (path, expected) => {
    expect(categoryForSefariaPath(path)).toBe(expected);
  });

  it.each([
    [['Talmud', 'Bavli', 'Rishonim on Talmud', 'Rashi']],
    [['Mishnah', 'Acharonim on Mishnah', 'Tosafot Yom Tov']],
    [['Mishnah', 'Modern Commentary on Mishnah', 'English Explanation of Mishnah']],
    [['Halakhah', 'Mishneh Torah', 'Commentary', 'Kesef Mishneh']],
    [['Halakhah', 'Shulchan Arukh', 'Commentary', 'Mishnah Berurah']],
    [['Talmud', 'Bavli', 'Minor Tractates']],
    [['Tanakh', 'Rishonim on Tanakh', 'Rashi']],
    [['Talmud', 'Yerushalmi', 'Seder Zeraim']],
    [['Liturgy', 'Siddur']],
  ])('%j fica fora do jogo', (path) => {
    expect(categoryForSefariaPath(path)).toBeNull();
  });

  it('exclui notas, introduções e comentários catalogados junto do texto-base', () => {
    expect(categoryForSefariaPath(['Midrash', 'Aggadah'], 'Buber footnotes on Midrash Mishlei')).toBeNull();
    expect(categoryForSefariaPath(['Halakhah', 'Shulchan Arukh'], 'Shulchan Arukh, Introduction')).toBeNull();
    expect(categoryForSefariaPath(['Halakhah', 'Shulchan Arukh'], 'Peri Megadim on Orach Chayim')).toBeNull();
    expect(categoryForSefariaPath(['Halakhah', 'Shulchan Arukh'], 'Shulchan Arukh, Orach Chayim')).toBe('halakhah');
  });

  it('marca comentários como excluídos', () => {
    expect(isExcludedSefariaPath(['Talmud', 'Bavli', 'Rishonim on Talmud', 'Tosafot'])).toBe(true);
    expect(isExcludedSefariaPath(['Talmud', 'Bavli', 'Seder Moed'])).toBe(false);
  });
});

describe('paleta das categorias', () => {
  function luminance(hex: string): number {
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(1 + i, 3 + i), 16) / 255).map((c) =>
      c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4,
    );
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
  }
  function contrast(a: string, b: string): number {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi! + 0.05) / (lo! + 0.05);
  }

  it('o texto sobre cada cor tem contraste de pelo menos 4,5:1', async () => {
    const { CATEGORIES, CATEGORY_IDS, CROWN_COLOR, CROWN_ON_COLOR } = await import('../src/categories.js');
    for (const id of CATEGORY_IDS) {
      expect(contrast(CATEGORIES[id].color, CATEGORIES[id].onColor), id).toBeGreaterThanOrEqual(4.5);
    }
    expect(contrast(CROWN_COLOR, CROWN_ON_COLOR)).toBeGreaterThanOrEqual(4.5);
  });
});
