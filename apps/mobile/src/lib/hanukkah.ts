/**
 * Chanucá no sevivon: nas 8 noites, uma chanukiá com as velas da noite aparece atrás dele.
 *
 * A véspera (24 de Kislev) de cada ano foi calculada com o calendário hebraico do ICU
 * (Intl, 'en-u-ca-hebrew') e fica numa tabela: assim o app não depende do suporte a
 * calendários do motor de JavaScript do celular. Para estender, rode a mesma conta.
 */
const EVE_OF_HANUKKAH: readonly string[] = [
  '2025-12-14', '2026-12-04', '2027-12-24', '2028-12-12', '2029-12-01', '2030-12-20', '2031-12-09',
  '2032-11-27', '2033-12-16', '2034-12-06', '2035-12-25', '2036-12-13', '2037-12-02', '2038-12-21',
  '2039-12-11', '2040-11-29', '2041-12-17', '2042-12-07', '2043-12-26', '2044-12-14', '2045-12-03',
];

/** A noite acende às 17h (hora local), um jeito simples de lembrar que o dia judaico começa ao anoitecer. */
const LIGHTING_HOUR = 17;

/**
 * Qual noite de Chanucá é agora (1 a 8), ou null fora da festa. A noite n vai das 17h da
 * véspera + (n − 1) dias até as 17h do dia seguinte.
 */
export function hanukkahNight(now: Date = new Date()): number | null {
  for (const eve of EVE_OF_HANUKKAH) {
    const [y, m, d] = eve.split('-').map(Number) as [number, number, number];
    const start = new Date(y, m - 1, d, LIGHTING_HOUR);
    const nights = Math.floor((now.getTime() - start.getTime()) / 86_400_000);
    if (nights >= 0 && nights < 8) return nights + 1;
  }
  return null;
}
