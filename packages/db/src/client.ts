import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client.js';

export interface CreatePrismaClientOptions {
  /** URL do Postgres. Padrão: `process.env.DATABASE_URL`. */
  databaseUrl?: string;
  /** Loga as queries SQL (útil para depurar). */
  logQueries?: boolean;
}

/**
 * Cria um PrismaClient usando o driver `pg` (Prisma 7 + driver adapter).
 * Quem chama é responsável por `await prisma.$disconnect()` ao terminar.
 */
export function createPrismaClient(options: CreatePrismaClientOptions = {}): PrismaClient {
  const databaseUrl = options.databaseUrl ?? process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL não definida. Copie .env.example para .env na raiz do projeto.');
  }
  const adapter = new PrismaPg({ connectionString: databaseUrl });
  return new PrismaClient({
    adapter,
    log: options.logQueries ? ['query', 'warn', 'error'] : ['warn', 'error'],
  });
}
