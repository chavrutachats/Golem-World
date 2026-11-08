import { describe, expect, it } from 'vitest';
import {
  ChangePasswordRequestSchema,
  DeleteAccountRequestSchema,
  DisplayNameSchema,
  displayNameProblem,
  passwordProblem,
  RegisterRequestSchema,
} from '../src/index.js';

describe('apelidos', () => {
  it.each(['Saymon', 'Shimon Pires', 'Ester_2026', 'Visitante 4821', 'Nazir', 'Badminton', 'Assis', 'Hitchcock', 'Dickens', 'Cunha', 'שמעון', 'Computador', 'Ana kkkk'])(
    'aceita nomes comuns: %s',
    (name) => {
      expect(displayNameProblem(name)).toBeNull();
    },
  );

  it.each(['Admin', 'admin123', 'A.d.m.i.n', '4dm1n', 'Moderador Chefe', 'Sefaria', 'Suporte', 'conta excluida', 'Trivia Torá'])(
    'recusa nomes reservados: %s',
    (name) => {
      expect(displayNameProblem(name)).toMatch(/reservado/);
    },
  );

  it.each(['Hitler', 'xHitlerx', 'Nazi', 'nazista 88', '1488', 'Sieg Heil', 'merdaaa', 'P0rra', 'filho da puta', 'fuck you'])(
    'recusa ofensas e discurso de ódio: %s',
    (name) => {
      expect(displayNameProblem(name)).toMatch(/não pode ser usado/);
    },
  );

  it('recusa alfabetos com letras iguais às latinas e letras latinas disfarçadas', () => {
    for (const name of ['Аdmin', 'Adмin', 'Hіtler', 'Αdmin']) expect(DisplayNameSchema.safeParse(name).success).toBe(false);
    expect(displayNameProblem('Hıtler')).toMatch(/não pode ser usado/);
    expect(displayNameProblem('Admın')).toMatch(/reservado/);
    for (const name of ['José', 'Ângela', 'Łukasz', 'שמעון בן דוד', 'Noa_2026']) expect(DisplayNameSchema.safeParse(name).success).toBe(true);
    // Acento combinado vira a letra composta antes de contar o tamanho.
    expect(DisplayNameSchema.parse('Jose\u0301')).toBe('José');
  });

  it('o schema mostra o motivo para o jogador', () => {
    const res = DisplayNameSchema.safeParse('Admin');
    expect(res.success).toBe(false);
    expect(res.error?.issues[0]?.message).toMatch(/reservado/);
  });
});

describe('senhas', () => {
  it('exige pelo menos 12 caracteres', () => {
    expect(passwordProblem('curta-1')).toMatch(/12/);
    expect(RegisterRequestSchema.safeParse({ email: 'a@b.com', password: 'onze-chars1', displayName: 'Ana' }).success).toBe(false);
    expect(RegisterRequestSchema.safeParse({ email: 'a@b.com', password: 'cavalo-bateria-grampo', displayName: 'Ana' }).success).toBe(true);
  });

  it.each(['aaaaaaaaaaaa', 'abababababab', '123456789012', 'abcdefghijklm', '987654321098', 'Trivia2026!!!', 'senha@@@1234'])(
    'recusa senhas óbvias: %s',
    (pw) => {
      expect(passwordProblem(pw)).not.toBeNull();
    },
  );

  it('recusa senha com o e-mail ou o nome da pessoa', () => {
    expect(passwordProblem('saymon.pires2026', { email: 'saymon.pires@exemplo.com' })).toMatch(/e-mail ou seu nome/);
    expect(passwordProblem('EsterRainha!!2026', { displayName: 'Ester' })).toMatch(/e-mail ou seu nome/);
  });

  it('aceita frase-senha', () => {
    expect(passwordProblem('menorá de sete braços', { email: 'ana@exemplo.com', displayName: 'Ana' })).toBeNull();
  });

  it('troca de senha e exclusão de conta validam a entrada', () => {
    expect(ChangePasswordRequestSchema.safeParse({ currentPassword: 'x', newPassword: 'curta' }).success).toBe(false);
    expect(DeleteAccountRequestSchema.safeParse({}).success).toBe(false);
    expect(DeleteAccountRequestSchema.safeParse({ confirm: true }).success).toBe(true);
  });
});
