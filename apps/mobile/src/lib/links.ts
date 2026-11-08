/** O app só abre páginas do Sefaria (https), nunca outro endereço vindo da API. */
export function isSefariaUrl(url: string): boolean {
  return /^https:\/\/www\.sefaria\.org\/[^\s]*$/.test(url);
}
