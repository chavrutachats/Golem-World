/**
 * Armário do Golem: itens que mudam o visual e, a maioria, dão uma vantagem nas
 * fases do Golem World. As vantagens valem só na jornada; na roleta (competitiva)
 * o Golem aparece com o visual escolhido, mas ninguém joga com vantagem.
 *
 * Fase 9: além dos equipamentos, o Golem pode trocar o barro (visual, com shekels) e
 * se fantasiar de personagens, como no Purim. Os personagens da própria história se
 * ganham por mérito (moedas de sabedoria, depois de estudar a parashá onde aparecem);
 * os visitantes de fora da Torá se compram com shekels. Nenhum dos dois dá vantagem.
 */
import { z } from 'zod';
import type { TorahBook } from './refs.js';

export const ITEM_SLOTS = ['head', 'face', 'body', 'hand', 'companion', 'skin', 'costume'] as const;
export type ItemSlot = (typeof ITEM_SLOTS)[number];

export const ITEM_SLOT_LABELS_PT: Readonly<Record<ItemSlot, string>> = {
  head: 'Cabeça',
  face: 'Rosto',
  body: 'Corpo',
  hand: 'Mão',
  companion: 'Companhia',
  skin: 'Material',
  costume: 'Personagem',
};

/** Espaços que só mudam o visual: nunca têm vantagem. */
export const COSMETIC_SLOTS: readonly ItemSlot[] = ['skin', 'costume'];

/** Com uma fantasia, estes espaços ficam escondidos por baixo (as vantagens continuam valendo). */
export const COSTUME_HIDES: readonly ItemSlot[] = ['head', 'body', 'hand'];

export type Perk =
  | { kind: 'extraHeart'; value: number }
  | { kind: 'extraTime'; value: number }
  | { kind: 'firstMistakeFree' }
  | { kind: 'coinBonus'; value: number }
  | { kind: 'eliminate'; value: number }
  | { kind: 'skip'; value: number }
  | { kind: 'hint'; value: number };

export type ItemUnlock =
  | { kind: 'starter' }
  /** Loja, com moedas de sabedoria (ganhas jogando). */
  | { kind: 'coins'; price: number }
  /** Loja, com shekels (comprados): só itens sem vantagem. */
  | { kind: 'shekels'; price: number }
  /** Personagem da história: depois de completar a Torá da parashá, com moedas de sabedoria. */
  | { kind: 'parasha'; parashaId: string; price: number }
  | { kind: 'beitMidrash'; book: TorahBook }
  | { kind: 'allTracksOfAParasha' };

export interface ItemDef {
  id: string;
  slot: ItemSlot;
  namePt: string;
  /** O que o item faz, em uma frase. */
  perkPt: string | null;
  flavorPt: string;
  perk: Perk | null;
  unlock: ItemUnlock;
  /** Material (espaço "skin"): cor do barro. */
  clay?: string;
  /** Personagem: o versículo de onde ele vem (referência do Sefaria). */
  ref?: string;
}

export const ITEMS: readonly ItemDef[] = [
  {
    id: 'kipa-azul',
    slot: 'head',
    namePt: 'Kipá azul',
    perkPt: null,
    flavorPt: 'A primeira kipá do Golem.',
    perk: null,
    unlock: { kind: 'starter' },
  },
  {
    id: 'kipa-vermelha',
    slot: 'head',
    namePt: 'Kipá vermelha',
    perkPt: null,
    flavorPt: 'Para combinar com o barro.',
    perk: null,
    unlock: { kind: 'coins', price: 40 },
  },
  {
    id: 'kipa-shabat',
    slot: 'head',
    namePt: 'Kipá de Shabat',
    perkPt: '+20% de moedas em cada fase',
    flavorPt: 'Branca, guardada para os dias especiais.',
    perk: { kind: 'coinBonus', value: 20 },
    unlock: { kind: 'coins', price: 150 },
  },
  {
    id: 'oculos',
    slot: 'face',
    namePt: 'Óculos de leitura',
    perkPt: 'Elimina duas alternativas erradas, 1 vez por fase',
    flavorPt: 'Letra miúda nunca mais.',
    perk: { kind: 'eliminate', value: 1 },
    unlock: { kind: 'coins', price: 120 },
  },
  {
    id: 'lamparina',
    slot: 'hand',
    namePt: 'Lamparina',
    perkPt: '+6 segundos em cada pergunta',
    flavorPt: 'Para estudar até tarde.',
    perk: { kind: 'extraTime', value: 6 },
    unlock: { kind: 'coins', price: 180 },
  },
  {
    id: 'sacola',
    slot: 'body',
    namePt: 'Sacola de livros',
    perkPt: 'Pula 1 pergunta por fase, sem perder coração',
    flavorPt: 'Essa fica para estudar em casa.',
    perk: { kind: 'skip', value: 1 },
    unlock: { kind: 'coins', price: 220 },
  },
  {
    id: 'tzitzit',
    slot: 'body',
    namePt: 'Talit catan',
    perkPt: '+1 coração em cada fase',
    flavorPt: '"Para que vos lembreis de todas as Minhas mitzvot" (Nm 15:40).',
    perk: { kind: 'extraHeart', value: 1 },
    unlock: { kind: 'beitMidrash', book: 'Genesis' },
  },
  {
    id: 'pena',
    slot: 'hand',
    namePt: 'Pena do sofer',
    perkPt: 'O primeiro erro de cada fase não custa coração',
    flavorPt: 'O escriba confere cada letra antes de seguir.',
    perk: { kind: 'firstMistakeFree' },
    unlock: { kind: 'beitMidrash', book: 'Exodus' },
  },
  {
    id: 'chavruta',
    slot: 'companion',
    namePt: 'Chavruta',
    perkPt: 'Dá 2 dicas por fase (onde procurar a resposta)',
    flavorPt: 'Um parceiro de estudo que anda junto.',
    perk: { kind: 'hint', value: 2 },
    unlock: { kind: 'beitMidrash', book: 'Leviticus' },
  },
  {
    id: 'shofar',
    slot: 'hand',
    namePt: 'Shofar',
    perkPt: '+1 coração em cada fase',
    flavorPt: 'Desperta quem estava cochilando.',
    perk: { kind: 'extraHeart', value: 1 },
    unlock: { kind: 'beitMidrash', book: 'Numbers' },
  },
  {
    id: 'bandeira',
    slot: 'hand',
    namePt: 'Bandeira de Simchat Torá',
    perkPt: '+50% de moedas em cada fase',
    flavorPt: 'Para dançar com a Torá no fim do ciclo.',
    perk: { kind: 'coinBonus', value: 50 },
    unlock: { kind: 'beitMidrash', book: 'Deuteronomy' },
  },
  {
    id: 'lupa',
    slot: 'face',
    namePt: 'Lupa do comentarista',
    perkPt: 'Elimina duas alternativas erradas, 2 vezes por fase',
    flavorPt: 'Prêmio de quem percorreu todos os caminhos de uma parashá.',
    perk: { kind: 'eliminate', value: 2 },
    unlock: { kind: 'allTracksOfAParasha' },
  },
  // --- Material do Golem (visual, com shekels) ---
  {
    id: 'barro-nilo',
    slot: 'skin',
    namePt: 'Barro do Nilo',
    perkPt: null,
    flavorPt: 'Escuro como a lama das margens do Nilo.',
    perk: null,
    unlock: { kind: 'shekels', price: 60 },
    clay: '#5E3B2A',
  },
  {
    id: 'areia-deserto',
    slot: 'skin',
    namePt: 'Areia do deserto',
    perkPt: null,
    flavorPt: 'Da areia do Sinai, onde a Torá foi dada.',
    perk: null,
    unlock: { kind: 'shekels', price: 60 },
    clay: '#D7B26A',
  },
  {
    id: 'pedra-jerusalem',
    slot: 'skin',
    namePt: 'Pedra de Jerusalém',
    perkPt: null,
    flavorPt: 'O calcário claro das muralhas da cidade.',
    perk: null,
    unlock: { kind: 'shekels', price: 90 },
    clay: '#E6D7B8',
  },
  {
    id: 'argila-azul',
    slot: 'skin',
    namePt: 'Argila azul',
    perkPt: null,
    flavorPt: 'Da cor do techelet, o azul do tsitsit (Nm 15:38).',
    perk: null,
    unlock: { kind: 'shekels', price: 90 },
    clay: '#5C7FB8',
  },
  {
    id: 'cobre',
    slot: 'skin',
    namePt: 'Cobre do Mishkan',
    perkPt: null,
    flavorPt: 'Como o altar de cobre do Tabernáculo (Êx 27:2).',
    perk: null,
    unlock: { kind: 'shekels', price: 120 },
    clay: '#B8743E',
  },
  {
    id: 'cedro',
    slot: 'skin',
    namePt: 'Cedro do Líbano',
    perkPt: null,
    flavorPt: 'A madeira que Salomão trouxe para o Templo.',
    perk: null,
    unlock: { kind: 'shekels', price: 120 },
    clay: '#8C4B2F',
  },
  // --- Personagens da história (moedas de sabedoria, depois da parashá) ---
  {
    id: 'adao',
    slot: 'costume',
    namePt: 'Adão',
    perkPt: null,
    flavorPt: 'Com a túnica de pele que recebeu ao sair do Éden (Gn 3:21).',
    perk: null,
    unlock: { kind: 'parasha', parashaId: 'bereshit', price: 150 },
    ref: 'Genesis 3:21',
  },
  {
    id: 'eva',
    slot: 'costume',
    namePt: 'Eva',
    perkPt: null,
    flavorPt: '“Mãe de todos os viventes” (Gn 3:20).',
    perk: null,
    unlock: { kind: 'parasha', parashaId: 'bereshit', price: 150 },
    ref: 'Genesis 3:20',
  },
  {
    id: 'serpente',
    slot: 'costume',
    namePt: 'Serpente',
    perkPt: null,
    flavorPt: 'A mais astuta dos animais do campo (Gn 3:1). É só fantasia.',
    perk: null,
    unlock: { kind: 'parasha', parashaId: 'bereshit', price: 150 },
    ref: 'Genesis 3:1',
  },
  {
    id: 'noe',
    slot: 'costume',
    namePt: 'Noé',
    perkPt: null,
    flavorPt: 'Com a pomba e o ramo de oliveira (Gn 8:11).',
    perk: null,
    unlock: { kind: 'parasha', parashaId: 'noach', price: 180 },
    ref: 'Genesis 8:11',
  },
  {
    id: 'abraao',
    slot: 'costume',
    namePt: 'Abraão',
    perkPt: null,
    flavorPt: '“Vai-te da tua terra” (Gn 12:1): cajado na mão, pé na estrada.',
    perk: null,
    unlock: { kind: 'parasha', parashaId: 'lech-lecha', price: 180 },
    ref: 'Genesis 12:1',
  },
  {
    id: 'jose',
    slot: 'costume',
    namePt: 'José',
    perkPt: null,
    flavorPt: 'Com a túnica colorida que Jacó fez para ele (Gn 37:3).',
    perk: null,
    unlock: { kind: 'parasha', parashaId: 'vayeshev', price: 220 },
    ref: 'Genesis 37:3',
  },
  {
    id: 'moises',
    slot: 'costume',
    namePt: 'Moisés',
    perkPt: null,
    flavorPt: 'Com o cajado que levou na mão ao Egito (Êx 4:20).',
    perk: null,
    unlock: { kind: 'parasha', parashaId: 'shemot', price: 220 },
    ref: 'Exodus 4:20',
  },
  {
    id: 'miriam',
    slot: 'costume',
    namePt: 'Miriam',
    perkPt: null,
    flavorPt: 'Com o tamborim na mão, cantando junto ao mar (Êx 15:20).',
    perk: null,
    unlock: { kind: 'parasha', parashaId: 'beshalach', price: 220 },
    ref: 'Exodus 15:20',
  },
  {
    id: 'aarao',
    slot: 'costume',
    namePt: 'Aarão',
    perkPt: null,
    flavorPt: 'Com as vestes do Kohen Gadol e o peitoral de doze pedras (Êx 28:15-21).',
    perk: null,
    unlock: { kind: 'parasha', parashaId: 'tetzaveh', price: 260 },
    ref: 'Exodus 28:15-21',
  },
  // --- Visitantes de fora da Torá (shekels) ---
  {
    id: 'davi',
    slot: 'costume',
    namePt: 'Davi',
    perkPt: null,
    flavorPt: 'O rei que tocava a harpa (1Sm 16:23). Aqui, só de visita.',
    perk: null,
    unlock: { kind: 'shekels', price: 150 },
    ref: 'I Samuel 16:23',
  },
  {
    id: 'ester',
    slot: 'costume',
    namePt: 'Ester',
    perkPt: null,
    flavorPt: 'A rainha de Shushan, com as vestes reais (Est 5:1).',
    perk: null,
    unlock: { kind: 'shekels', price: 150 },
    ref: 'Esther 5:1',
  },
  {
    id: 'mordecai',
    slot: 'costume',
    namePt: 'Mordecai',
    perkPt: null,
    flavorPt: 'Com as vestes reais azuis e brancas (Est 8:15).',
    perk: null,
    unlock: { kind: 'shekels', price: 150 },
    ref: 'Esther 8:15',
  },
  {
    id: 'jonas',
    slot: 'costume',
    namePt: 'Jonas',
    perkPt: null,
    flavorPt: 'Com o grande peixe que o engoliu e o devolveu (Jn 2:1).',
    perk: null,
    unlock: { kind: 'shekels', price: 150 },
    ref: 'Jonah 2:1',
  },
];

const BY_ID = new Map(ITEMS.map((i) => [i.id, i]));

export function itemById(id: string): ItemDef | undefined {
  return BY_ID.get(id);
}

export const STARTER_ITEM_IDS = ITEMS.filter((i) => i.unlock.kind === 'starter').map((i) => i.id);

export type ItemCategory = 'equipment' | 'skin' | 'character';

export function itemCategory(item: Pick<ItemDef, 'slot'>): ItemCategory {
  return item.slot === 'skin' ? 'skin' : item.slot === 'costume' ? 'character' : 'equipment';
}

/** Preço na loja, na moeda certa (ou nulo: o item é prêmio). */
export function itemPrice(item: Pick<ItemDef, 'unlock'>): { currency: 'coins' | 'shekels'; amount: number } | null {
  switch (item.unlock.kind) {
    case 'coins':
    case 'parasha':
      return { currency: 'coins', amount: item.unlock.price };
    case 'shekels':
      return { currency: 'shekels', amount: item.unlock.price };
    default:
      return null;
  }
}

export interface PerkSummary {
  extraHearts: number;
  extraTimeSeconds: number;
  firstMistakeFree: boolean;
  coinBonusPct: number;
  powerUps: { eliminate: number; skip: number; hint: number };
}

/** Soma as vantagens dos itens vestidos (um por espaço). */
export function perksOf(equippedIds: readonly string[]): PerkSummary {
  const out: PerkSummary = {
    extraHearts: 0,
    extraTimeSeconds: 0,
    firstMistakeFree: false,
    coinBonusPct: 0,
    powerUps: { eliminate: 0, skip: 0, hint: 0 },
  };
  const usedSlots = new Set<ItemSlot>();
  for (const id of equippedIds) {
    const item = BY_ID.get(id);
    if (!item || usedSlots.has(item.slot)) continue;
    usedSlots.add(item.slot);
    const perk = item.perk;
    if (!perk) continue;
    switch (perk.kind) {
      case 'extraHeart':
        out.extraHearts += perk.value;
        break;
      case 'extraTime':
        out.extraTimeSeconds += perk.value;
        break;
      case 'firstMistakeFree':
        out.firstMistakeFree = true;
        break;
      case 'coinBonus':
        out.coinBonusPct += perk.value;
        break;
      case 'eliminate':
      case 'skip':
      case 'hint':
        out.powerUps[perk.kind] += perk.value;
        break;
    }
  }
  return out;
}

export const POWER_UPS = ['eliminate', 'skip', 'hint'] as const;
export type PowerUp = (typeof POWER_UPS)[number];
export const PowerUpSchema = z.enum(POWER_UPS);

/**
 * Aparência do Golem a partir dos itens do jogador (um por espaço). Quem ainda não
 * tem item nenhum aparece com o item inicial (a kipá azul).
 */
export function lookFromItems(rows: readonly { itemId: string; equipped: boolean }[]): { equipped: Partial<Record<ItemSlot, string>> } {
  const equipped: Partial<Record<ItemSlot, string>> = {};
  if (rows.length === 0) {
    for (const item of ITEMS) if (item.unlock.kind === 'starter' && !equipped[item.slot]) equipped[item.slot] = item.id;
    return { equipped };
  }
  for (const row of rows) {
    if (!row.equipped) continue;
    const item = BY_ID.get(row.itemId);
    if (item && !equipped[item.slot]) equipped[item.slot] = item.id;
  }
  return { equipped };
}
