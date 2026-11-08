import { z } from 'zod';
import { DifficultySchema } from './difficulty.js';
import { evidenceMatches, findDivineNameIssues, normalizeForMatch, type PolicyIssue } from './text.js';

/** Alternativas "coringa" proibidas: pioram a pergunta e confundem a verificação. */
const BANNED_OPTION_PATTERNS: readonly RegExp[] = [
  /todas as (anteriores|alternativas|op[cç][oõ]es)/i,
  /nenhuma das (anteriores|alternativas|op[cç][oõ]es)/i,
  /^ambas\b/i,
  /all of the above/i,
  /none of the above/i,
];

export const OPTION_COUNT = 4;

/** Idiomas de texto-fonte que o pipeline entrega ao LLM. */
export const SOURCE_LANGUAGES = ['he', 'en', 'pt'] as const;
export type SourceLanguage = (typeof SOURCE_LANGUAGES)[number];
export const SourceLanguageSchema = z.enum(SOURCE_LANGUAGES);
export const MAX_QUESTIONS_PER_PASSAGE = 3;

/**
 * Uma pergunta como o LLM gerador deve devolvê-la.
 * Este schema também vira o JSON Schema enviado ao provedor (structured output).
 */
export const GeneratedQuestionSchema = z.object({
  question: z.string().trim().min(10).max(220).describe('Enunciado em pt-BR, terminando em "?".'),
  options: z
    .array(z.string().trim().min(1).max(90))
    .length(OPTION_COUNT)
    .describe('Exatamente 4 alternativas curtas e mutuamente exclusivas.'),
  correctIndex: z.number().int().min(0).max(OPTION_COUNT - 1).describe('Índice (0-3) da alternativa correta.'),
  explanation: z
    .string()
    .trim()
    .min(10)
    .max(400)
    .describe('Por que a resposta está correta, baseada SOMENTE no trecho. Exibida após a resposta.'),
  sourceRef: z.string().trim().min(3).max(120).describe('Referência Sefaria exata do trecho (ex.: "Genesis 22:2").'),
  evidenceQuote: z
    .string()
    .trim()
    .min(3)
    .max(300)
    .describe('Cópia LITERAL de um pedaço do trecho que comprova a resposta.'),
  evidenceLanguage: SourceLanguageSchema.describe('Idioma do trecho de onde a evidência foi copiada (he, en ou pt).'),
  difficulty: DifficultySchema,
  difficultyRationale: z.string().trim().min(5).max(300).describe('Justificativa curta do nível, citando a rubrica.'),
});
export type GeneratedQuestion = z.infer<typeof GeneratedQuestionSchema>;

/** Resposta completa do gerador para UMA passagem. */
export const GenerationOutputSchema = z
  .object({
    passageRef: z.string().trim().min(3).max(120),
    questions: z.array(GeneratedQuestionSchema).max(MAX_QUESTIONS_PER_PASSAGE),
    skipReason: z
      .string()
      .trim()
      .max(300)
      .nullable()
      .describe('Preenchido quando o trecho não sustenta nenhuma boa pergunta.'),
  })
  .superRefine((output, ctx) => {
    if (output.questions.length === 0 && !output.skipReason) {
      ctx.addIssue({
        code: 'custom',
        path: ['skipReason'],
        message: 'Sem perguntas geradas: skipReason é obrigatório.',
      });
    }
  });
export type GenerationOutput = z.infer<typeof GenerationOutputSchema>;

/**
 * Resposta do verificador. Ele recebe o trecho e a pergunta com as alternativas
 * embaralhadas, SEM o gabarito, e responde às cegas.
 */
export const VerifierResultSchema = z.object({
  chosenIndex: z
    .number()
    .int()
    .min(0)
    .max(OPTION_COUNT - 1)
    .nullable()
    .describe('Alternativa que o trecho sustenta como correta; null se o trecho não permite responder.'),
  defensibleIndexes: z
    .array(z.number().int().min(0).max(OPTION_COUNT - 1))
    .max(OPTION_COUNT)
    .describe('TODAS as alternativas que poderiam ser defendidas como corretas com base no trecho.'),
  supportedByText: z.boolean().describe('A pergunta pode ser respondida apenas com o trecho fornecido?'),
  factualProblems: z.array(z.string().max(300)).max(10),
  respectIssues: z.array(z.string().max(300)).max(10),
  confidence: z.number().min(0).max(1),
  notes: z.string().max(500),
});
export type VerifierResult = z.infer<typeof VerifierResultSchema>;

export const VERIFIER_MIN_CONFIDENCE = 0.7;

export interface VerifierVerdict {
  accepted: boolean;
  reasons: string[];
}

/**
 * Decide se a verificação às cegas aprova a pergunta.
 * @param expectedIndex índice da alternativa correta NA ORDEM mostrada ao verificador.
 */
export function evaluateVerifierResult(
  result: VerifierResult,
  expectedIndex: number,
  minConfidence = VERIFIER_MIN_CONFIDENCE,
): VerifierVerdict {
  const reasons: string[] = [];
  if (!result.supportedByText) reasons.push('O verificador não conseguiu responder só com o trecho.');
  if (result.chosenIndex !== expectedIndex) reasons.push('A resposta do verificador diverge do gabarito.');
  const defensible = new Set(result.defensibleIndexes);
  if (defensible.size > 1) reasons.push('Mais de uma alternativa é defensável.');
  if (defensible.size === 1 && !defensible.has(expectedIndex)) {
    reasons.push('A única alternativa defensável não é o gabarito.');
  }
  if (result.factualProblems.length > 0) reasons.push(`Problemas factuais: ${result.factualProblems.join('; ')}`);
  if (result.respectIssues.length > 0) reasons.push(`Problemas de respeito: ${result.respectIssues.join('; ')}`);
  if (result.confidence < minConfidence) {
    reasons.push(`Confiança ${result.confidence.toFixed(2)} abaixo do mínimo ${minConfidence}.`);
  }
  return { accepted: reasons.length === 0, reasons };
}

// ---------------------------------------------------------------------------
// Validação determinística (sem LLM)
// ---------------------------------------------------------------------------

export interface SourceTexts {
  he?: string | null;
  en?: string | null;
  pt?: string | null;
  /** Textos auxiliares entregues ao LLM junto com o trecho (ex.: comentário de Rashi). */
  extra?: readonly string[];
}

export type ValidationIssueCode =
  | PolicyIssue['code']
  | 'evidence_not_found'
  | 'source_ref_mismatch'
  | 'duplicate_options'
  | 'banned_option'
  | 'answer_in_question'
  | 'answer_length_tell'
  | 'missing_question_mark';

export interface ValidationIssue {
  code: ValidationIssueCode;
  severity: 'error' | 'warning';
  message: string;
}

export interface ValidationReport {
  ok: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}

/**
 * Checagens determinísticas aplicadas a TODA pergunta gerada, antes do verificador.
 * Erros reprovam a pergunta; avisos vão para o relatório e para a fila de revisão.
 */
export function validateGeneratedQuestion(
  q: GeneratedQuestion,
  source: SourceTexts,
  /** Referência(s) aceitas para `sourceRef`: a da passagem e/ou as de seus segmentos. */
  expectedRef?: string | readonly string[],
): ValidationReport {
  const issues: ValidationIssue[] = [];

  // 1. A evidência precisa existir literalmente no texto entregue ao modelo.
  const primary = source[q.evidenceLanguage];
  const candidates = [primary, ...(source.extra ?? [])].filter((t): t is string => !!t);
  if (!candidates.some((text) => evidenceMatches(text, q.evidenceQuote))) {
    issues.push({
      code: 'evidence_not_found',
      severity: 'error',
      message: 'evidenceQuote não foi encontrado no texto-fonte fornecido.',
    });
  }

  // 2. A referência devolvida deve ser a da passagem enviada (ou de um de seus segmentos).
  const accepted = expectedRef === undefined ? [] : typeof expectedRef === 'string' ? [expectedRef] : expectedRef;
  if (accepted.length > 0 && !accepted.some((ref) => normalizeForMatch(ref) === normalizeForMatch(q.sourceRef))) {
    issues.push({
      code: 'source_ref_mismatch',
      severity: 'error',
      message: `sourceRef "${q.sourceRef}" não pertence à passagem enviada (${accepted[0]}).`,
    });
  }

  // 3. Alternativas distintas e sem coringas.
  const normalizedOptions = q.options.map(normalizeForMatch);
  if (new Set(normalizedOptions).size !== normalizedOptions.length) {
    issues.push({ code: 'duplicate_options', severity: 'error', message: 'Há alternativas repetidas.' });
  }
  q.options.forEach((option, i) => {
    if (BANNED_OPTION_PATTERNS.some((re) => re.test(option))) {
      issues.push({
        code: 'banned_option',
        severity: 'error',
        message: `Alternativa ${i + 1} usa um coringa proibido ("${option}").`,
      });
    }
  });

  // 4. Política de Nomes Divinos no texto gerado (não se aplica à citação literal).
  for (const text of [q.question, q.explanation, ...q.options]) {
    for (const issue of findDivineNameIssues(text)) {
      issues.push({ ...issue });
    }
  }

  // 5. Sinais de pergunta mal formulada.
  const correct = q.options[q.correctIndex] ?? '';
  const normCorrect = normalizeForMatch(correct);
  if (normCorrect.split(' ').length >= 2 && ` ${normalizeForMatch(q.question)} `.includes(` ${normCorrect} `)) {
    issues.push({
      code: 'answer_in_question',
      severity: 'warning',
      message: 'O texto da alternativa correta aparece no enunciado.',
    });
  }
  const others = q.options.filter((_, i) => i !== q.correctIndex);
  const avgOthers = others.reduce((sum, o) => sum + o.length, 0) / Math.max(others.length, 1);
  if (avgOthers > 0 && correct.length > avgOthers * 1.6 && correct.length - avgOthers > 15) {
    issues.push({
      code: 'answer_length_tell',
      severity: 'warning',
      message: 'A alternativa correta é bem mais longa que as outras (entrega a resposta).',
    });
  }
  if (!q.question.trim().endsWith('?')) {
    issues.push({ code: 'missing_question_mark', severity: 'warning', message: 'O enunciado não termina em "?".' });
  }

  // Deduplica avisos idênticos (ex.: "Deus" em duas alternativas).
  const unique = issues.filter(
    (issue, i, all) => all.findIndex((o) => o.code === issue.code && o.message === issue.message) === i,
  );
  const errors = unique.filter((i) => i.severity === 'error');
  const warnings = unique.filter((i) => i.severity === 'warning');
  return { ok: errors.length === 0, errors, warnings };
}
