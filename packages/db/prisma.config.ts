/**
 * Configuração do Prisma 7. A URL do banco vem do `.env` da raiz do monorepo,
 * para api e pipeline lerem o mesmo arquivo.
 */
import { config as loadEnv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { defineConfig, env } from 'prisma/config';

loadEnv({ path: fileURLToPath(new URL('../../.env', import.meta.url)), quiet: true });

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    // O seed (usuário admin + perguntas de exemplo) entra na Fase 3:
    // seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
});
