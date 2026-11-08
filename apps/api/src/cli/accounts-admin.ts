/**
 * Operações administrativas de contas, feitas só por quem tem acesso ao servidor e
 * ao banco (nunca por rota HTTP): criar revisores, dar e tirar o papel, trocar um
 * apelido ofensivo, gerar uma senha nova para quem perdeu a sua.
 */
import type { PrismaClient, UserRole } from '@trivia/db';
import { DisplayNameSchema } from '@trivia/shared';
import { randomBytes, randomInt } from 'node:crypto';
import { normalizeEmail } from '../auth/email.js';
import { hashPassword } from '../auth/passwords.js';
import { revokeAllSessions } from '../auth/sessions.js';

export type StaffRole = Extract<UserRole, 'reviewer' | 'admin'>;

/** Senha aleatória de 24 caracteres (144 bits), mostrada uma única vez. */
export function generatePassword(): string {
  return randomBytes(18).toString('base64url');
}

function revokeSessions(prisma: PrismaClient, userId: string): Promise<void> {
  return revokeAllSessions(prisma, userId, new Date());
}

async function findActive(prisma: PrismaClient, emailOrId: string) {
  const isId = /^[0-9a-f-]{36}$/i.test(emailOrId);
  const user = isId
    ? await prisma.user.findUnique({ where: { id: emailOrId } })
    : await prisma.user.findUnique({ where: { email: normalizeEmail(emailOrId) } });
  if (!user || user.deletedAt) throw new Error(`Conta não encontrada: ${emailOrId}`);
  return user;
}

export async function createStaff(prisma: PrismaClient, input: { email: string; name: string; role: StaffRole }) {
  const email = normalizeEmail(input.email);
  const name = DisplayNameSchema.safeParse(input.name);
  if (!name.success) throw new Error(`Nome inválido: ${name.error.issues[0]?.message}`);
  if (await prisma.user.findUnique({ where: { email } })) {
    throw new Error(`Já existe uma conta com ${email}. Use "grant" para dar o papel a ela.`);
  }
  const password = generatePassword();
  const user = await prisma.user.create({
    data: { email, displayName: name.data, isGuest: false, registeredAt: new Date(), role: input.role, passwordHash: await hashPassword(password) },
  });
  return { id: user.id, email, password };
}

export async function grantRole(prisma: PrismaClient, emailOrId: string, role: StaffRole) {
  const user = await findActive(prisma, emailOrId);
  if (user.isGuest || !user.email) throw new Error('Convidados não podem ser revisores: a pessoa precisa criar uma conta com e-mail antes.');
  await prisma.user.update({ where: { id: user.id }, data: { role } });
  return { id: user.id, email: user.email };
}

/** Tira o papel e encerra as sessões (o acesso cai na hora). */
export async function revokeRole(prisma: PrismaClient, emailOrId: string) {
  const user = await findActive(prisma, emailOrId);
  await prisma.user.update({ where: { id: user.id }, data: { role: 'player' } });
  await revokeSessions(prisma, user.id);
  return { id: user.id, email: user.email };
}

export async function listStaff(prisma: PrismaClient) {
  return prisma.user.findMany({
    where: { role: { in: ['reviewer', 'admin'] }, deletedAt: null },
    select: { id: true, email: true, displayName: true, role: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });
}

/** Troca um apelido que fere as regras por "Jogador NNNN". */
export async function resetName(prisma: PrismaClient, emailOrId: string) {
  const user = await findActive(prisma, emailOrId);
  const displayName = `Jogador ${1000 + randomInt(9000)}`;
  await prisma.user.update({ where: { id: user.id }, data: { displayName } });
  return { id: user.id, previous: user.displayName, displayName };
}

/**
 * Senha nova para quem perdeu a sua (enquanto não há recuperação por e-mail).
 * Confirme a identidade da pessoa por outro canal antes. Encerra todas as sessões.
 */
export async function resetPassword(prisma: PrismaClient, emailOrId: string) {
  const user = await findActive(prisma, emailOrId);
  if (user.isGuest || !user.email) throw new Error('Convidados não têm senha.');
  const password = generatePassword();
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(password) } });
  await revokeSessions(prisma, user.id);
  return { id: user.id, email: user.email, password };
}
