/**
 * Licenças das versões do Sefaria. Cada versão traz seu próprio campo `license`,
 * em geral "Public Domain", "CC0", "CC-BY", "CC-BY-SA" ou "CC-BY-NC"; versões sem
 * licença declarada aparecem como "unknown".
 */

const CANONICAL: Record<string, string> = {
  'PUBLIC DOMAIN': 'Public Domain',
  PD: 'Public Domain',
  CC0: 'CC0',
  'CC-0': 'CC0',
  'CC-BY': 'CC-BY',
  'CC BY': 'CC-BY',
  'CC-BY-SA': 'CC-BY-SA',
  'CC BY-SA': 'CC-BY-SA',
  'CC BY SA': 'CC-BY-SA',
  'CC-BY-NC': 'CC-BY-NC',
  'CC BY-NC': 'CC-BY-NC',
  'CC-BY-NC-SA': 'CC-BY-NC-SA',
  UNKNOWN: 'unknown',
};

export function normalizeLicense(license: string | null | undefined): string {
  if (!license || !license.trim()) return 'unknown';
  const key = license.trim().toUpperCase().replace(/\s+/g, ' ');
  return CANONICAL[key] ?? license.trim();
}

/** Ordem de preferência: quanto menos restritiva, melhor. */
const RANK: Record<string, number> = {
  'Public Domain': 0,
  CC0: 1,
  'CC-BY': 2,
  'CC-BY-SA': 3,
};

export function licenseRank(license: string): number {
  return RANK[normalizeLicense(license)] ?? 9;
}

export interface LicensePolicy {
  allowedLicenses: readonly string[];
  /** versionTitles liberados explicitamente pelo detentor dos direitos. */
  authorizedVersions: readonly string[];
}

export type LicenseDecision =
  | { allowed: true; reason: 'license' | 'authorized' }
  | { allowed: false; reason: string };

/** Compara títulos de versão ignorando os caracteres que o exportador remove dos nomes de arquivo. */
function sameVersionTitle(a: string, b: string): boolean {
  const clean = (s: string) => s.replace(/[/:()<>"|?*\r\n\t\\]/g, '').replace(/\s+/g, ' ').trim();
  return clean(a) === clean(b);
}

export function checkLicense(license: string | null | undefined, versionTitle: string, policy: LicensePolicy): LicenseDecision {
  if (policy.authorizedVersions.some((v) => sameVersionTitle(v, versionTitle))) {
    return { allowed: true, reason: 'authorized' };
  }
  const normalized = normalizeLicense(license);
  const allowed = policy.allowedLicenses.map(normalizeLicense);
  if (allowed.includes(normalized)) return { allowed: true, reason: 'license' };
  return { allowed: false, reason: `licença "${normalized}" fora de ALLOWED_LICENSES` };
}
