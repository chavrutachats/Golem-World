import { beforeAll, describe, expect, it } from 'vitest';
import type { GeneratedQuestion, VerifierResult } from '@trivia/shared';
import { generateForPassage, type Engine, type PassageInput } from '../src/generation/engine.js';
import { buildPassageDrafts } from '../src/ingest/ingest.js';
import { FakeProvider } from '../src/llm/fake.js';
import { loadPrompt } from '../src/prompts.js';
import { groupBooks, loadBooksIndex } from '../src/sefaria/books-index.js';
import { loadBookStructure } from '../src/sefaria/export-reader.js';
import { chooseVersions, loadLocalVersions } from '../src/sefaria/versions.js';
import { FIXTURE_EXPORT, lightQuestion } from './helpers.js';

let passage: PassageInput;

beforeAll(async () => {
  const index = await loadBooksIndex(FIXTURE_EXPORT);
  const group = groupBooks(index, { titles: ['Genesis'], languages: ['he', 'en'] })[0]!;
  const structure = await loadBookStructure(FIXTURE_EXPORT, 'Genesis');
  if (!structure.simple) throw new Error('fixture inválida');
  const { chosen } = chooseVersions(await loadLocalVersions(FIXTURE_EXPORT, group), ['he', 'en'], {
    allowedLicenses: ['Public Domain', 'CC-BY-SA'],
    authorizedVersions: [],
  });
  const draft = buildPassageDrafts(group, structure.addressTypes, chosen)[0]!;
  passage = { id: '00000000-0000-0000-0000-000000000001', ...draft };
});

/** Verificador "honesto": responde a alternativa cujo texto é o gabarito informado. */
function honestVerifier(answers: Record<string, string>, extra: Partial<VerifierResult> = {}) {
  return new FakeProvider('fake-verifier', (req) => {
    const question = /<text>(.*?)<\/text>/s.exec(req.user)![1]!;
    const options = [...req.user.matchAll(/<option index="(\d)">(.*?)<\/option>/g)].map((m) => m[2]!);
    const idx = options.indexOf(answers[question] ?? '');
    return {
      chosenIndex: idx >= 0 ? idx : null,
      defensibleIndexes: idx >= 0 ? [idx] : [],
      supportedByText: idx >= 0,
      factualProblems: [],
      respectIssues: [],
      confidence: 0.95,
      notes: 'ok',
      ...extra,
    } satisfies VerifierResult;
  });
}

function engineWith(questions: GeneratedQuestion[] | string, verifier: FakeProvider, requireHumanReview = false): Engine {
  const generator = new FakeProvider('fake-generator', () =>
    typeof questions === 'string'
      ? questions
      : { passageRef: passage.ref, questions, skipReason: questions.length ? null : 'trecho sem pergunta justa' },
  );
  return {
    generator,
    verifier,
    generatorPrompt: loadPrompt('generator'),
    verifierPrompt: loadPrompt('verifier'),
    options: { locale: 'pt-BR', nameStyle: 'portuguese', questionsPerPassage: 2, maxOutputTokens: 4000, requireHumanReview },
  };
}

const ANSWERS = { [lightQuestion().question]: 'A luz' };

describe('motor de perguntas', () => {
  it('aprova uma pergunta fiel ao trecho e confirmada às cegas', async () => {
    const outcome = await generateForPassage(engineWith([lightQuestion()], honestVerifier(ANSWERS)), passage);
    expect(outcome.passageStatus).toBe('generated');
    expect(outcome.candidates).toHaveLength(1);
    expect(outcome.candidates[0]).toMatchObject({ status: 'approved', verification: { verdict: { accepted: true } } });
  });

  it('com revisão humana obrigatória, a pergunta aprovada vai para a fila', async () => {
    const outcome = await generateForPassage(engineWith([lightQuestion()], honestVerifier(ANSWERS), true), passage);
    expect(outcome.candidates[0]!.status).toBe('pending_review');
  });

  it('o verificador recebe as alternativas embaralhadas, e o gabarito é remapeado', async () => {
    const verifier = honestVerifier(ANSWERS);
    await generateForPassage(engineWith([lightQuestion()], verifier), passage);
    const shown = [...verifier.calls[0]!.user.matchAll(/<option index="\d">(.*?)<\/option>/g)].map((m) => m[1]);
    expect(shown.sort()).toEqual([...lightQuestion().options].sort());
  });

  it('reprova evidência inventada sem nem chamar o verificador', async () => {
    const verifier = honestVerifier(ANSWERS);
    const q = lightQuestion({ evidenceQuote: 'Let there be stars in the heaven' });
    const outcome = await generateForPassage(engineWith([q], verifier), passage);
    expect(outcome.candidates[0]).toMatchObject({ status: 'rejected' });
    expect(outcome.candidates[0]!.validation.errors.map((e) => e.code)).toContain('evidence_not_found');
    expect(verifier.calls).toHaveLength(0);
  });

  it('confere a evidência no segmento citado, não no trecho todo', async () => {
    // A frase existe em 1:3, mas a pergunta diz que vem de 1:1.
    const outcome = await generateForPassage(
      engineWith([lightQuestion({ sourceRef: 'Genesis 1:1' })], honestVerifier(ANSWERS)),
      passage,
    );
    expect(outcome.candidates[0]!.validation.errors.map((e) => e.code)).toContain('evidence_not_found');
  });

  it('reprova referência que não pertence à passagem', async () => {
    const outcome = await generateForPassage(
      engineWith([lightQuestion({ sourceRef: 'Genesis 3:1' })], honestVerifier(ANSWERS)),
      passage,
    );
    expect(outcome.candidates[0]!.validation.errors.map((e) => e.code)).toContain('source_ref_mismatch');
  });

  it('reprova quando o verificador discorda do gabarito', async () => {
    const verifier = honestVerifier({ [lightQuestion().question]: 'O firmamento' });
    const outcome = await generateForPassage(engineWith([lightQuestion()], verifier), passage);
    expect(outcome.candidates[0]!.status).toBe('rejected');
    expect(outcome.candidates[0]!.verification?.verdict?.reasons.join(' ')).toMatch(/diverge/);
  });

  it('reprova pergunta ambígua (duas alternativas defensáveis)', async () => {
    const verifier = honestVerifier(ANSWERS, { defensibleIndexes: [0, 1] });
    const outcome = await generateForPassage(engineWith([lightQuestion()], verifier), passage);
    expect(outcome.candidates[0]!.status).toBe('rejected');
  });

  it('se o verificador falhar, a pergunta só segue com revisão humana', async () => {
    const broken = new FakeProvider('fake-verifier', () => {
      throw new Error('timeout');
    });
    const outcome = await generateForPassage(engineWith([lightQuestion()], broken), passage);
    expect(outcome.candidates[0]).toMatchObject({ status: 'pending_review', verification: { error: 'timeout' } });
  });

  it('avisos de estilo mandam a pergunta para revisão humana', async () => {
    const q = lightQuestion({ question: 'No relato da criação em Bereshit, o que Deus cria com a primeira fala do texto?' });
    const outcome = await generateForPassage(engineWith([q], honestVerifier({ [q.question]: 'A luz' })), passage);
    expect(outcome.candidates[0]!.status).toBe('pending_review');
    expect(outcome.candidates[0]!.validation.warnings.map((w) => w.code)).toContain('divine_name_style');
  });

  it('descarta perguntas repetidas na mesma resposta', async () => {
    const outcome = await generateForPassage(engineWith([lightQuestion(), lightQuestion()], honestVerifier(ANSWERS)), passage);
    expect(outcome.candidates).toHaveLength(1);
  });

  it('registra quando o modelo recusa o trecho', async () => {
    const outcome = await generateForPassage(engineWith([], honestVerifier(ANSWERS)), passage);
    expect(outcome).toMatchObject({ passageStatus: 'skipped', skipReason: 'trecho sem pergunta justa' });
  });

  it('marca falha quando a resposta não é JSON válido', async () => {
    const outcome = await generateForPassage(engineWith('desculpe, não consigo', honestVerifier(ANSWERS)), passage);
    expect(outcome).toMatchObject({ passageStatus: 'failed', error: expect.stringMatching(/JSON/) });
  });
});
