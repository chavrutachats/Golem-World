import { parse } from 'dotenv';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Lê do .env da raiz apenas TEST_DATABASE_URL (o resto da configuração dos testes é explícito).
const envFile = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.env');
if (!process.env.TEST_DATABASE_URL && existsSync(envFile)) {
  const env = parse(readFileSync(envFile));
  if (env.TEST_DATABASE_URL) {
    if (env.TEST_DATABASE_URL === env.DATABASE_URL) {
      throw new Error('TEST_DATABASE_URL não pode ser igual a DATABASE_URL: o teste de integração apaga as tabelas.');
    }
    process.env.TEST_DATABASE_URL = env.TEST_DATABASE_URL;
  }
}

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // O teste de integração usa um banco compartilhado; arquivos em sequência evitam disputa.
    fileParallelism: false,
  },
});
