/**
 * CLI de contas da equipe. Uso: `pnpm reviewers <comando> [opções]` (na raiz).
 * Precisa só de DATABASE_URL (lida do .env da raiz).
 */
import { createPrismaClient } from '@trivia/db';
import { config as loadEnv } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { createStaff, grantRole, listStaff, resetName, resetPassword, revokeRole, type StaffRole } from './accounts-admin.js';

const HELP = `
Contas da equipe — trivia-torah

  pnpm reviewers create --email ana@exemplo.com --name "Ana" [--role reviewer|admin]
      Cria uma conta de revisor e mostra a senha gerada (uma única vez).

  pnpm reviewers grant  --email ana@exemplo.com [--role reviewer|admin]
      Dá o papel a uma conta que já existe (precisa ter e-mail; convidado não pode).

  pnpm reviewers revoke --email ana@exemplo.com
      Tira o papel e encerra todas as sessões dessa conta na hora.

  pnpm reviewers list
      Lista revisores e admins.

  pnpm reviewers reset-name --user <e-mail ou id>
      Troca um apelido ofensivo por "Jogador NNNN".

  pnpm reviewers reset-password --email ana@exemplo.com
      Gera uma senha nova para quem perdeu a sua (confirme a identidade antes por outro
      canal) e encerra todas as sessões dessa conta.
`;

async function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
  loadEnv({ path: path.join(root, '.env'), quiet: true });
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      email: { type: 'string' },
      user: { type: 'string' },
      name: { type: 'string' },
      role: { type: 'string', default: 'reviewer' },
      help: { type: 'boolean', short: 'h' },
    },
  });
  const command = positionals[0];
  if (!command || values.help || command === 'help') {
    console.log(HELP);
    return;
  }
  const role = values.role as StaffRole;
  if (role !== 'reviewer' && role !== 'admin') throw new Error('--role precisa ser reviewer ou admin.');
  const need = (value: string | undefined, flag: string) => {
    if (!value) throw new Error(`Informe ${flag}.`);
    return value;
  };

  const prisma = createPrismaClient();
  try {
    switch (command) {
      case 'create': {
        const r = await createStaff(prisma, { email: need(values.email, '--email'), name: need(values.name, '--name'), role });
        console.log(`Conta criada: ${r.email} (${role})`);
        console.log(`Senha: ${r.password}`);
        console.log('Ela não será mostrada de novo. Entregue por um canal seguro e peça para trocar no app (Perfil, Conta e segurança).');
        break;
      }
      case 'grant': {
        const r = await grantRole(prisma, need(values.email ?? values.user, '--email'), role);
        console.log(`${r.email} agora é ${role}.`);
        break;
      }
      case 'revoke': {
        const r = await revokeRole(prisma, need(values.email ?? values.user, '--email'));
        console.log(`${r.email ?? r.id} voltou a ser jogador; sessões encerradas.`);
        break;
      }
      case 'list': {
        const staff = await listStaff(prisma);
        if (!staff.length) console.log('Nenhum revisor ainda. Crie com: pnpm reviewers create --email ... --name ...');
        for (const s of staff) console.log(`${s.role.padEnd(8)} ${s.email ?? '-'}  ${s.displayName}  (desde ${s.createdAt.toISOString().slice(0, 10)})`);
        break;
      }
      case 'reset-name': {
        const r = await resetName(prisma, need(values.user ?? values.email, '--user'));
        console.log(`Apelido "${r.previous}" trocado por "${r.displayName}".`);
        break;
      }
      case 'reset-password': {
        const r = await resetPassword(prisma, need(values.email ?? values.user, '--email'));
        console.log(`Senha nova de ${r.email}: ${r.password}`);
        console.log('Todas as sessões dessa conta foram encerradas. Peça para a pessoa trocar a senha no app.');
        break;
      }
      default:
        console.log(HELP);
        process.exitCode = 1;
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
