/**
 * Montagem de referências no formato do Sefaria a partir de índices de array.
 *
 * Nos arquivos do export, o texto é um array aninhado (JaggedArray). O índice 0
 * corresponde ao capítulo/mishná/seif 1, exceto no Talmud ("addressType" Talmud),
 * em que o índice i corresponde ao daf ⌊i/2⌋+1, lado a (i par) ou b (i ímpar):
 * índice 2 → "2a", índice 3 → "2b".
 */

export type AddressType = string;

export function formatAddress(addressType: AddressType | undefined, index: number): string {
  if (addressType === 'Talmud') {
    return `${Math.floor(index / 2) + 1}${index % 2 === 0 ? 'a' : 'b'}`;
  }
  return String(index + 1);
}

/** "Genesis 22:2", "Berakhot 2a:3", "Mishnah Berakhot 1:1". */
export function segmentRef(title: string, addressTypes: readonly AddressType[], indices: readonly number[]): string {
  const parts = indices.map((idx, depth) => formatAddress(addressTypes[depth], idx));
  return `${title} ${parts.join(':')}`;
}

/**
 * Referência de intervalo entre dois segmentos do mesmo livro:
 * mesmo capítulo → "Genesis 1:1-5"; capítulos diferentes → "Genesis 1:30-2:3".
 */
export function rangeRef(
  title: string,
  addressTypes: readonly AddressType[],
  start: readonly number[],
  end: readonly number[],
): string {
  const first = segmentRef(title, addressTypes, start);
  if (start.length !== end.length || start.every((v, i) => v === end[i])) return first;
  const commonPrefix = start.findIndex((v, i) => v !== end[i]);
  const tail = end.slice(commonPrefix).map((idx, k) => formatAddress(addressTypes[commonPrefix + k], idx));
  return `${first}-${tail.join(':')}`;
}
