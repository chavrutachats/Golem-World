/**
 * Política de senha, igual no app e na API.
 *
 * Segue a linha do OWASP ASVS e do NIST SP 800-63B: senha comprida em vez de
 * regras de composição ("uma maiúscula, um símbolo…"), sem troca obrigatória, e
 * recusando senhas óbvias. A API ainda confere contra uma lista de senhas
 * vazadas/comuns, que não vai no app para não aumentar o download.
 */
import { z } from 'zod';

export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

/** Palavras do próprio serviço, que tornam a senha fácil de adivinhar. */
const SERVICE_WORDS = ['trivia', 'triviatora', 'tora', 'torah', 'sefaria', 'senha', 'password'];

function fold(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase();
}

/** Sequências como "123456789012", "abcdefghijkl" ou "987654321098" (andando de 1 em 1). */
function isSequential(text: string): boolean {
  if (text.length < 4) return false;
  const codes = [...text].map((c) => c.codePointAt(0)!);
  const step = codes[1]! - codes[0]!;
  if (Math.abs(step) !== 1) return false;
  return codes.every(
    (c, i) =>
      i === 0 ||
      c - codes[i - 1]! === step || (step === 1 && codes[i - 1] === 57 && c === 48) || (step === -1 && codes[i - 1] === 48 && c === 57),
  );
}

/**
 * Motivo para recusar a senha, ou null se estiver boa.
 * `context` são dados da própria conta (e-mail, nome), que não podem compor a senha.
 */
export function passwordProblem(password: string, context: { email?: string | null; displayName?: string | null } = {}): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) return `Use pelo menos ${PASSWORD_MIN_LENGTH} caracteres.`;
  if (password.length > PASSWORD_MAX_LENGTH) return `Use no máximo ${PASSWORD_MAX_LENGTH} caracteres.`;
  const folded = fold(password);
  const compact = folded.replace(/[\s._-]+/g, '');
  if (new Set(compact).size <= 3) return 'Essa senha repete poucos caracteres. Escolha uma mais variada.';
  if (isSequential(compact)) return 'Essa senha é uma sequência óbvia. Escolha outra.';

  // Sem as palavras do serviço e sem o que sobra quando se tira número e símbolo ("trivia2026!!").
  const lettersOnly = compact.replace(/[^\p{L}]/gu, '');
  if (SERVICE_WORDS.includes(lettersOnly)) return 'Essa senha é fácil de adivinhar. Escolha outra.';

  const personal = [context.email?.split('@')[0], context.displayName]
    .map((v) => (v ? fold(v).replace(/[\s._-]+/g, '') : ''))
    .filter((v) => v.length >= 4);
  if (personal.some((p) => compact.includes(p))) return 'A senha não pode conter seu e-mail ou seu nome.';
  return null;
}

/** Senha nova (cadastro e troca). O login aceita qualquer senha já cadastrada. */
export const NewPasswordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Use pelo menos ${PASSWORD_MIN_LENGTH} caracteres.`)
  .max(PASSWORD_MAX_LENGTH, `Use no máximo ${PASSWORD_MAX_LENGTH} caracteres.`);
