/**
 * Encerrar todas as sessões de uma conta, num só lugar (API e CLI usam o mesmo código).
 *
 * Além dos refresh tokens ativos, derruba os que acabaram de girar e ainda estão na
 * tolerância de reuso (REUSE_GRACE_MS): sem isso, um ladrão que renovasse a cada
 * minuto sempre teria um token "recém-girado" para trocar por um par novo, e "sair
 * de todos os aparelhos" ou a troca de senha não o tirariam.
 * Também aumenta a versão de sessão, o que invalida na hora os tokens de acesso.
 */
import type { Prisma, PrismaClient } from '@trivia/db';

export const REUSE_GRACE_MS = 60_000;

type Db = PrismaClient | Prisma.TransactionClient;

export async function revokeAllSessions(db: Db, userId: string, now: Date): Promise<void> {
  await db.refreshToken.updateMany({
    where: {
      userId,
      OR: [
        { revokedAt: null },
        { revokedReason: { in: ['rotated', 'grace'] }, revokedAt: { gt: new Date(now.getTime() - 2 * REUSE_GRACE_MS) } },
      ],
    },
    data: { revokedAt: now, revokedReason: 'all' },
  });
  await db.user.update({ where: { id: userId }, data: { sessionVersion: { increment: 1 } } });
}
