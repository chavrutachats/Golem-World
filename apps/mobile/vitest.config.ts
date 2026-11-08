import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Testes da lógica pura do app (src/lib, src/three) — sem React Native nem tela.
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    include: ['test/**/*.test.ts'],
    setupFiles: ['test/setup.ts'],
  },
});
