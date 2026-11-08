/**
 * Normalização de texto e checagens de fidelidade à fonte.
 *
 * Estas funções sustentam a principal defesa contra alucinação do pipeline:
 * toda pergunta precisa trazer um trecho de evidência (`evidenceQuote`) que
 * EXISTA de fato no texto do Sefaria que foi entregue ao LLM. A comparação é
 * feita sobre versões normalizadas dos dois textos (sem nikud, te'amim, HTML,
 * notas de rodapé e pontuação), para não reprovar uma citação correta só porque
 * o modelo omitiu uma vírgula ou um sinal vocálico.
 */

/** Te'amim (cantilação): U+0591–U+05AF. */
const CANTILLATION = '֑-֯';
/** Nikud e sinais de leitura (exceto maqaf, paseq, sof pasuq e nun hafukha). */
const POINTS = 'ְ-ׇֽֿׁׂׅׄ';

const HEBREW_MARKS_RE = new RegExp(`[${CANTILLATION}${POINTS}]`, 'g');
/** Classe usada para tolerar sinais entre as letras de um Nome. */
const OPTIONAL_MARKS = `[${CANTILLATION}${POINTS}]*`;

/** Remove nikud e te'amim, preservando as letras. */
export function stripHebrewMarks(text: string): string {
  return text.normalize('NFD').replace(HEBREW_MARKS_RE, '').normalize('NFC');
}

/**
 * Remove a marcação HTML usada nos textos do Sefaria, incluindo o CONTEÚDO das
 * notas de rodapé (que não fazem parte do texto-base) e os marcadores de parashá
 * {פ} / {ס} do Tanach.
 */
export function stripSefariaMarkup(text: string): string {
  return text
    .replace(/<sup[^>]*class="footnote-marker"[^>]*>.*?<\/sup>/gis, '')
    .replace(/<i[^>]*class="footnote"[^>]*>.*?<\/i>/gis, '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/\{[פס]\}/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

/**
 * Forma canônica para comparação: sem marcação, sem nikud/te'amim, sem pontuação,
 * minúsculas (para latim), espaços colapsados. Maqaf (־) vira espaço.
 */
export function normalizeForMatch(text: string): string {
  return stripHebrewMarks(stripSefariaMarkup(text))
    .replace(/[־]/g, ' ')
    .replace(/[׀׃׆]/g, '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // acentos latinos (á → a)
    .normalize('NFC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface EvidenceMatchOptions {
  /** Número mínimo de palavras na citação normalizada (evita citações triviais como "e"). */
  minWords?: number;
}

/** Verdadeiro se `quote` aparece em `source` após normalização dos dois lados. */
export function evidenceMatches(source: string, quote: string, options: EvidenceMatchOptions = {}): boolean {
  const minWords = options.minWords ?? 2;
  const normQuote = normalizeForMatch(quote);
  if (!normQuote) return false;
  if (normQuote.split(' ').length < minWords) return false;
  const normSource = normalizeForMatch(source);
  return ` ${normSource} `.includes(` ${normQuote} `);
}

// ---------------------------------------------------------------------------
// Nomes Divinos
// ---------------------------------------------------------------------------

function nameRegex(letters: string, flags = 'g'): RegExp {
  return new RegExp(letters.split('').join(OPTIONAL_MARKS), flags);
}

/** Tetragrama com ou sem nikud/te'amim entre as letras. */
const TETRAGRAMMATON_RE = nameRegex('יהוה');
/** Variante do Nome com yod-yod usada em alguns textos rabínicos. */
const DOUBLE_YOD_RE = /(^|[^א-ת])יי(?=$|[^א-ת])/g;
const ELOHIM_RE = nameRegex('אלהים');
const ELOHIM_PLENE_RE = nameRegex('אלוהים');
const ADONAI_RE = nameRegex('אדני');

/** Transliterações que nunca devem aparecer em texto gerado. */
const TRANSLITERATION_RE = /(?<!\p{L})(?:yahweh|yahveh|jehovah|yhwh|yhvh|jav[eé]|jeov[aá]|iav[eé])(?!\p{L})/iu;

export type DivineNameMode =
  /** Substitui apenas o Tetragrama (padrão). */
  | 'tetragrammaton'
  /** Também grafa Elohim e Adonai de forma reverente (א-להים, א-דני). */
  | 'strict';

/**
 * Prepara um texto-fonte em hebraico para EXIBIÇÃO no app, grafando os Nomes de
 * forma reverente. Não use antes de `evidenceMatches`: a comparação deve ser feita
 * sobre o texto original.
 */
export function renderDivineNamesForDisplay(text: string, mode: DivineNameMode = 'tetragrammaton'): string {
  let out = text.replace(TETRAGRAMMATON_RE, 'ה׳').replace(DOUBLE_YOD_RE, '$1ה׳');
  if (mode === 'strict') {
    out = out
      .replace(ELOHIM_PLENE_RE, 'א-לוהים')
      .replace(ELOHIM_RE, 'א-להים')
      .replace(ADONAI_RE, 'א-דני');
  }
  return out;
}

export type PolicyIssueSeverity = 'error' | 'warning';

export interface PolicyIssue {
  code: 'tetragrammaton_spelled_out' | 'transliterated_divine_name' | 'divine_name_style';
  severity: PolicyIssueSeverity;
  message: string;
}

/** Convenções de grafia em português adotadas pelo app (ver docs/CONTENT_POLICY.md). */
export const DIVINE_NAME_STYLE_PT = {
  god: "D'us",
  tetragrammaton: 'Hashem',
} as const;

/**
 * Verifica um texto GERADO (pergunta, alternativas, explicação) contra a política
 * de Nomes Divinos. Citações literais da fonte (`evidenceQuote`) não passam por
 * aqui: elas são exibidas com {@link renderDivineNamesForDisplay}.
 */
export function findDivineNameIssues(text: string): PolicyIssue[] {
  const issues: PolicyIssue[] = [];
  if (new RegExp(TETRAGRAMMATON_RE.source).test(text)) {
    issues.push({
      code: 'tetragrammaton_spelled_out',
      severity: 'error',
      message: `O Tetragrama aparece por extenso; use "${DIVINE_NAME_STYLE_PT.tetragrammaton}" ou ה׳.`,
    });
  }
  if (TRANSLITERATION_RE.test(text)) {
    issues.push({
      code: 'transliterated_divine_name',
      severity: 'error',
      message: `Transliteração do Nome Divino; use "${DIVINE_NAME_STYLE_PT.tetragrammaton}".`,
    });
  }
  if (/\bDeus\b/u.test(text)) {
    issues.push({
      code: 'divine_name_style',
      severity: 'warning',
      message: `Convenção do app: escrever "${DIVINE_NAME_STYLE_PT.god}" em vez de "Deus".`,
    });
  }
  return issues;
}

// ---------------------------------------------------------------------------
// Referências do Sefaria
// ---------------------------------------------------------------------------

/**
 * Converte uma referência legível ("Genesis 1:1-5", "Berakhot 2a:3", "Pirkei Avot 1:1")
 * na URL canônica do Sefaria ("https://www.sefaria.org/Genesis.1.1-5").
 */
export function sefariaUrlForRef(ref: string): string {
  const trimmed = ref.trim();
  const match = /^(.*?)\s+(\d+[ab]?(?::\d+)*(?:-\d+[ab]?(?::\d+)*)?)$/.exec(trimmed);
  const path = match
    ? `${match[1]!.replace(/\s+/g, '_')}.${match[2]!.replace(/:/g, '.')}`
    : trimmed.replace(/\s+/g, '_');
  // encodeURI preserva '?' e '#'; codificamos os dois para a referência nunca virar consulta ou âncora.
  return `https://www.sefaria.org/${encodeURI(path).replace(/[?#]/g, (c) => encodeURIComponent(c))}`;
}

/** Chave para detectar perguntas repetidas (o hash é calculado por quem tiver `crypto`). */
export function dedupeFingerprint(question: string, correctAnswer: string): string {
  return `${normalizeForMatch(question)}|${normalizeForMatch(correctAnswer)}`;
}
