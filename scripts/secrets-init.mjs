#!/usr/bin/env node
/**
 * Prepara o .env da raiz com segredos aleatórios. Uso: `pnpm secrets:init`.
 *
 * - Sem .env: copia o .env.example.
 * - Troca por valores aleatórios (48 bytes, base64url) os segredos que ainda estão
 *   vazios ou com o texto de exemplo ("troque-por-…"). Segredos já preenchidos
 *   ficam como estão, então dá para rodar de novo sem medo.
 * - Deixa o arquivo legível só pelo seu usuário (chmod 600).
 *
 * Os segredos nunca são impressos.
 */
import { randomBytes } from 'node:crypto';
import { chmodSync, copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const envPath = path.join(root, '.env');
const examplePath = path.join(root, '.env.example');
const SECRETS = ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'];

if (!existsSync(envPath)) {
  copyFileSync(examplePath, envPath);
  console.log('Criado .env a partir do .env.example.');
}

let text = readFileSync(envPath, 'utf8');
const changed = [];
for (const key of SECRETS) {
  const line = new RegExp(`^${key}=(.*)$`, 'm');
  const match = line.exec(text);
  const current = match ? match[1].trim().replace(/^["']|["']$/g, '') : '';
  if (current && !/^troque-por/i.test(current)) continue;
  const value = randomBytes(48).toString('base64url');
  text = match ? text.replace(line, `${key}="${value}"`) : `${text.replace(/\n?$/, '\n')}${key}="${value}"\n`;
  changed.push(key);
}

writeFileSync(envPath, text);
try {
  chmodSync(envPath, 0o600);
} catch {
  // Windows não tem permissões POSIX; tudo bem.
}

console.log(changed.length ? `Segredos gerados: ${changed.join(', ')}.` : 'Os segredos do .env já estavam preenchidos; nada mudou.');
console.log('Nunca faça commit do .env.');
