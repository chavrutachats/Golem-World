/**
 * @trivia/db — client Prisma e tipos do banco, compartilhados entre api e pipeline.
 *
 * O client é gerado em `src/generated/prisma` por `pnpm db:generate`.
 */
export * from './generated/prisma/client.js';
export { createPrismaClient, type CreatePrismaClientOptions } from './client.js';
