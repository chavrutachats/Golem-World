/**
 * Moderação básica de apelidos, que aparecem no ranking público e para o adversário.
 *
 * Duas regras:
 *  1. Nomes reservados: ninguém pode se passar pela equipe ("Admin", "Moderador",
 *     "Sefaria", "Suporte"…).
 *  2. Palavrões, ofensas e discurso de ódio (português e inglês), com atenção
 *     especial ao antissemitismo.
 *
 * A comparação ignora maiúsculas, acentos, números no fim, separadores e trocas
 * comuns de letras por números ("4dm1n", "a.d.m.i.n", "Merdaaa"). Para não barrar
 * nomes inocentes (o "Scunthorpe problem"), a maioria dos termos só conta como
 * palavra inteira; só alguns, que não aparecem dentro de palavras comuns, contam
 * em qualquer posição. Ex.: "Nazir" (o tratado do Talmud) passa; "Nazi" não.
 *
 * É uma primeira barreira, não moderação completa: revisores podem trocar um
 * apelido com `pnpm reviewers reset-name` (veja docs/SECURITY.md).
 */

/** Ninguém pode usar estes nomes, nem com números ou separadores no meio. */
const RESERVED = [
  'admin',
  'administrador',
  'administradora',
  'administrator',
  'moderador',
  'moderadora',
  'moderator',
  'moderacao',
  'mod',
  'suporte',
  'support',
  'sefaria',
  'oficial',
  'official',
  'staff',
  'equipe',
  'sistema',
  'system',
  'root',
  'triviatora',
  'contaexcluida',
] as const;

/** Termos barrados só como palavra inteira (podem aparecer dentro de palavras inocentes). */
const BLOCKED_WORDS = [
  // ódio e antissemitismo
  'nazi',
  'nazis',
  'nazista',
  'nazistas',
  'nazismo',
  'neonazi',
  'kike',
  'kikes',
  'heil',
  'ss',
  'kkk',
  'hamas',
  'jihad',
  // português
  'puta',
  'puto',
  'putas',
  'porra',
  'merda',
  'bosta',
  'foda',
  'fodase',
  'foder',
  'fodido',
  'viado',
  'bicha',
  'sapatao',
  'cu',
  'cuzao',
  'corno',
  'otario',
  'babaca',
  'retardado',
  'xota',
  'xoxota',
  'boquete',
  'punheta',
  'estupro',
  'estuprador',
  'sexo',
  'porno',
  'putaria',
  // inglês
  'shit',
  'cunt',
  'bitch',
  'whore',
  'slut',
  'dick',
  'cock',
  'pussy',
  'fag',
  'faggot',
  'rape',
  'rapist',
  'sex',
  'porn',
  'nigga',
] as const;

/** Termos barrados em qualquer posição (não aparecem dentro de palavras comuns). */
const BLOCKED_ANYWHERE = [
  'hitler',
  'siegheil',
  'sieg heil',
  'holohoax',
  'gaschamber',
  'judenrein',
  'zyklon',
  '1488',
  'fuck',
  'nigger',
  'caralh',
  'buceta',
  'arromb',
  'vagabund',
  'piroc',
  'filhodaputa',
  'fdp',
  'motherf',
  'killjews',
  'matarjudeu',
] as const;

const LEET: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', $: 's', '!': 'i' };

/** Letras latinas que o NFKD não decompõe, mas que parecem outras ("Hıtler", "Adm1ñ"). */
const LATIN_LOOKALIKES: Record<string, string> = { ı: 'i', ł: 'l', ø: 'o', đ: 'd', ħ: 'h', ŧ: 't', ſ: 's', ß: 'ss', æ: 'ae', œ: 'oe', ŀ: 'l', ĸ: 'k', ŉ: 'n' };

function baseFold(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[ıłøđħŧſßæœŀĸŉ]/g, (c) => LATIN_LOOKALIKES[c] ?? c);
}

/** Troca dígitos e símbolos parecidos com letras, e junta letras repetidas ("merdaaa" → "merda"). */
function leetFold(text: string): string {
  return text
    .replace(/[013457@$!]/g, (c) => LEET[c] ?? c)
    .replace(/([a-z])\1{2,}/g, '$1');
}

/** Palavras do nome, já normalizadas, sem números no fim ("admin123" → "admin"). */
function tokens(name: string): string[] {
  const folded = baseFold(name);
  return folded
    .split(/[\s._-]+/)
    .filter(Boolean)
    .flatMap((t) => {
      const plain = t.replace(/\d+$/, '');
      return [plain, leetFold(plain), leetFold(t).replace(/\d+$/, '')];
    })
    .filter(Boolean);
}

/**
 * Motivo pelo qual o nome não pode ser usado, ou null se puder.
 * O texto vai direto para a tela do jogador.
 */
export function displayNameProblem(name: string): string | null {
  const folded = baseFold(name);
  const compact = folded.replace(/[\s._-]+/g, '');
  const compactLeet = leetFold(compact);
  const words = new Set(tokens(name));
  const compactNoDigits = compact.replace(/\d+$/, '');
  const compactLeetNoDigits = leetFold(compactNoDigits);

  const reserved = new Set<string>(RESERVED);
  if ([...words].some((w) => reserved.has(w)) || reserved.has(compactNoDigits) || reserved.has(compactLeetNoDigits)) {
    return 'Este nome é reservado para a equipe do jogo. Escolha outro.';
  }

  const blocked = new Set<string>(BLOCKED_WORDS);
  const anywhere = BLOCKED_ANYWHERE.map((t) => t.replace(/\s+/g, ''));
  const hitsAnywhere = (text: string) => anywhere.some((t) => text.includes(t));
  if (
    [...words].some((w) => blocked.has(w)) ||
    blocked.has(compactNoDigits) ||
    blocked.has(compactLeetNoDigits) ||
    hitsAnywhere(compact) ||
    hitsAnywhere(compactLeet)
  ) {
    return 'Este nome não pode ser usado no jogo. Escolha outro.';
  }
  return null;
}
