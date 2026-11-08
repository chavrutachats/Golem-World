/**
 * Nomes de livros, parashiot e fontes em cada idioma, e referências curtas
 * ("Gn 1:3", "Gen 1:3", "בראשית א:ג").
 */
import { hebrewNumeral, type Locale } from '../i18n.js';
import { PARASHOT, WORLDS, type ParashaDef } from './parashot.js';
import { isTorahBook, shortRefPt, type TorahBook } from './refs.js';
import { COMMENTATORS, FIXED_TRACK_SOURCES, sourceBookNamePt } from './tracks.js';

const BOOK_ABBR_EN: Readonly<Record<TorahBook, string>> = {
  Genesis: 'Gen',
  Exodus: 'Exod',
  Leviticus: 'Lev',
  Numbers: 'Num',
  Deuteronomy: 'Deut',
};

export const TORAH_BOOK_HE: Readonly<Record<TorahBook, string>> = {
  Genesis: 'בראשית',
  Exodus: 'שמות',
  Leviticus: 'ויקרא',
  Numbers: 'במדבר',
  Deuteronomy: 'דברים',
};

/** "Bereshit (Gênesis)", "Bereshit (Genesis)", "בראשית". */
export function torahBookName(book: TorahBook, locale: Locale): string {
  if (locale === 'he') return TORAH_BOOK_HE[book];
  const translit = WORLDS.find((w) => w.id === book)!.namePt;
  const pt: Record<TorahBook, string> = { Genesis: 'Gênesis', Exodus: 'Êxodo', Leviticus: 'Levítico', Numbers: 'Números', Deuteronomy: 'Deuteronômio' };
  const plain = locale === 'pt' ? pt[book] : book;
  const en: Record<TorahBook, string> = { Genesis: 'Bereshit', Exodus: 'Shemot', Leviticus: 'Vayikra', Numbers: 'Bamidbar', Deuteronomy: 'Devarim' };
  return `${locale === 'pt' ? translit : en[book]} (${plain})`;
}

/** Referência curta de um versículo da Torá no idioma do jogador; outras referências voltam como vieram. */
export function shortRef(ref: string, locale: Locale): string {
  if (locale === 'pt') return shortRefPt(ref);
  const m = /^([A-Z][a-z]+)\s+(\d+)(?::(\d+))?(?:-(\d+)(?::(\d+))?)?$/.exec(ref.trim());
  if (!m || !isTorahBook(m[1]!)) return ref;
  const book = m[1] as TorahBook;
  if (locale === 'en') return `${BOOK_ABBR_EN[book]} ${ref.trim().slice(m[1]!.length + 1)}`;
  const n = (x: string | undefined) => (x ? hebrewNumeral(Number(x)) : '');
  const [, , c1, v1, x, y] = m;
  let out = `${TORAH_BOOK_HE[book]} ${n(c1)}${v1 ? `:${n(v1)}` : ''}`;
  if (x) out += y ? `–${n(x)}:${n(y)}` : `–${n(x)}`;
  return out;
}

/** Nomes das parashiot em inglês, na grafia do Sefaria, na ordem da leitura. */
const PARASHA_EN: readonly string[] = [
  'Bereshit',
  'Noach',
  'Lech Lecha',
  'Vayera',
  'Chayei Sara',
  'Toldot',
  'Vayetzei',
  'Vayishlach',
  'Vayeshev',
  'Miketz',
  'Vayigash',
  'Vayechi',
  'Shemot',
  "Va'era",
  'Bo',
  'Beshalach',
  'Yitro',
  'Mishpatim',
  'Terumah',
  'Tetzaveh',
  'Ki Tisa',
  'Vayakhel',
  'Pekudei',
  'Vayikra',
  'Tzav',
  'Shmini',
  'Tazria',
  'Metzora',
  'Achrei Mot',
  'Kedoshim',
  'Emor',
  'Behar',
  'Bechukotai',
  'Bamidbar',
  'Nasso',
  "Beha'alotcha",
  "Sh'lach",
  'Korach',
  'Chukat',
  'Balak',
  'Pinchas',
  'Matot',
  'Masei',
  'Devarim',
  'Vaetchanan',
  'Eikev',
  "Re'eh",
  'Shoftim',
  'Ki Teitzei',
  'Ki Tavo',
  'Nitzavim',
  'Vayeilech',
  "Ha'azinu",
  "V'Zot HaBerachah",
];

export function parashaName(p: Pick<ParashaDef, 'number' | 'namePt' | 'nameHe'>, locale: Locale): string {
  if (locale === 'he') return p.nameHe;
  if (locale === 'en') return PARASHA_EN[p.number - 1] ?? p.namePt;
  return p.namePt;
}

export function parashaNameById(id: string, locale: Locale): string {
  const p = PARASHOT.find((x) => x.id === id);
  return p ? parashaName(p, locale) : id;
}

/** Tratados da Mishná e do Talmud em hebraico. */
const TRACTATE_HE: Readonly<Record<string, string>> = {
  Arakhin: 'ערכין',
  'Avodah Zarah': 'עבודה זרה',
  'Bava Batra': 'בבא בתרא',
  'Bava Kamma': 'בבא קמא',
  'Bava Metzia': 'בבא מציעא',
  Beitzah: 'ביצה',
  Bekhorot: 'בכורות',
  Berakhot: 'ברכות',
  Bikkurim: 'ביכורים',
  Chagigah: 'חגיגה',
  Challah: 'חלה',
  Chullin: 'חולין',
  Demai: 'דמאי',
  Eduyot: 'עדיות',
  Eruvin: 'עירובין',
  Gittin: 'גיטין',
  Horayot: 'הוריות',
  Kelim: 'כלים',
  Keritot: 'כריתות',
  Ketubot: 'כתובות',
  Kiddushin: 'קידושין',
  Kilayim: 'כלאים',
  Kinnim: 'קינים',
  'Maaser Sheni': 'מעשר שני',
  Maasrot: 'מעשרות',
  Makhshirin: 'מכשירין',
  Makkot: 'מכות',
  Megillah: 'מגילה',
  Meilah: 'מעילה',
  Menachot: 'מנחות',
  Middot: 'מידות',
  Mikvaot: 'מקואות',
  'Moed Katan': 'מועד קטן',
  Nazir: 'נזיר',
  Nedarim: 'נדרים',
  Negaim: 'נגעים',
  Niddah: 'נדה',
  Oholot: 'אהלות',
  Orlah: 'ערלה',
  Parah: 'פרה',
  Peah: 'פאה',
  Pesachim: 'פסחים',
  'Rosh Hashanah': 'ראש השנה',
  Sanhedrin: 'סנהדרין',
  Shabbat: 'שבת',
  Shekalim: 'שקלים',
  Sheviit: 'שביעית',
  Shevuot: 'שבועות',
  Sotah: 'סוטה',
  Sukkah: 'סוכה',
  "Ta'anit": 'תענית',
  Taanit: 'תענית',
  Tahorot: 'טהרות',
  Tamid: 'תמיד',
  Temurah: 'תמורה',
  Terumot: 'תרומות',
  'Tevul Yom': 'טבול יום',
  Uktzin: 'עוקצין',
  Yadayim: 'ידים',
  Yevamot: 'יבמות',
  Yoma: 'יומא',
  Zavim: 'זבים',
  Zevachim: 'זבחים',
};

const COMMENTATOR_HE: Readonly<Record<string, string>> = { rashi: 'רש״י', ramban: 'רמב״ן', 'ibn-ezra': 'אבן עזרא', sforno: 'ספורנו' };

const FIXED_SOURCE_NAMES: Readonly<Record<string, { en: string; he: string }>> = {
  'Bereshit Rabbah': { en: 'Bereshit Rabbah', he: 'בראשית רבה' },
  'Shemot Rabbah': { en: 'Shemot Rabbah', he: 'שמות רבה' },
  'Vayikra Rabbah': { en: 'Vayikra Rabbah', he: 'ויקרא רבה' },
  'Bamidbar Rabbah': { en: 'Bamidbar Rabbah', he: 'במדבר רבה' },
  'Devarim Rabbah': { en: 'Devarim Rabbah', he: 'דברים רבה' },
  Zohar: { en: 'Zohar', he: 'זוהר' },
  'Sefer HaChinukh': { en: 'Sefer HaChinukh', he: 'ספר החינוך' },
};

/** Nome de um livro-fonte das trilhas no idioma do jogador ("Mishnah Berakhot" → "Mishná Berakhot" / "משנה ברכות"). */
export function sourceBookName(title: string, locale: Locale): string {
  if (locale === 'pt') return sourceBookNamePt(title);
  const fixed = FIXED_TRACK_SOURCES.find((s) => s.title === title);
  if (fixed) return FIXED_SOURCE_NAMES[title]?.[locale] ?? title;
  const comm = COMMENTATORS.find((c) => title.startsWith(`${c.path[2]} on `));
  if (comm) return locale === 'he' ? COMMENTATOR_HE[comm.id]! : comm.namePt;
  if (title === 'Pirkei Avot') return locale === 'he' ? 'פרקי אבות' : 'Pirkei Avot';
  if (locale === 'en') return title;
  if (title.startsWith('Mishnah ')) {
    const t = title.slice('Mishnah '.length);
    return `משנה ${TRACTATE_HE[t] ?? t}`;
  }
  return TRACTATE_HE[title] ?? title;
}

/** Nome do comentarista ("Rashi" → "רש״י" em hebraico). */
export function commentatorName(name: string, locale: Locale): string {
  if (locale !== 'he') return name;
  const c = COMMENTATORS.find((x) => x.namePt === name);
  return c ? COMMENTATOR_HE[c.id]! : name;
}
