/**
 * Idiomas do app (Fase 8): português, inglês e hebraico.
 *
 * Os textos ficam escritos em português no código e `t()` devolve a tradução do
 * idioma escolhido (dicionários em src/locales, chaveados pela frase em português).
 * Sem tradução, volta o português (um teste garante que todas existem).
 *
 * `t()` pode ser chamada em qualquer lugar durante a renderização; o layout raiz
 * remonta as telas quando o idioma muda, então tudo é redesenhado no idioma novo.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEFAULT_LOCALE, LOCALE_INFO, LOCALES, catalogText, hasMessage, localeFromTag, messageText, type Locale } from '@trivia/shared';
import { create } from 'zustand';
import { UI_ROWS } from '../locales/ui';

const KEY = 'trivia.locale.v1';

function deviceLocale(): Locale {
  try {
    return localeFromTag(Intl.DateTimeFormat().resolvedOptions().locale);
  } catch {
    return DEFAULT_LOCALE;
  }
}

interface LocaleState {
  locale: Locale;
  /** O jogador já escolheu (senão vale o idioma do aparelho). */
  chosen: boolean;
}

export const useLocale = create<LocaleState>(() => ({ locale: deviceLocale(), chosen: false }));

export async function loadLocale(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw && (LOCALES as readonly string[]).includes(raw)) useLocale.setState({ locale: raw as Locale, chosen: true });
  } catch {
    // Armazenamento indisponível: segue com o idioma do aparelho.
  }
}

export function setLocale(locale: Locale): void {
  useLocale.setState({ locale, chosen: true });
  // Gravado antes de o layout raiz aplicar a direção (que pode recarregar o app).
  void AsyncStorage.setItem(KEY, locale)
    .catch(() => undefined)
    .finally(() => persisted.forEach((fn) => fn(locale)));
}

const persisted = new Set<(locale: Locale) => void>();

/** Avisa quando a escolha de idioma já foi gravada (o layout raiz aplica a direção da tela). */
export function onLocaleSaved(fn: (locale: Locale) => void): () => void {
  persisted.add(fn);
  return () => persisted.delete(fn);
}

export function currentLocale(): Locale {
  return useLocale.getState().locale;
}

const DICTS: Readonly<Record<Exclude<Locale, 'pt'>, ReadonlyMap<string, string>>> = {
  en: new Map(UI_ROWS.map(([pt, en]) => [pt, en])),
  he: new Map(UI_ROWS.map(([pt, , he]) => [pt, he])),
};

type Vars = Readonly<Record<string, string | number>>;

function fill(text: string, vars?: Vars): string {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (whole, k: string) => (k in vars ? String(vars[k]) : whole));
}

/**
 * Traduz uma frase da interface. `{nome}` no texto é trocado por `vars.nome`.
 * Também conhece as mensagens compartilhadas com a API (validação de nome e senha).
 */
export function t(pt: string, vars?: Vars): string {
  const locale = currentLocale();
  if (locale === 'pt') return fill(pt, vars);
  const own = DICTS[locale].get(pt);
  if (own !== undefined) return fill(own, vars);
  if (hasMessage(pt)) return messageText(pt, locale, vars);
  return fill(pt, vars);
}

/**
 * Marca uma frase para tradução sem traduzi-la ainda (rótulos guardados em mapas e
 * traduzidos com t() na hora de mostrar). O teste de cobertura procura estas marcas.
 */
export function msg<T extends string>(pt: T): T {
  return pt;
}

/** Texto do catálogo do Golem World (mundos, parashiot, obstáculos, itens, trilhas). */
export function tc(pt: string): string {
  return catalogText(pt, currentLocale());
}

/** Escolhe a forma do singular ou do plural e traduz ("{n} ponto" / "{n} pontos"). */
export function tn(n: number, one: string, many: string, vars?: Vars): string {
  return t(n === 1 ? one : many, { n: formatNumber(n), ...vars });
}

export function formatNumber(n: number): string {
  return n.toLocaleString(LOCALE_INFO[currentLocale()].tag);
}

export function isRtl(): boolean {
  return LOCALE_INFO[currentLocale()].dir === 'rtl';
}

/** Para os componentes que querem redesenhar sozinhos quando o idioma muda. */
export function useLocaleValue(): Locale {
  return useLocale((s) => s.locale);
}
