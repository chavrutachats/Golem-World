import { describe, expect, it } from 'vitest';
import { groupBooks, languageOfVersion, loadBooksIndex, relativePathFor } from '../src/sefaria/books-index.js';
import { flattenSegments, loadBookStructure } from '../src/sefaria/export-reader.js';
import { checkLicense, licenseRank, normalizeLicense } from '../src/sefaria/licenses.js';
import { formatAddress, rangeRef, segmentRef } from '../src/sefaria/refs.js';
import { chooseVersions, loadLocalVersions } from '../src/sefaria/versions.js';
import { FIXTURE_EXPORT } from './helpers.js';

describe('referências', () => {
  it('formata daf do Talmud a partir do índice do array', () => {
    expect(formatAddress('Talmud', 2)).toBe('2a');
    expect(formatAddress('Talmud', 3)).toBe('2b');
    expect(formatAddress('Talmud', 4)).toBe('3a');
    expect(formatAddress('Perek', 0)).toBe('1');
  });

  it('monta referências de segmento e de intervalo', () => {
    expect(segmentRef('Genesis', ['Perek', 'Pasuk'], [21, 1])).toBe('Genesis 22:2');
    expect(segmentRef('Berakhot', ['Talmud', 'Integer'], [2, 0])).toBe('Berakhot 2a:1');
    expect(rangeRef('Genesis', ['Perek', 'Pasuk'], [0, 0], [0, 4])).toBe('Genesis 1:1-5');
    expect(rangeRef('Genesis', ['Perek', 'Pasuk'], [0, 29], [1, 2])).toBe('Genesis 1:30-2:3');
    expect(rangeRef('Berakhot', ['Talmud', 'Integer'], [2, 9], [3, 2])).toBe('Berakhot 2a:10-2b:3');
    expect(rangeRef('Mishnah Berakhot', ['Perek', 'Mishnah'], [0, 0], [0, 0])).toBe('Mishnah Berakhot 1:1');
  });
});

describe('licenças', () => {
  const policy = { allowedLicenses: ['Public Domain', 'CC0', 'CC-BY', 'CC-BY-SA'], authorizedVersions: [] };

  it('normaliza grafias diferentes', () => {
    expect(normalizeLicense('public domain')).toBe('Public Domain');
    expect(normalizeLicense('CC BY-SA')).toBe('CC-BY-SA');
    expect(normalizeLicense(undefined)).toBe('unknown');
  });

  it('aceita só as licenças configuradas', () => {
    expect(checkLicense('CC-BY', 'x', policy).allowed).toBe(true);
    expect(checkLicense('CC-BY-NC', 'x', policy).allowed).toBe(false);
    expect(checkLicense('unknown', 'x', policy).allowed).toBe(false);
  });

  it('libera versões autorizadas pelo detentor dos direitos, mesmo com licença desconhecida', () => {
    const p = { ...policy, authorizedVersions: ['Publicado em 5784: Fulano (pt)'] };
    // O exportador remove ":" e parênteses do nome do arquivo; a comparação tolera isso.
    expect(checkLicense('unknown', 'Publicado em 5784 Fulano pt', p)).toEqual({ allowed: true, reason: 'authorized' });
  });

  it('prefere licenças menos restritivas', () => {
    expect(licenseRank('Public Domain')).toBeLessThan(licenseRank('CC-BY-SA'));
    expect(licenseRank('CC-BY-NC')).toBe(9);
  });
});

describe('books.json e arquivos do export', () => {
  it('detecta o idioma real pelo sufixo do título da versão', () => {
    expect(languageOfVersion('English', 'Sefaria Community Translation [pt]')).toBe('pt');
    expect(languageOfVersion('Hebrew', 'Yiddish Translation [YI]')).toBe('yi');
    expect(languageOfVersion('Hebrew', 'Miqra according to the Masorah')).toBe('he');
  });

  it('agrupa por livro, ignora comentários e filtra idiomas', async () => {
    const index = await loadBooksIndex(FIXTURE_EXPORT);
    const groups = groupBooks(index, { languages: ['he', 'en'] });
    expect(groups.map((g) => g.title).sort()).toEqual(['Berakhot', 'Genesis', 'Mishnah Berakhot']);
    const genesis = groups.find((g) => g.title === 'Genesis')!;
    expect(genesis.category).toBe('torah');
    expect(genesis.versions.every((v) => v.language !== 'pt')).toBe(true);
  });

  it('deriva o caminho local a partir da URL do bucket', () => {
    expect(
      relativePathFor({
        title: 'Genesis',
        language: 'English',
        versionTitle: 'BJC - [pt]',
        categories: ['Tanakh', 'Torah'],
        json_url: 'https://storage.googleapis.com/sefaria-export/json/Tanakh/Torah/Genesis/English/BJC%20-%20%5Bpt%5D.json',
      }),
    ).toBe('json/Tanakh/Torah/Genesis/English/BJC - [pt].json');
  });

  it('lê a estrutura do livro pelo schema', async () => {
    const talmud = await loadBookStructure(FIXTURE_EXPORT, 'Berakhot');
    expect(talmud).toMatchObject({ simple: true, addressTypes: ['Talmud', 'Integer'], depth: 2 });
    expect((await loadBookStructure(FIXTURE_EXPORT, 'Livro Inexistente')).simple).toBe(false);
  });

  it('achata o texto ignorando segmentos vazios', () => {
    expect(flattenSegments([[], ['a', ''], ['b']])).toEqual([
      { indices: [1, 0], text: 'a' },
      { indices: [2, 0], text: 'b' },
    ]);
  });
});

describe('escolha de versões', () => {
  const policy = { allowedLicenses: ['Public Domain', 'CC0', 'CC-BY', 'CC-BY-SA'], authorizedVersions: [] as string[] };

  async function genesisVersions() {
    const index = await loadBooksIndex(FIXTURE_EXPORT);
    const group = groupBooks(index, { titles: ['Genesis'], languages: ['he', 'en', 'pt'] })[0]!;
    return loadLocalVersions(FIXTURE_EXPORT, group);
  }

  it('prefere Domínio Público a CC-BY-SA e rejeita licenças não aceitas', async () => {
    const { chosen, rejected } = chooseVersions(await genesisVersions(), ['he', 'en', 'pt'], policy);
    expect(chosen.he?.doc.versionTitle).toBe("Tanach with Ta'amei Hamikra");
    expect(chosen.en?.license).toBe('Public Domain');
    expect(chosen.pt).toBeUndefined();
    expect(rejected.map((r) => r.versionTitle).sort()).toEqual(['Tradução de teste [pt]', 'Versão NC de teste [pt]']);
  });

  it('usa a tradução em português quando autorizada', async () => {
    const { chosen } = chooseVersions(await genesisVersions(), ['he', 'en', 'pt'], {
      ...policy,
      authorizedVersions: ['Tradução de teste [pt]'],
    });
    expect(chosen.pt).toMatchObject({ authorized: true });
    expect(chosen.pt?.doc.versionTitle).toBe('Tradução de teste [pt]');
  });
});
