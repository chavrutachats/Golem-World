import { describe, expect, it } from 'vitest';
import {
  buildGeneratorUserMessage,
  buildVerifierUserMessage,
  loadPrompt,
  parsePromptFile,
  renderGeneratorSystem,
  renderTemplate,
  renderVerifierSystem,
} from '../src/prompts.js';

const passage = {
  ref: 'Genesis 1:1-2',
  bookTitle: 'Genesis',
  category: 'torah' as const,
  segments: [
    { ref: 'Genesis 1:1', he: 'בְּרֵאשִׁית בָּרָא', en: 'In the beginning' },
    { ref: 'Genesis 1:2', en: 'Now the earth <was> unformed', pt: 'A terra era sem forma' },
  ],
};

describe('prompts versionados', () => {
  it('carregam com id e versão', () => {
    expect(loadPrompt('generator')).toMatchObject({ id: 'generator', version: expect.stringMatching(/^\d+\.\d+\.\d+$/) });
    expect(loadPrompt('verifier')).toMatchObject({ id: 'verifier' });
  });

  it('o gerador renderiza sem placeholders sobrando e com as regras essenciais', () => {
    const system = renderGeneratorSystem(loadPrompt('generator'), {
      locale: 'pt-BR',
      maxQuestions: 2,
      nameStyle: 'portuguese',
    });
    expect(system).not.toMatch(/\{\{/);
    expect(system).toContain("D'us");
    expect(system).toContain('Hashem');
    expect(system).toContain('evidenceQuote');
    expect(system).toContain('`expert` (Especialista)');
    expect(system).toContain('Abraão');
  });

  it('o estilo de nomes pode ser transliterado', () => {
    const system = renderGeneratorSystem(loadPrompt('generator'), {
      locale: 'pt-BR',
      maxQuestions: 1,
      nameStyle: 'transliterated',
    });
    expect(system).toContain('Avraham');
  });

  it('o verificador não recebe o gabarito', () => {
    const system = renderVerifierSystem(loadPrompt('verifier'));
    expect(system).toContain('às cegas');
    const user = buildVerifierUserMessage(passage, 'O que foi criado?', ['A', 'B', 'C', 'D']);
    expect(user).toContain('<option index="3">D</option>');
    expect(user).not.toMatch(/correct/i);
  });

  it('placeholders sem valor são erro, não texto vazio', () => {
    expect(() => renderTemplate('Olá {{NOME}}', {})).toThrow(/NOME/);
    expect(() => parsePromptFile('sem front matter')).toThrow();
  });
});

describe('mensagem da passagem', () => {
  it('inclui cada segmento com sua referência e idiomas, sem quebrar a marcação', () => {
    const user = buildGeneratorUserMessage(passage, 2);
    expect(user).toContain('<passage ref="Genesis 1:1-2" book="Genesis" category="Torá">');
    expect(user).toContain('<segment ref="Genesis 1:2">');
    expect(user).toContain('<pt>A terra era sem forma</pt>');
    expect(user).toContain('Now the earth was unformed');
    expect(user).toContain('Gere até 2 pergunta(s)');
  });
});
