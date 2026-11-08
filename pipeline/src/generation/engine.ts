/**
 * Núcleo do motor de perguntas, sem banco de dados: monta as chamadas ao LLM,
 * interpreta a resposta do gerador, aplica as checagens determinísticas e roda
 * a verificação às cegas. É a parte coberta pelos testes de unidade.
 *
 * Fluxo de cada pergunta candidata:
 *   gerador → schema Zod → validateGeneratedQuestion (código) → verificador às cegas
 *   → status: rejected | pending_review | approved
 */
import {
  dedupeFingerprint,
  evaluateVerifierResult,
  GenerationOutputSchema,
  validateGeneratedQuestion,
  VerifierResultSchema,
  type GeneratedQuestion,
  type GenerationOutput,
  type SourceTexts,
  type ValidationReport,
  type VerifierResult,
  type VerifierVerdict,
} from '@trivia/shared';
import { parseModelJson, toProviderJsonSchema } from '../llm/json-schema.js';
import type { LlmProvider, StructuredRequest, TokenUsage } from '../llm/types.js';
import {
  buildGeneratorUserMessage,
  buildVerifierUserMessage,
  renderGeneratorSystem,
  renderVerifierSystem,
  type PromptPassage,
  type PromptTemplate,
} from '../prompts.js';
import { errorMessage, seededPermutation, sha256 } from '../util.js';

export interface PassageInput extends PromptPassage {
  id: string;
  heText: string | null;
  enText: string | null;
  ptText: string | null;
}

export interface EngineOptions {
  locale: string;
  nameStyle: 'portuguese' | 'transliterated';
  questionsPerPassage: number;
  maxOutputTokens: number;
  requireHumanReview: boolean;
}

export interface Engine {
  generator: LlmProvider;
  verifier: LlmProvider;
  generatorPrompt: PromptTemplate;
  verifierPrompt: PromptTemplate;
  options: EngineOptions;
}

export type CandidateStatus = 'pending_review' | 'approved' | 'rejected';

export interface VerificationRecord {
  /** Ordem em que as alternativas foram mostradas ao verificador (índices canônicos). */
  order: number[];
  expectedIndex: number;
  result?: VerifierResult;
  verdict?: VerifierVerdict;
  error?: string;
}

export interface CandidateResult {
  question: GeneratedQuestion;
  status: CandidateStatus;
  validation: ValidationReport;
  verification?: VerificationRecord;
  dedupeKey: string;
}

export interface PassageOutcome {
  passageStatus: 'generated' | 'skipped' | 'failed';
  skipReason?: string;
  error?: string;
  candidates: CandidateResult[];
  usage: TokenUsage;
}

const generatorSchema = toProviderJsonSchema(GenerationOutputSchema);
const verifierSchema = toProviderJsonSchema(VerifierResultSchema);

export function buildGeneratorRequest(engine: Engine, passage: PromptPassage): StructuredRequest {
  return {
    system: renderGeneratorSystem(engine.generatorPrompt, {
      locale: engine.options.locale,
      maxQuestions: engine.options.questionsPerPassage,
      nameStyle: engine.options.nameStyle,
    }),
    user: buildGeneratorUserMessage(passage, engine.options.questionsPerPassage),
    jsonSchema: generatorSchema,
    schemaName: 'generation_output',
    maxOutputTokens: engine.options.maxOutputTokens,
  };
}

/** Textos contra os quais a evidência é conferida: o do segmento citado, ou a passagem inteira. */
export function sourceTextsFor(passage: PassageInput, sourceRef: string): SourceTexts {
  const segment = passage.segments.find((s) => s.ref.trim() === sourceRef.trim());
  if (segment) return { he: segment.he ?? null, en: segment.en ?? null, pt: segment.pt ?? null };
  return { he: passage.heText, en: passage.enText, pt: passage.ptText };
}

export function questionDedupeKey(q: GeneratedQuestion): string {
  return sha256(dedupeFingerprint(q.question, q.options[q.correctIndex] ?? ''));
}

async function verifyQuestion(engine: Engine, passage: PassageInput, q: GeneratedQuestion): Promise<VerificationRecord & { usage: TokenUsage }> {
  const order = seededPermutation(q.options.length, `${passage.ref}|${q.question}`);
  const shown = order.map((i) => q.options[i]!);
  const expectedIndex = order.indexOf(q.correctIndex);
  const usage: TokenUsage = { inputTokens: 0, outputTokens: 0 };
  try {
    const response = await engine.verifier.complete({
      system: renderVerifierSystem(engine.verifierPrompt),
      user: buildVerifierUserMessage(passage, q.question, shown),
      jsonSchema: verifierSchema,
      schemaName: 'verifier_result',
      maxOutputTokens: 1500,
    });
    if (response.usage) {
      usage.inputTokens += response.usage.inputTokens;
      usage.outputTokens += response.usage.outputTokens;
    }
    const result = parseModelJson(response.text, VerifierResultSchema);
    return { order, expectedIndex, result, verdict: evaluateVerifierResult(result, expectedIndex), usage };
  } catch (error) {
    return { order, expectedIndex, error: errorMessage(error), usage };
  }
}

export function decideStatus(
  validation: ValidationReport,
  verification: VerificationRecord | undefined,
  requireHumanReview: boolean,
): CandidateStatus {
  if (!validation.ok) return 'rejected';
  if (!verification || verification.error) return 'pending_review'; // sem verificação: só com humano
  if (!verification.verdict?.accepted) return 'rejected';
  if (requireHumanReview || validation.warnings.length > 0) return 'pending_review';
  return 'approved';
}

/** Processa a resposta do gerador para uma passagem: valida, verifica e classifica cada pergunta. */
export async function processGeneratorText(
  engine: Engine,
  passage: PassageInput,
  text: string,
  generatorUsage?: TokenUsage,
): Promise<PassageOutcome> {
  const usage: TokenUsage = { inputTokens: generatorUsage?.inputTokens ?? 0, outputTokens: generatorUsage?.outputTokens ?? 0 };
  let output: GenerationOutput;
  try {
    output = parseModelJson(text, GenerationOutputSchema);
  } catch (error) {
    return { passageStatus: 'failed', error: errorMessage(error), candidates: [], usage };
  }
  if (output.questions.length === 0) {
    return { passageStatus: 'skipped', skipReason: output.skipReason ?? 'sem motivo informado', candidates: [], usage };
  }

  const acceptedRefs = [passage.ref, ...passage.segments.map((s) => s.ref)];
  const seen = new Set<string>();
  const candidates: CandidateResult[] = [];
  for (const question of output.questions) {
    const dedupeKey = questionDedupeKey(question);
    if (seen.has(dedupeKey)) continue; // repetida dentro da própria resposta
    seen.add(dedupeKey);

    const validation = validateGeneratedQuestion(question, sourceTextsFor(passage, question.sourceRef), acceptedRefs);
    let verification: VerificationRecord | undefined;
    if (validation.ok) {
      const { usage: vUsage, ...record } = await verifyQuestion(engine, passage, question);
      usage.inputTokens += vUsage.inputTokens;
      usage.outputTokens += vUsage.outputTokens;
      verification = record;
    }
    candidates.push({
      question,
      validation,
      ...(verification ? { verification } : {}),
      status: decideStatus(validation, verification, engine.options.requireHumanReview),
      dedupeKey,
    });
  }
  return { passageStatus: 'generated', candidates, usage };
}

/** Gera (chamada síncrona ao LLM) e processa uma passagem. */
export async function generateForPassage(engine: Engine, passage: PassageInput): Promise<PassageOutcome> {
  try {
    const response = await engine.generator.complete(buildGeneratorRequest(engine, passage));
    return await processGeneratorText(engine, passage, response.text, response.usage);
  } catch (error) {
    return { passageStatus: 'failed', error: errorMessage(error), candidates: [], usage: { inputTokens: 0, outputTokens: 0 } };
  }
}

/** Motivos de reprovação de uma candidata, para estatística e relatório. */
export function rejectionCodes(candidate: CandidateResult): string[] {
  if (candidate.status !== 'rejected') return [];
  if (!candidate.validation.ok) return candidate.validation.errors.map((e) => e.code);
  const verdict = candidate.verification?.verdict;
  if (!verdict) return ['verifier_missing'];
  const r = candidate.verification!.result!;
  const codes: string[] = [];
  if (!r.supportedByText) codes.push('verifier_unsupported');
  if (r.chosenIndex !== candidate.verification!.expectedIndex) codes.push('verifier_disagrees');
  if (new Set(r.defensibleIndexes).size > 1) codes.push('verifier_ambiguous');
  if (r.factualProblems.length) codes.push('verifier_factual');
  if (r.respectIssues.length) codes.push('verifier_respect');
  if (codes.length === 0) codes.push('verifier_low_confidence');
  return codes;
}
