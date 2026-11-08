/**
 * Gera apps/godot/i18n/ui.json (Fase 14): as mesmas traduções do app, para o cliente Godot.
 * Chave = frase em português; valores em inglês e hebraico. Junta a interface (locales/ui.ts),
 * as mensagens compartilhadas com a API e os nomes das categorias e dos níveis.
 *
 * Uso: pnpm --filter @trivia/mobile godot-i18n
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CATEGORIES, DIFFICULTY_LABELS_PT, MESSAGE_KEYS, catalogText, messageText } from '@trivia/shared';
import { UI_ROWS } from '../src/locales/ui';

const out: Record<'en' | 'he', Record<string, string>> = { en: {}, he: {} };
for (const pt of MESSAGE_KEYS) {
  out.en[pt] = messageText(pt, 'en');
  out.he[pt] = messageText(pt, 'he');
}
for (const pt of [...Object.values(CATEGORIES).map((c) => c.labelPt), ...Object.values(DIFFICULTY_LABELS_PT)]) {
  out.en[pt] = catalogText(pt, 'en');
  out.he[pt] = catalogText(pt, 'he');
}
for (const [pt, en, he] of UI_ROWS) {
  out.en[pt] = en;
  out.he[pt] = he;
}
const file = fileURLToPath(new URL('../../godot/i18n/ui.json', import.meta.url));
writeFileSync(file, JSON.stringify(out, null, 1) + '\n');
console.log(`${Object.keys(out.en).length} frases em ${file}`);
