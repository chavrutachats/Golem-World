/**
 * Textos do app que dependem de dados (licenças, motivos de denúncia, resultados).
 */
import { CATEGORIES, REPORT_REASONS, type CategoryId, type GameMode, type SourceLanguage } from '@trivia/shared';
import { formatNumber, msg, t, tc, tn } from './i18n';

export const REPORT_REASON_LABELS: Record<(typeof REPORT_REASONS)[number], string> = {
  incorrect: msg('A resposta marcada está errada'),
  ambiguous: msg('Mais de uma resposta serve'),
  disrespectful: msg('Desrespeitosa com o texto ou a tradição'),
  typo: msg('Erro de digitação ou tradução'),
  other: msg('Outro problema'),
};

export const MODE_LABELS: Record<GameMode, string> = {
  solo: msg('Treino'),
  random: msg('Adversário aleatório'),
  friend: msg('Partida com amigo'),
};

const LICENSE_LABELS: Record<string, string> = {
  'Public Domain': msg('domínio público'),
  CC0: msg('CC0 (domínio público)'),
  'CC-BY': msg('licença CC-BY'),
  'CC-BY-SA': msg('licença CC-BY-SA'),
};

export function licenseLabel(license: string | null): string | null {
  if (!license) return null;
  // Tradução automática herda as licenças da fonte ("CC-BY-SA + Public Domain").
  return license
    .split(' + ')
    .map((l) => (LICENSE_LABELS[l] ? t(LICENSE_LABELS[l]) : l))
    .join(' + ');
}

const LANGUAGE_LABELS: Record<SourceLanguage, string> = { he: msg('Texto original'), en: msg('Tradução inglesa'), pt: msg('Tradução') };

/**
 * "Tradução inglesa: The Holy Scriptures (JPS 1917), domínio público." ou, para o
 * texto traduzido pelo jogo, "Tradução automática do original (Miqra…), CC-BY-SA."
 */
export function versionLine(language: SourceLanguage, versionTitle: string | null, license: string | null, machine = false): string | null {
  const lic = licenseLabel(license);
  if (machine) {
    return versionTitle
      ? t('Tradução automática do original ({version}){license}.', { version: versionTitle, license: lic ? `, ${lic}` : '' })
      : t('Tradução automática do original.');
  }
  if (!versionTitle) return null;
  return `${t(LANGUAGE_LABELS[language])}: ${versionTitle}${lic ? `, ${lic}` : ''}.`;
}

export function categoryName(id: CategoryId): string {
  return tc(CATEGORIES[id].labelPt);
}

export function reportReasonLabel(reason: (typeof REPORT_REASONS)[number]): string {
  return t(REPORT_REASON_LABELS[reason]);
}

export function modeLabel(mode: GameMode): string {
  return t(MODE_LABELS[mode]);
}

/** Iniciais para o avatar ("Saymon Pires" → "SP"). */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? [parts[0]![0], parts[parts.length - 1]![0]] : [parts[0]?.[0], parts[0]?.[1]];
  return letters.filter(Boolean).join('').toUpperCase() || '?';
}

export function pointsLabel(points: number): string {
  return tn(points, '{n} ponto', '{n} pontos');
}

export { formatNumber };
