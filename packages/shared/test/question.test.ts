import { describe, expect, it } from 'vitest';
import { QuestionForPlayerSchema } from '../src/api-contracts.js';
import {
  evaluateVerifierResult,
  GenerationOutputSchema,
  GeneratedQuestionSchema,
  validateGeneratedQuestion,
  type GeneratedQuestion,
  type VerifierResult,
} from '../src/question.schema.js';
import { GENESIS_22_2_EN, GENESIS_22_2_HE } from './fixtures.js';

const source = { he: GENESIS_22_2_HE, en: GENESIS_22_2_EN };

function makeQuestion(overrides: Partial<GeneratedQuestion> = {}): GeneratedQuestion {
  return GeneratedQuestionSchema.parse({
    question: 'Para qual terra Abraão foi enviado com Isaque?',
    options: ['Terra de Moriá', 'Terra de Canaã', 'Terra de Goshen', 'Terra de Ur'],
    correctIndex: 0,
    explanation: 'O versículo diz explicitamente que Abraão deveria ir à terra de Moriá.',
    sourceRef: 'Genesis 22:2',
    evidenceQuote: 'get thee into the land of Moriah',
    evidenceLanguage: 'en',
    difficulty: 'easy',
    difficultyRationale: 'Fato explícito e central do relato da Akedá.',
    ...overrides,
  });
}

describe('validateGeneratedQuestion', () => {
  it('aprova uma pergunta fiel ao trecho', () => {
    const report = validateGeneratedQuestion(makeQuestion(), source, 'Genesis 22:2');
    expect(report.errors).toEqual([]);
    expect(report.ok).toBe(true);
  });

  it('aceita evidência no hebraico original', () => {
    const q = makeQuestion({ evidenceQuote: 'אל ארץ המריה', evidenceLanguage: 'he' });
    expect(validateGeneratedQuestion(q, source).ok).toBe(true);
  });

  it('reprova evidência que não existe no trecho', () => {
    const q = makeQuestion({ evidenceQuote: 'get thee into the land of Canaan' });
    const report = validateGeneratedQuestion(q, source);
    expect(report.ok).toBe(false);
    expect(report.errors.map((e) => e.code)).toContain('evidence_not_found');
  });

  it('reprova evidência no idioma errado', () => {
    // A citação existe em inglês, mas foi marcada como hebraico.
    const q = makeQuestion({ evidenceLanguage: 'he' });
    expect(validateGeneratedQuestion(q, source).errors.map((e) => e.code)).toContain('evidence_not_found');
  });

  it('reprova referência trocada', () => {
    const report = validateGeneratedQuestion(makeQuestion({ sourceRef: 'Genesis 21:2' }), source, 'Genesis 22:2');
    expect(report.errors.map((e) => e.code)).toContain('source_ref_mismatch');
  });

  it('reprova alternativas repetidas e coringas', () => {
    const dup = makeQuestion({ options: ['Moriá', 'moriá', 'Canaã', 'Ur'] });
    expect(validateGeneratedQuestion(dup, source).errors.map((e) => e.code)).toContain('duplicate_options');

    const banned = makeQuestion({ options: ['Moriá', 'Canaã', 'Ur', 'Todas as anteriores'] });
    expect(validateGeneratedQuestion(banned, source).errors.map((e) => e.code)).toContain('banned_option');
  });

  it('reprova o Tetragrama por extenso no enunciado', () => {
    const q = makeQuestion({ question: 'Para qual terra יהוה enviou Abraão com Isaque?' });
    expect(validateGeneratedQuestion(q, source).errors.map((e) => e.code)).toContain('tetragrammaton_spelled_out');
  });

  it('avisa quando a alternativa correta é muito mais longa que as outras', () => {
    const q = makeQuestion({
      options: ['A terra de Moriá, num dos montes que Ele indicaria', 'Canaã', 'Goshen', 'Ur'],
    });
    const report = validateGeneratedQuestion(q, source);
    expect(report.ok).toBe(true);
    expect(report.warnings.map((w) => w.code)).toContain('answer_length_tell');
  });
});

describe('GenerationOutputSchema', () => {
  it('exige skipReason quando nenhuma pergunta foi gerada', () => {
    expect(GenerationOutputSchema.safeParse({ passageRef: 'Genesis 22:2', questions: [], skipReason: null }).success).toBe(
      false,
    );
    expect(
      GenerationOutputSchema.safeParse({
        passageRef: 'Genesis 36:20',
        questions: [],
        skipReason: 'Lista genealógica sem conteúdo para uma pergunta justa.',
      }).success,
    ).toBe(true);
  });

  it('limita a 3 perguntas por passagem', () => {
    const q = makeQuestion();
    const r = GenerationOutputSchema.safeParse({ passageRef: 'Genesis 22:2', questions: [q, q, q, q], skipReason: null });
    expect(r.success).toBe(false);
  });
});

describe('evaluateVerifierResult', () => {
  const base: VerifierResult = {
    chosenIndex: 2,
    defensibleIndexes: [2],
    supportedByText: true,
    factualProblems: [],
    respectIssues: [],
    confidence: 0.92,
    notes: '',
  };

  it('aceita quando o verificador chega ao mesmo gabarito com uma única resposta defensável', () => {
    expect(evaluateVerifierResult(base, 2)).toEqual({ accepted: true, reasons: [] });
  });

  it('rejeita divergência, ambiguidade, baixa confiança e problemas de respeito', () => {
    expect(evaluateVerifierResult(base, 1).accepted).toBe(false);
    expect(evaluateVerifierResult({ ...base, defensibleIndexes: [1, 2] }, 2).accepted).toBe(false);
    expect(evaluateVerifierResult({ ...base, confidence: 0.4 }, 2).accepted).toBe(false);
    expect(evaluateVerifierResult({ ...base, respectIssues: ['tom irônico'] }, 2).accepted).toBe(false);
    expect(evaluateVerifierResult({ ...base, chosenIndex: null, supportedByText: false }, 2).accepted).toBe(false);
  });
});

describe('contrato QuestionForPlayer', () => {
  it('nunca deixa o gabarito chegar ao app, mesmo que o servidor o inclua por engano', () => {
    const parsed = QuestionForPlayerSchema.parse({
      playId: '3f1c2a52-8a65-4d0e-9d55-2f8f7f1f3c11',
      category: 'torah',
      difficulty: 'easy',
      isCrownChallenge: false,
      text: 'Para qual terra Abraão foi enviado?',
      context: null,
      options: ['Moriá', 'Canaã', 'Goshen', 'Ur'],
      optionsDirection: 'ltr',
      servedAt: '2026-10-28T22:00:00.000Z',
      deadlineAt: '2026-10-28T22:00:30.000Z',
      serverNow: '2026-10-28T22:00:00.000Z',
      timeLimitSeconds: 30,
      correctIndex: 0,
      sourceRef: 'Genesis 22:2',
    });
    expect(parsed).not.toHaveProperty('correctIndex');
    expect(parsed).not.toHaveProperty('sourceRef');
  });
});
