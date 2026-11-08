/**
 * Golem World: os 5 mundos (livros da Torá) e as 54 parashiot, na ordem da leitura
 * anual. Cada parashá traz o cenário da fase e os obstáculos, ligados a episódios
 * daquela porção (com a referência do versículo, para o jogador poder conferir).
 *
 * As fronteiras das parashiot seguem o Sefaria (índice "Parasha" de cada livro).
 */
import { parseTorahRef, type TorahBook, type VerseRange } from './refs.js';

/** Obstáculos desenhados no app (pixel art). */
export const OBSTACLE_IDS = [
  'darkness',
  'serpent',
  'thorns',
  'fire',
  'cloud',
  'wave',
  'bricks',
  'rock',
  'pit',
  'camel',
  'sheep',
  'cow',
  'donkey',
  'lion',
  'frog',
  'locust',
  'fish',
  'bird',
  'scorpion',
  'pot',
  'wheat',
  'wagon',
  'calf',
  'planks',
  'cloth',
  'jar',
  'banner',
  'grapes',
  'basket',
  'tree',
] as const;
export type ObstacleId = (typeof OBSTACLE_IDS)[number];

export const SKY_IDS = ['void', 'dawn', 'day', 'dusk', 'night', 'storm', 'desert', 'gold'] as const;
export type SkyId = (typeof SKY_IDS)[number];

export const GROUND_IDS = ['grass', 'sand', 'mud', 'water', 'stone', 'field'] as const;
export type GroundId = (typeof GROUND_IDS)[number];

/** Elementos do fundo (camada distante) e do ponto de chegada da fase. */
export const PROP_IDS = [
  'hills',
  'mountain',
  'pyramids',
  'palms',
  'tents',
  'ark',
  'tower',
  'city',
  'mishkan',
  'ladder',
  'stars',
  'rainbow',
  'sun',
  'moon',
  'trees',
  'sea-walls',
  'cloud-pillar',
  'candles',
  'bush-fire',
  'tablets',
] as const;
export type PropId = (typeof PROP_IDS)[number];

export interface SceneStage {
  sky: SkyId;
  ground: GroundId;
  props: readonly PropId[];
  /** Legenda curta mostrada quando o cenário muda (ex.: "Dia 3"). */
  captionPt?: string;
}

export interface SceneDef extends SceneStage {
  /** Cenário que evolui ao longo da fase (Bereshit: os dias da Criação). */
  stages?: readonly SceneStage[];
}

export interface ParashaEvent {
  obstacle: ObstacleId;
  captionPt: string;
  /** Versículo do episódio, no formato do Sefaria. */
  ref: string;
}

export interface ParashaGoal {
  prop: PropId;
  captionPt: string;
  ref: string;
}

export interface ParashaDef {
  id: string;
  /** 1 a 54, na ordem da leitura. */
  number: number;
  book: TorahBook;
  nameHe: string;
  namePt: string;
  meaningPt: string;
  /** Trecho completo da parashá (ex.: "Genesis 1:1-6:8"). */
  ref: string;
  scene: SceneDef;
  events: readonly ParashaEvent[];
  goal: ParashaGoal;
}

export type BeitMidrashStyle = 'yeshiva' | 'tent' | 'beit-midrash' | 'desert-yeshiva' | 'synagogue';

export interface WorldDef {
  id: TorahBook;
  number: number;
  namePt: string;
  nameHe: string;
  /** Paleta do mapa. */
  terrain: 'garden' | 'egypt' | 'camp' | 'desert' | 'plains';
  beitMidrash: {
    namePt: string;
    subtitlePt: string;
    style: BeitMidrashStyle;
    /** Fonte da tradição citada no nome, quando há. */
    ref?: string;
  };
}

export const WORLDS: readonly WorldDef[] = [
  {
    id: 'Genesis',
    number: 1,
    namePt: 'Bereshit',
    nameHe: 'בראשית',
    terrain: 'garden',
    beitMidrash: {
      namePt: 'Yeshivá de Shem e Ever',
      subtitlePt: 'Onde, segundo o Midrash, Yaakov estudou antes de partir',
      style: 'yeshiva',
      ref: 'Rashi on Genesis 25:27:1',
    },
  },
  {
    id: 'Exodus',
    number: 2,
    namePt: 'Shemot',
    nameHe: 'שמות',
    terrain: 'egypt',
    beitMidrash: {
      namePt: 'Tenda do Encontro',
      subtitlePt: 'Quem buscava ao Eterno saía para a tenda de Moshe',
      style: 'tent',
      ref: 'Exodus 33:7',
    },
  },
  {
    id: 'Leviticus',
    number: 3,
    namePt: 'Vayicrá',
    nameHe: 'ויקרא',
    terrain: 'camp',
    beitMidrash: { namePt: 'Casa de Estudos', subtitlePt: 'Lá dentro, as leis viram conversa entre amigos', style: 'beit-midrash' },
  },
  {
    id: 'Numbers',
    number: 4,
    namePt: 'Bamidbar',
    nameHe: 'במדבר',
    terrain: 'desert',
    beitMidrash: { namePt: 'Casa de Estudos do Deserto', subtitlePt: 'O povo estuda reunido em volta do acampamento', style: 'desert-yeshiva' },
  },
  {
    id: 'Deuteronomy',
    number: 5,
    namePt: 'Devarim',
    nameHe: 'דברים',
    terrain: 'plains',
    beitMidrash: {
      namePt: 'Sinagoga em Simchat Torá',
      subtitlePt: 'A leitura termina, a festa começa, e o ciclo volta a Bereshit',
      style: 'synagogue',
    },
  },
];

const s = (sky: SkyId, ground: GroundId, ...props: PropId[]): SceneDef => ({ sky, ground, props });
const e = (obstacle: ObstacleId, captionPt: string, ref: string): ParashaEvent => ({ obstacle, captionPt, ref });
const g = (prop: PropId, captionPt: string, ref: string): ParashaGoal => ({ prop, captionPt, ref });

type Row = Omit<ParashaDef, 'number'>;

const ROWS: readonly Row[] = [
  // ---------------------------------------------------------------- Bereshit
  {
    id: 'bereshit',
    book: 'Genesis',
    nameHe: 'בראשית',
    namePt: 'Bereshit',
    meaningPt: 'No princípio',
    ref: 'Genesis 1:1-6:8',
    scene: {
      sky: 'void',
      ground: 'water',
      props: [],
      stages: [
        { sky: 'void', ground: 'water', props: [], captionPt: 'Trevas sobre o abismo' },
        { sky: 'dawn', ground: 'water', props: [], captionPt: 'Dia 1: a luz' },
        { sky: 'day', ground: 'water', props: [], captionPt: 'Dia 2: o firmamento' },
        { sky: 'day', ground: 'grass', props: ['trees'], captionPt: 'Dia 3: terra e plantas' },
        { sky: 'day', ground: 'grass', props: ['sun', 'trees'], captionPt: 'Dia 4: sol, lua e estrelas' },
        { sky: 'day', ground: 'grass', props: ['sun', 'trees', 'hills'], captionPt: 'Dias 5 e 6: os seres vivos' },
      ],
    },
    events: [
      e('darkness', 'Trevas sobre a face do abismo', 'Genesis 1:2'),
      e('wave', 'As águas se ajuntam e aparece a terra seca', 'Genesis 1:9'),
      e('serpent', 'A serpente, a mais astuta dos animais', 'Genesis 3:1'),
      e('thorns', 'Espinhos e abrolhos brotarão', 'Genesis 3:18'),
      e('fire', 'A espada flamejante guarda o caminho do Éden', 'Genesis 3:24'),
    ],
    goal: g('candles', 'Shabat: no sétimo dia, D’us descansou', 'Genesis 2:2'),
  },
  {
    id: 'noach',
    book: 'Genesis',
    nameHe: 'נח',
    namePt: 'Nôach',
    meaningPt: 'Noé',
    ref: 'Genesis 6:9-11:32',
    scene: s('storm', 'water', 'ark'),
    events: [
      e('cloud', 'Chuva por quarenta dias e quarenta noites', 'Genesis 7:12'),
      e('wave', 'As águas sobem sobre a terra', 'Genesis 7:18'),
      e('bird', 'A pomba volta com a folha de oliveira', 'Genesis 8:11'),
      e('bricks', 'Tijolos para a torre de Bavel', 'Genesis 11:3'),
    ],
    goal: g('rainbow', 'O arco nas nuvens, sinal da aliança', 'Genesis 9:13'),
  },
  {
    id: 'lech-lecha',
    book: 'Genesis',
    nameHe: 'לך לך',
    namePt: 'Lech Lechá',
    meaningPt: 'Vai para ti',
    ref: 'Genesis 12:1-17:27',
    scene: s('desert', 'sand', 'palms', 'tents'),
    events: [
      e('rock', 'Sai da tua terra rumo à terra que te mostrarei', 'Genesis 12:1'),
      e('thorns', 'Fome na terra de Canaã', 'Genesis 12:10'),
      e('wave', 'Do rio do Egito até o grande rio Eufrates', 'Genesis 15:18'),
      e('fire', 'A tocha de fogo passa entre as partes', 'Genesis 15:17'),
    ],
    goal: g('stars', 'Olha para o céu e conta as estrelas', 'Genesis 15:5'),
  },
  {
    id: 'vayera',
    book: 'Genesis',
    nameHe: 'וירא',
    namePt: 'Vayerá',
    meaningPt: 'E apareceu',
    ref: 'Genesis 18:1-22:24',
    scene: s('dusk', 'sand', 'tents', 'trees'),
    events: [
      e('fire', 'Fogo e enxofre sobre Sedom', 'Genesis 19:24'),
      e('rock', 'A mulher de Lot vira coluna de sal', 'Genesis 19:26'),
      e('pit', 'D’us abre os olhos de Hagar e ela vê um poço', 'Genesis 21:19'),
      e('thorns', 'O carneiro preso pelos chifres no arbusto', 'Genesis 22:13'),
    ],
    goal: g('mountain', 'No monte do Eterno, Ele se fará ver', 'Genesis 22:14'),
  },
  {
    id: 'chayei-sarah',
    book: 'Genesis',
    nameHe: 'חיי שרה',
    namePt: 'Chayê Sará',
    meaningPt: 'A vida de Sara',
    ref: 'Genesis 23:1-25:18',
    scene: s('day', 'sand', 'palms', 'hills'),
    events: [
      e('rock', 'A caverna do campo de Machpelá', 'Genesis 23:19'),
      e('camel', 'Dez camelos partem com o servo de Avraham', 'Genesis 24:10'),
      e('pit', 'Rivka desce à fonte e enche o cântaro', 'Genesis 24:16'),
    ],
    goal: g('tents', 'Itschak leva Rivka à tenda de Sara', 'Genesis 24:67'),
  },
  {
    id: 'toldot',
    book: 'Genesis',
    nameHe: 'תולדות',
    namePt: 'Toledot',
    meaningPt: 'Gerações',
    ref: 'Genesis 25:19-28:9',
    scene: s('day', 'field', 'hills', 'tents'),
    events: [
      e('pot', 'Aquele cozido vermelho', 'Genesis 25:30'),
      e('pit', 'Os poços que os filisteus entupiram', 'Genesis 26:18'),
      e('sheep', 'Dois bons cabritos do rebanho', 'Genesis 27:9'),
    ],
    goal: g('tents', 'Yaakov recebe a bênção de Itschak', 'Genesis 27:27'),
  },
  {
    id: 'vayetze',
    book: 'Genesis',
    nameHe: 'ויצא',
    namePt: 'Vayetsê',
    meaningPt: 'E saiu',
    ref: 'Genesis 28:10-32:3',
    scene: s('night', 'grass', 'hills', 'stars'),
    events: [
      e('rock', 'A grande pedra sobre a boca do poço', 'Genesis 29:2'),
      e('sheep', 'Os rebanhos de Lavan', 'Genesis 30:40'),
      e('wave', 'Yaakov atravessa o rio', 'Genesis 31:21'),
    ],
    goal: g('ladder', 'A escada apoiada na terra, com o topo no céu', 'Genesis 28:12'),
  },
  {
    id: 'vayishlach',
    book: 'Genesis',
    nameHe: 'וישלח',
    namePt: 'Vayishlach',
    meaningPt: 'E enviou',
    ref: 'Genesis 32:4-36:43',
    scene: s('dawn', 'grass', 'hills', 'trees'),
    events: [
      e('sheep', 'Presentes para Essav: cabras e ovelhas', 'Genesis 32:15'),
      e('wave', 'A passagem do vau do Iabok', 'Genesis 32:23'),
      e('rock', 'Yaakov ergue uma coluna de pedra', 'Genesis 35:14'),
    ],
    goal: g('sun', 'Teu nome não será mais Yaakov, e sim Israel', 'Genesis 32:29'),
  },
  {
    id: 'vayeshev',
    book: 'Genesis',
    nameHe: 'וישב',
    namePt: 'Vayêshev',
    meaningPt: 'E habitou',
    ref: 'Genesis 37:1-40:23',
    scene: s('day', 'field', 'hills'),
    events: [
      e('wheat', 'No sonho, os feixes se curvam ao de Yossef', 'Genesis 37:7'),
      e('pit', 'A cova vazia, sem água', 'Genesis 37:24'),
      e('camel', 'A caravana de ismaelitas a caminho do Egito', 'Genesis 37:25'),
    ],
    goal: g('pyramids', 'O Eterno estava com Yossef no Egito', 'Genesis 39:2'),
  },
  {
    id: 'miketz',
    book: 'Genesis',
    nameHe: 'מקץ',
    namePt: 'Mikets',
    meaningPt: 'Ao fim de',
    ref: 'Genesis 41:1-44:17',
    scene: s('gold', 'sand', 'pyramids', 'palms'),
    events: [
      e('cow', 'Sete vacas magras sobem do rio', 'Genesis 41:3'),
      e('wheat', 'Sete espigas cheias e boas', 'Genesis 41:5'),
      e('donkey', 'Os irmãos carregam o cereal nos jumentos', 'Genesis 42:26'),
    ],
    goal: g('pyramids', 'Yossef é posto sobre toda a terra do Egito', 'Genesis 41:41'),
  },
  {
    id: 'vayigash',
    book: 'Genesis',
    nameHe: 'ויגש',
    namePt: 'Vayigash',
    meaningPt: 'E se aproximou',
    ref: 'Genesis 44:18-47:27',
    scene: s('gold', 'sand', 'pyramids'),
    events: [
      e('donkey', 'Jumentos carregados com o melhor do Egito', 'Genesis 45:23'),
      e('wagon', 'As carroças que Yossef enviou', 'Genesis 45:27'),
      e('wheat', 'Não havia pão em toda a terra', 'Genesis 47:13'),
    ],
    goal: g('tents', 'Yaakov e Yossef se reencontram em Goshen', 'Genesis 46:29'),
  },
  {
    id: 'vayechi',
    book: 'Genesis',
    nameHe: 'ויחי',
    namePt: 'Vayechi',
    meaningPt: 'E viveu',
    ref: 'Genesis 47:28-50:26',
    scene: s('dusk', 'grass', 'tents', 'hills'),
    events: [
      e('lion', 'Filhote de leão é Yehudá', 'Genesis 49:9'),
      e('wave', 'Zevulun morará no litoral dos mares', 'Genesis 49:13'),
      e('serpent', 'Dan será serpente junto ao caminho', 'Genesis 49:17'),
    ],
    goal: g('stars', 'Estas são as doze tribos de Israel', 'Genesis 49:28'),
  },

  // ---------------------------------------------------------------- Shemot
  {
    id: 'shemot',
    book: 'Exodus',
    nameHe: 'שמות',
    namePt: 'Shemot',
    meaningPt: 'Nomes',
    ref: 'Exodus 1:1-6:1',
    scene: s('gold', 'mud', 'pyramids', 'palms'),
    events: [
      e('bricks', 'Trabalho duro com barro e tijolos', 'Exodus 1:14'),
      e('wave', 'O cesto entre os juncos, à beira do rio', 'Exodus 2:3'),
      e('serpent', 'O cajado lançado ao chão vira serpente', 'Exodus 4:3'),
    ],
    goal: g('bush-fire', 'A sarça ardia no fogo e não se consumia', 'Exodus 3:2'),
  },
  {
    id: 'vaera',
    book: 'Exodus',
    nameHe: 'וארא',
    namePt: 'Vaerá',
    meaningPt: 'E apareci',
    ref: 'Exodus 6:2-9:35',
    scene: s('storm', 'mud', 'pyramids'),
    events: [
      e('serpent', 'O cajado de Aharon vira serpente diante do faraó', 'Exodus 7:10'),
      e('wave', 'As águas do rio viram sangue', 'Exodus 7:20'),
      e('frog', 'As rãs sobem e cobrem a terra do Egito', 'Exodus 8:2'),
      e('cloud', 'Granizo com fogo no meio', 'Exodus 9:24'),
    ],
    goal: g('pyramids', 'Deixa ir o Meu povo', 'Exodus 7:26'),
  },
  {
    id: 'bo',
    book: 'Exodus',
    nameHe: 'בא',
    namePt: 'Bo',
    meaningPt: 'Vem',
    ref: 'Exodus 10:1-13:16',
    scene: s('night', 'mud', 'pyramids', 'moon'),
    events: [
      e('locust', 'Os gafanhotos cobrem a face da terra', 'Exodus 10:15'),
      e('darkness', 'Três dias de escuridão espessa', 'Exodus 10:22'),
      e('sheep', 'Rebanhos e gado muito numerosos saem com eles', 'Exodus 12:38'),
    ],
    goal: g('moon', 'Este mês será para vós o primeiro dos meses', 'Exodus 12:2'),
  },
  {
    id: 'beshalach',
    book: 'Exodus',
    nameHe: 'בשלח',
    namePt: 'Beshalach',
    meaningPt: 'Quando deixou ir',
    ref: 'Exodus 13:17-17:16',
    scene: s('day', 'sand', 'sea-walls', 'cloud-pillar'),
    events: [
      e('wave', 'As águas formam uma muralha à direita e à esquerda', 'Exodus 14:22'),
      e('pit', 'As águas amargas de Mará', 'Exodus 15:23'),
      e('rock', 'A rocha em Chorev de onde sai água', 'Exodus 17:6'),
    ],
    goal: g('sea-walls', 'Então cantou Moshe: o Cântico do Mar', 'Exodus 15:1'),
  },
  {
    id: 'yitro',
    book: 'Exodus',
    nameHe: 'יתרו',
    namePt: 'Yitrô',
    meaningPt: 'Jetro',
    ref: 'Exodus 18:1-20:23',
    scene: s('storm', 'stone', 'mountain', 'tents'),
    events: [
      e('rock', 'Um limite ao redor do monte', 'Exodus 19:12'),
      e('cloud', 'Trovões, relâmpagos e uma nuvem pesada sobre o monte', 'Exodus 19:16'),
      e('fire', 'O monte Sinai fumegava por inteiro', 'Exodus 19:18'),
    ],
    goal: g('tablets', 'As Dez Palavras', 'Exodus 20:1'),
  },
  {
    id: 'mishpatim',
    book: 'Exodus',
    nameHe: 'משפטים',
    namePt: 'Mishpatim',
    meaningPt: 'Leis',
    ref: 'Exodus 21:1-24:18',
    scene: s('day', 'field', 'mountain', 'tents'),
    events: [
      e('cow', 'O boi que fere com os chifres', 'Exodus 21:28'),
      e('pit', 'Quem abrir uma cova e não a cobrir', 'Exodus 21:33'),
      e('fire', 'O fogo que sai e pega nos espinhos', 'Exodus 22:5'),
    ],
    goal: g('mountain', 'Tudo o que o Eterno falou faremos e ouviremos', 'Exodus 24:7'),
  },
  {
    id: 'terumah',
    book: 'Exodus',
    nameHe: 'תרומה',
    namePt: 'Terumá',
    meaningPt: 'Oferta',
    ref: 'Exodus 25:1-27:19',
    scene: s('day', 'sand', 'tents', 'mountain'),
    events: [
      e('cloth', 'Dez cortinas de linho fino, azul e púrpura', 'Exodus 26:1'),
      e('planks', 'As tábuas de madeira de acácia', 'Exodus 26:15'),
      e('jar', 'Azeite para a luz', 'Exodus 25:6'),
    ],
    goal: g('mishkan', 'Fazei-Me um santuário e habitarei entre eles', 'Exodus 25:8'),
  },
  {
    id: 'tetzaveh',
    book: 'Exodus',
    nameHe: 'תצוה',
    namePt: 'Tetsavê',
    meaningPt: 'Ordenarás',
    ref: 'Exodus 27:20-30:10',
    scene: s('dusk', 'sand', 'mishkan', 'tents'),
    events: [
      e('jar', 'Azeite puro de oliva batido para a luz', 'Exodus 27:20'),
      e('cloth', 'As vestes sagradas de Aharon', 'Exodus 28:2'),
      e('fire', 'O incenso aromático queimado de manhã', 'Exodus 30:7'),
    ],
    goal: g('mishkan', 'Para fazer subir a luz continuamente', 'Exodus 27:20'),
  },
  {
    id: 'ki-tisa',
    book: 'Exodus',
    nameHe: 'כי תשא',
    namePt: 'Ki Tissá',
    meaningPt: 'Quando contares',
    ref: 'Exodus 30:11-34:35',
    scene: s('day', 'stone', 'mountain', 'tents'),
    events: [
      e('calf', 'O bezerro de ouro', 'Exodus 32:4'),
      e('rock', 'Na fenda da rocha', 'Exodus 33:22'),
      e('cloud', 'O Eterno desce na nuvem', 'Exodus 34:5'),
    ],
    goal: g('tablets', 'Talha duas tábuas de pedra como as primeiras', 'Exodus 34:1'),
  },
  {
    id: 'vayakhel',
    book: 'Exodus',
    nameHe: 'ויקהל',
    namePt: 'Vayakhel',
    meaningPt: 'E reuniu',
    ref: 'Exodus 35:1-38:20',
    scene: s('day', 'sand', 'tents', 'mishkan'),
    events: [
      e('fire', 'Não acendereis fogo no dia de Shabat', 'Exodus 35:3'),
      e('cloth', 'Os sábios de coração fazem as cortinas', 'Exodus 36:8'),
      e('planks', 'As tábuas do Mishcan, de pé', 'Exodus 36:20'),
    ],
    goal: g('mishkan', 'O material era suficiente, e sobrava', 'Exodus 36:7'),
  },
  {
    id: 'pekudei',
    book: 'Exodus',
    nameHe: 'פקודי',
    namePt: 'Pekudê',
    meaningPt: 'Contas',
    ref: 'Exodus 38:21-40:38',
    scene: s('dawn', 'sand', 'mishkan', 'cloud-pillar'),
    events: [
      e('cloth', 'As vestes de serviço, de azul e púrpura', 'Exodus 39:1'),
      e('planks', 'Moshe levanta o Mishcan', 'Exodus 40:18'),
      e('cloud', 'A nuvem cobre a Tenda do Encontro', 'Exodus 40:34'),
    ],
    goal: g('mishkan', 'A glória do Eterno encheu o Mishcan', 'Exodus 40:34'),
  },

  // ---------------------------------------------------------------- Vayicrá
  {
    id: 'vayikra',
    book: 'Leviticus',
    nameHe: 'ויקרא',
    namePt: 'Vayicrá',
    meaningPt: 'E chamou',
    ref: 'Leviticus 1:1-5:26',
    scene: s('day', 'sand', 'mishkan', 'tents'),
    events: [
      e('fire', 'Fogo arrumado sobre o altar', 'Leviticus 1:7'),
      e('jar', 'A oferta de farinha com azeite', 'Leviticus 2:1'),
      e('rock', 'Em toda oferta porás sal', 'Leviticus 2:13'),
    ],
    goal: g('mishkan', 'E chamou a Moshe da Tenda do Encontro', 'Leviticus 1:1'),
  },
  {
    id: 'tzav',
    book: 'Leviticus',
    nameHe: 'צו',
    namePt: 'Tsav',
    meaningPt: 'Ordena',
    ref: 'Leviticus 6:1-8:36',
    scene: s('dawn', 'sand', 'mishkan'),
    events: [
      e('cloth', 'O cohen veste a túnica de linho', 'Leviticus 6:3'),
      e('fire', 'Fogo contínuo arderá sobre o altar, não se apagará', 'Leviticus 6:6'),
      e('jar', 'O azeite da unção', 'Leviticus 8:10'),
    ],
    goal: g('mishkan', 'Fizeram tudo o que o Eterno ordenou', 'Leviticus 8:36'),
  },
  {
    id: 'shmini',
    book: 'Leviticus',
    nameHe: 'שמיני',
    namePt: 'Shemini',
    meaningPt: 'Oitavo',
    ref: 'Leviticus 9:1-11:47',
    scene: s('day', 'sand', 'mishkan', 'tents'),
    events: [
      e('fire', 'Fogo sai de diante do Eterno sobre o altar', 'Leviticus 9:24'),
      e('fish', 'Peixes com barbatanas e escamas', 'Leviticus 11:9'),
      e('locust', 'Os gafanhotos que se podem comer', 'Leviticus 11:22'),
    ],
    goal: g('mishkan', 'A glória do Eterno apareceu a todo o povo', 'Leviticus 9:23'),
  },
  {
    id: 'tazria',
    book: 'Leviticus',
    nameHe: 'תזריע',
    namePt: 'Tazria',
    meaningPt: 'Conceber',
    ref: 'Leviticus 12:1-13:59',
    scene: s('day', 'sand', 'tents'),
    events: [
      e('bird', 'Um pombinho como oferta', 'Leviticus 12:6'),
      e('cloth', 'A mancha que aparece na roupa', 'Leviticus 13:47'),
      e('fire', 'A roupa afetada é queimada no fogo', 'Leviticus 13:52'),
    ],
    goal: g('tents', 'O cohen examina e declara puro', 'Leviticus 13:6'),
  },
  {
    id: 'metzora',
    book: 'Leviticus',
    nameHe: 'מצרע',
    namePt: 'Metsorá',
    meaningPt: 'O afetado por tsaráat',
    ref: 'Leviticus 14:1-15:33',
    scene: s('day', 'sand', 'tents', 'city'),
    events: [
      e('bird', 'Duas aves vivas e puras', 'Leviticus 14:4'),
      e('wave', 'Sobre águas vivas', 'Leviticus 14:5'),
      e('bricks', 'Tiram as pedras da casa afetada', 'Leviticus 14:40'),
    ],
    goal: g('city', 'A casa é declarada pura', 'Leviticus 14:48'),
  },
  {
    id: 'acharei-mot',
    book: 'Leviticus',
    nameHe: 'אחרי מות',
    namePt: 'Acharê Mot',
    meaningPt: 'Depois da morte',
    ref: 'Leviticus 16:1-18:30',
    scene: s('dusk', 'sand', 'mishkan'),
    events: [
      e('cloud', 'Na nuvem apareço sobre o propiciatório', 'Leviticus 16:2'),
      e('sheep', 'O bode enviado a Azazel', 'Leviticus 16:10'),
      e('fire', 'Brasas de fogo de sobre o altar', 'Leviticus 16:12'),
    ],
    goal: g('mishkan', 'Yom Kipur: de todos os vossos pecados sereis purificados', 'Leviticus 16:30'),
  },
  {
    id: 'kedoshim',
    book: 'Leviticus',
    nameHe: 'קדשים',
    namePt: 'Kedoshim',
    meaningPt: 'Santos',
    ref: 'Leviticus 19:1-20:27',
    scene: s('day', 'field', 'trees', 'hills'),
    events: [
      e('wheat', 'Não colherás o canto do teu campo', 'Leviticus 19:9'),
      e('rock', 'Diante do cego não porás tropeço', 'Leviticus 19:14'),
      e('tree', 'Os frutos da árvore nos primeiros anos', 'Leviticus 19:23'),
    ],
    goal: g('sun', 'Amarás o teu próximo como a ti mesmo', 'Leviticus 19:18'),
  },
  {
    id: 'emor',
    book: 'Leviticus',
    nameHe: 'אמר',
    namePt: 'Emor',
    meaningPt: 'Diz',
    ref: 'Leviticus 21:1-24:23',
    scene: s('dusk', 'field', 'palms', 'tents'),
    events: [
      e('wheat', 'O primeiro feixe da colheita, o ômer', 'Leviticus 23:10'),
      e('tree', 'Fruto de árvore formosa e folhas de palmeira', 'Leviticus 23:40'),
      e('jar', 'Azeite puro para a lâmpada contínua', 'Leviticus 24:2'),
    ],
    goal: g('tents', 'Habitareis em sucot sete dias', 'Leviticus 23:42'),
  },
  {
    id: 'behar',
    book: 'Leviticus',
    nameHe: 'בהר',
    namePt: 'Behar',
    meaningPt: 'No monte',
    ref: 'Leviticus 25:1-26:2',
    scene: s('day', 'field', 'mountain', 'trees'),
    events: [
      e('wheat', 'No sétimo ano, a terra descansa', 'Leviticus 25:4'),
      e('tree', 'Nem podarás a tua vinha', 'Leviticus 25:4'),
      e('rock', 'Não poreis pedra figurada na vossa terra', 'Leviticus 26:1'),
    ],
    goal: g('sun', 'Proclamareis liberdade na terra', 'Leviticus 25:10'),
  },
  {
    id: 'bechukotai',
    book: 'Leviticus',
    nameHe: 'בחקתי',
    namePt: 'Bechucotai',
    meaningPt: 'Nos Meus estatutos',
    ref: 'Leviticus 26:3-27:34',
    scene: s('day', 'field', 'trees', 'hills'),
    events: [
      e('cloud', 'Darei as vossas chuvas a seu tempo', 'Leviticus 26:4'),
      e('wheat', 'A debulha alcançará a vindima', 'Leviticus 26:5'),
      e('lion', 'Farei cessar da terra o animal feroz', 'Leviticus 26:6'),
    ],
    goal: g('tents', 'Andarei entre vós', 'Leviticus 26:12'),
  },

  // ---------------------------------------------------------------- Bamidbar
  {
    id: 'bamidbar',
    book: 'Numbers',
    nameHe: 'במדבר',
    namePt: 'Bamidbar',
    meaningPt: 'No deserto',
    ref: 'Numbers 1:1-4:20',
    scene: s('desert', 'sand', 'tents', 'mountain'),
    events: [
      e('banner', 'Cada um junto à sua bandeira', 'Numbers 2:2'),
      e('rock', 'No deserto do Sinai', 'Numbers 1:1'),
      e('cloth', 'Cobrem a arca com um pano todo de azul', 'Numbers 4:6'),
    ],
    goal: g('tents', 'Ao redor da Tenda do Encontro acamparão', 'Numbers 2:2'),
  },
  {
    id: 'nasso',
    book: 'Numbers',
    nameHe: 'נשא',
    namePt: 'Nassô',
    meaningPt: 'Levanta',
    ref: 'Numbers 4:21-7:89',
    scene: s('day', 'sand', 'tents', 'mishkan'),
    events: [
      e('grapes', 'O nazir não comerá uvas, frescas nem secas', 'Numbers 6:3'),
      e('wagon', 'Seis carros cobertos e doze bois', 'Numbers 7:3'),
      e('cow', 'Os bois dos príncipes para o serviço', 'Numbers 7:6'),
    ],
    goal: g('sun', 'Que o Eterno te abençoe e te guarde', 'Numbers 6:24'),
  },
  {
    id: 'behaalotcha',
    book: 'Numbers',
    nameHe: 'בהעלתך',
    namePt: 'Behaalotechá',
    meaningPt: 'Quando acenderes',
    ref: 'Numbers 8:1-12:16',
    scene: s('desert', 'sand', 'cloud-pillar', 'tents'),
    events: [
      e('cloud', 'Quando a nuvem se levantava, o povo partia', 'Numbers 9:17'),
      e('fire', 'O fogo em Taverá', 'Numbers 11:3'),
      e('bird', 'As codornizes trazidas pelo vento', 'Numbers 11:31'),
    ],
    goal: g('mishkan', 'As sete lâmpadas iluminam diante da menorá', 'Numbers 8:2'),
  },
  {
    id: 'shlach',
    book: 'Numbers',
    nameHe: 'שלח לך',
    namePt: 'Shelach Lechá',
    meaningPt: 'Envia para ti',
    ref: 'Numbers 13:1-15:41',
    scene: s('day', 'grass', 'hills', 'city'),
    events: [
      e('rock', 'Subi pelo Neguev até o monte', 'Numbers 13:17'),
      e('grapes', 'Um cacho de uvas carregado por dois', 'Numbers 13:23'),
      e('bricks', 'Cidades fortificadas e muito grandes', 'Numbers 13:28'),
    ],
    goal: g('trees', 'O tsitsit nos cantos das vestes', 'Numbers 15:38'),
  },
  {
    id: 'korach',
    book: 'Numbers',
    nameHe: 'קרח',
    namePt: 'Côrach',
    meaningPt: 'Corá',
    ref: 'Numbers 16:1-18:32',
    scene: s('dusk', 'sand', 'tents'),
    events: [
      e('pit', 'A terra abre a sua boca', 'Numbers 16:32'),
      e('fire', 'As pás de fogo diante do Eterno', 'Numbers 16:17'),
      e('tree', 'O cajado de Aharon floresce e dá amêndoas', 'Numbers 17:23'),
    ],
    goal: g('mishkan', 'O cajado florido de Aharon diante do Testemunho', 'Numbers 17:25'),
  },
  {
    id: 'chukat',
    book: 'Numbers',
    nameHe: 'חקת',
    namePt: 'Chucat',
    meaningPt: 'Estatuto',
    ref: 'Numbers 19:1-22:1',
    scene: s('desert', 'sand', 'mountain'),
    events: [
      e('rock', 'Moshe fere a rocha e sai muita água', 'Numbers 20:11'),
      e('serpent', 'As serpentes ardentes no deserto', 'Numbers 21:6'),
      e('pit', 'Sobe, ó poço! Cantai a ele', 'Numbers 21:17'),
    ],
    goal: g('mountain', 'Monte Hor, nos limites da terra de Edom', 'Numbers 20:23'),
  },
  {
    id: 'balak',
    book: 'Numbers',
    nameHe: 'בלק',
    namePt: 'Balac',
    meaningPt: 'Balac',
    ref: 'Numbers 22:2-25:9',
    scene: s('day', 'field', 'hills', 'tents'),
    events: [
      e('donkey', 'A jumenta vê o anjo parado no caminho', 'Numbers 22:23'),
      e('bricks', 'Um caminho estreito entre vinhas, muro de cada lado', 'Numbers 22:24'),
      e('rock', 'Do alto das rochas eu o vejo', 'Numbers 23:9'),
    ],
    goal: g('tents', 'Quão belas são as tuas tendas, Yaakov', 'Numbers 24:5'),
  },
  {
    id: 'pinchas',
    book: 'Numbers',
    nameHe: 'פינחס',
    namePt: 'Pinechás',
    meaningPt: 'Pinechás',
    ref: 'Numbers 25:10-30:1',
    scene: s('day', 'field', 'tents', 'hills'),
    events: [
      e('banner', 'O censo de toda a comunidade', 'Numbers 26:2'),
      e('wheat', 'As filhas de Tselofchad recebem a herança', 'Numbers 27:7'),
      e('jar', 'A libação de cada dia', 'Numbers 28:7'),
    ],
    goal: g('mountain', 'Sobe ao monte Avarim e vê a terra', 'Numbers 27:12'),
  },
  {
    id: 'matot',
    book: 'Numbers',
    nameHe: 'מטות',
    namePt: 'Matot',
    meaningPt: 'Tribos',
    ref: 'Numbers 30:2-32:42',
    scene: s('day', 'grass', 'hills', 'tents'),
    events: [
      e('fire', 'Tudo o que suporta o fogo, passareis pelo fogo', 'Numbers 31:23'),
      e('sheep', 'Gado muito numeroso para Reuven e Gad', 'Numbers 32:1'),
      e('wave', 'Não nos faças atravessar o Iardén', 'Numbers 32:5'),
    ],
    goal: g('city', 'Construíram cidades e cercados para o rebanho', 'Numbers 32:16'),
  },
  {
    id: 'masei',
    book: 'Numbers',
    nameHe: 'מסעי',
    namePt: 'Massê',
    meaningPt: 'Jornadas',
    ref: 'Numbers 33:1-36:13',
    scene: s('desert', 'sand', 'tents', 'palms'),
    events: [
      e('rock', 'Estas são as jornadas dos filhos de Israel', 'Numbers 33:1'),
      e('wave', 'Passaram pelo meio do mar para o deserto', 'Numbers 33:8'),
      e('bricks', 'As cidades de refúgio', 'Numbers 35:11'),
    ],
    goal: g('city', 'Seis cidades de refúgio', 'Numbers 35:13'),
  },

  // ---------------------------------------------------------------- Devarim
  {
    id: 'devarim',
    book: 'Deuteronomy',
    nameHe: 'דברים',
    namePt: 'Devarim',
    meaningPt: 'Palavras',
    ref: 'Deuteronomy 1:1-3:22',
    scene: s('day', 'sand', 'mountain', 'tents'),
    events: [
      e('rock', 'Ide ao monte dos emoreus', 'Deuteronomy 1:7'),
      e('bricks', 'Cidades grandes e fortificadas até o céu', 'Deuteronomy 1:28'),
      e('wave', 'Levantai-vos e atravessai o ribeiro Zered', 'Deuteronomy 2:13'),
    ],
    goal: g('mountain', 'Estas são as palavras que Moshe falou', 'Deuteronomy 1:1'),
  },
  {
    id: 'vaetchanan',
    book: 'Deuteronomy',
    nameHe: 'ואתחנן',
    namePt: 'Vaetchanan',
    meaningPt: 'E supliquei',
    ref: 'Deuteronomy 3:23-7:11',
    scene: s('storm', 'stone', 'mountain'),
    events: [
      e('wave', 'Não atravessarás este Iardén', 'Deuteronomy 3:27'),
      e('fire', 'O monte ardia em fogo até o coração dos céus', 'Deuteronomy 4:11'),
      e('cloud', 'Escuridão, nuvem e névoa', 'Deuteronomy 4:11'),
    ],
    goal: g('tablets', 'Shemá Israel: o Eterno é Um', 'Deuteronomy 6:4'),
  },
  {
    id: 'eikev',
    book: 'Deuteronomy',
    nameHe: 'עקב',
    namePt: 'Ekev',
    meaningPt: 'Em consequência',
    ref: 'Deuteronomy 7:12-11:25',
    scene: s('desert', 'sand', 'mountain', 'palms'),
    events: [
      e('scorpion', 'Deserto de serpentes ardentes e escorpiões', 'Deuteronomy 8:15'),
      e('rock', 'Água tirada da rocha de pederneira', 'Deuteronomy 8:15'),
      e('wheat', 'Terra de trigo e cevada, de vinha, figo e romã', 'Deuteronomy 8:8'),
    ],
    goal: g('trees', 'Comerás, te fartarás e bendirás', 'Deuteronomy 8:10'),
  },
  {
    id: 'reeh',
    book: 'Deuteronomy',
    nameHe: 'ראה',
    namePt: 'Reê',
    meaningPt: 'Vê',
    ref: 'Deuteronomy 11:26-16:17',
    scene: s('day', 'grass', 'mountain', 'hills'),
    events: [
      e('fish', 'Tudo o que tem barbatanas e escamas', 'Deuteronomy 14:9'),
      e('bird', 'Toda ave pura podereis comer', 'Deuteronomy 14:11'),
      e('wheat', 'O dízimo de toda a tua semente', 'Deuteronomy 14:22'),
    ],
    goal: g('tents', 'E te alegrarás na tua festa', 'Deuteronomy 16:14'),
  },
  {
    id: 'shoftim',
    book: 'Deuteronomy',
    nameHe: 'שפטים',
    namePt: 'Shofetim',
    meaningPt: 'Juízes',
    ref: 'Deuteronomy 16:18-21:9',
    scene: s('day', 'field', 'city', 'trees'),
    events: [
      e('bricks', 'Juízes e oficiais em todas as tuas portas', 'Deuteronomy 16:18'),
      e('rock', 'Não removerás o marco do teu próximo', 'Deuteronomy 19:14'),
      e('tree', 'Não destruirás as suas árvores', 'Deuteronomy 20:19'),
    ],
    goal: g('city', 'Justiça, justiça seguirás', 'Deuteronomy 16:20'),
  },
  {
    id: 'ki-teitzei',
    book: 'Deuteronomy',
    nameHe: 'כי תצא',
    namePt: 'Ki Tetsê',
    meaningPt: 'Quando saíres',
    ref: 'Deuteronomy 21:10-25:19',
    scene: s('day', 'field', 'city', 'hills'),
    events: [
      e('donkey', 'O jumento do teu irmão caído no caminho', 'Deuteronomy 22:4'),
      e('bird', 'Um ninho de pássaro no teu caminho', 'Deuteronomy 22:6'),
      e('bricks', 'Farás um parapeito no teu telhado', 'Deuteronomy 22:8'),
    ],
    goal: g('city', 'Peso íntegro e justo terás', 'Deuteronomy 25:15'),
  },
  {
    id: 'ki-tavo',
    book: 'Deuteronomy',
    nameHe: 'כי תבוא',
    namePt: 'Ki Tavô',
    meaningPt: 'Quando entrares',
    ref: 'Deuteronomy 26:1-29:8',
    scene: s('day', 'field', 'hills', 'trees'),
    events: [
      e('basket', 'As primícias de todo o fruto, num cesto', 'Deuteronomy 26:2'),
      e('rock', 'Levantarás grandes pedras e as caiarás', 'Deuteronomy 27:2'),
      e('cloud', 'O céu, bom tesouro, dará a chuva a seu tempo', 'Deuteronomy 28:12'),
    ],
    goal: g('trees', 'Terra que mana leite e mel', 'Deuteronomy 26:9'),
  },
  {
    id: 'nitzavim',
    book: 'Deuteronomy',
    nameHe: 'נצבים',
    namePt: 'Nitsavim',
    meaningPt: 'Estais de pé',
    ref: 'Deuteronomy 29:9-30:20',
    scene: s('day', 'grass', 'hills'),
    events: [
      e('cloud', 'Não está nos céus', 'Deuteronomy 30:12'),
      e('wave', 'Nem está do outro lado do mar', 'Deuteronomy 30:13'),
    ],
    goal: g('sun', 'Escolhe a vida', 'Deuteronomy 30:19'),
  },
  {
    id: 'vayeilech',
    book: 'Deuteronomy',
    nameHe: 'וילך',
    namePt: 'Vayêlech',
    meaningPt: 'E foi',
    ref: 'Deuteronomy 31:1-31:30',
    scene: s('dusk', 'grass', 'mountain', 'tents'),
    events: [
      e('wave', 'Não passarás este Iardén', 'Deuteronomy 31:2'),
      e('cloud', 'A coluna de nuvem à porta da tenda', 'Deuteronomy 31:15'),
    ],
    goal: g('tablets', 'Moshe escreveu esta Torá', 'Deuteronomy 31:9'),
  },
  {
    id: 'haazinu',
    book: 'Deuteronomy',
    nameHe: 'האזינו',
    namePt: 'Haazinu',
    meaningPt: 'Escutai',
    ref: 'Deuteronomy 32:1-32:52',
    scene: s('dawn', 'grass', 'mountain', 'stars'),
    events: [
      e('cloud', 'Goteje como a chuva o meu ensino', 'Deuteronomy 32:2'),
      e('bird', 'Como a águia que desperta o seu ninho', 'Deuteronomy 32:11'),
    ],
    goal: g('mountain', 'Sobe ao monte Nevo', 'Deuteronomy 32:49'),
  },
  {
    id: 'vezot-haberachah',
    book: 'Deuteronomy',
    nameHe: 'וזאת הברכה',
    namePt: 'Vezot Haberachá',
    meaningPt: 'E esta é a bênção',
    ref: 'Deuteronomy 33:1-34:12',
    scene: s('dawn', 'grass', 'mountain', 'hills'),
    events: [
      e('banner', 'Moshe abençoa cada tribo', 'Deuteronomy 33:6'),
      e('rock', 'Moshe sobe ao cume do Pisgá', 'Deuteronomy 34:1'),
    ],
    goal: g('sun', 'Esta é a terra que jurei a Avraham, Itschak e Yaakov', 'Deuteronomy 34:4'),
  },
];

export const PARASHOT: readonly ParashaDef[] = ROWS.map((row, i) => ({ ...row, number: i + 1 }));

const BY_ID = new Map(PARASHOT.map((p) => [p.id, p]));

export function parashaById(id: string): ParashaDef | undefined {
  return BY_ID.get(id);
}

export function parashotOfBook(book: TorahBook): ParashaDef[] {
  return PARASHOT.filter((p) => p.book === book);
}

export function worldById(id: string): WorldDef | undefined {
  return WORLDS.find((w) => w.id === id);
}

const RANGES = new Map<string, VerseRange>(PARASHOT.map((p) => [p.id, parseTorahRef(p.ref)!]));

export function parashaRange(id: string): VerseRange | undefined {
  return RANGES.get(id);
}

/**
 * Parashiot que contêm ao menos um versículo do trecho. Um trecho que atravessa a
 * fronteira entre duas parashiot (ex.: Genesis 6:5-12) pertence às duas.
 */
export function parashotForRef(ref: string): string[] {
  const r = parseTorahRef(ref);
  if (!r) return [];
  const out: string[] = [];
  for (const p of PARASHOT) {
    if (p.book !== r.book) continue;
    const range = RANGES.get(p.id)!;
    const start = range.start.chapter * 1000 + range.start.verse;
    const end = range.end.chapter * 1000 + range.end.verse;
    const rs = r.start.chapter * 1000 + r.start.verse;
    const re = r.end.chapter * 1000 + r.end.verse;
    if (rs <= end && start <= re) out.push(p.id);
  }
  return out;
}
