import { describe, expect, it } from 'vitest';
import {
  BOT_RULES,
  ITEMS,
  JOURNEY_RULES,
  LIVES_RULES,
  PARASHOT,
  SUB_TRACKS,
  TORAH_BOOKS,
  WORLDS,
  beitMidrashNodeId,
  botAccuracy,
  classifyAnswer,
  completionCoins,
  currentMainNode,
  difficultyForSkill,
  difficultyNeighbors,
  itemById,
  livesAt,
  newlyOpened,
  nextSkill,
  nodeState,
  parashaNodeId,
  parashaRange,
  parashotForRef,
  parashotOfBook,
  parseNodeId,
  parseTorahRef,
  perksOf,
  rangeContains,
  spendLife,
  starsFor,
} from '../src/index.js';

describe('referências da Torá', () => {
  it('lê versículo, intervalo no capítulo, entre capítulos e capítulo inteiro', () => {
    expect(parseTorahRef('Genesis 1:3')).toEqual({ book: 'Genesis', start: { chapter: 1, verse: 3 }, end: { chapter: 1, verse: 3 } });
    expect(parseTorahRef('Genesis 1:3-5')?.end).toEqual({ chapter: 1, verse: 5 });
    expect(parseTorahRef('Genesis 1:30-2:3')?.end).toEqual({ chapter: 2, verse: 3 });
    expect(parseTorahRef('Exodus 12')?.end).toEqual({ chapter: 12, verse: 999 });
  });

  it('recusa o que não é Torá ou está invertido', () => {
    expect(parseTorahRef('Isaiah 1:1')).toBeNull();
    expect(parseTorahRef('Mishnah Avot 5:1')).toBeNull();
    expect(parseTorahRef('Genesis 2:3-1:1')).toBeNull();
    expect(parseTorahRef('Genesis')).toBeNull();
  });

  it('encontra a parashá de um versículo, inclusive na fronteira', () => {
    expect(parashotForRef('Genesis 1:1')).toEqual(['bereshit']);
    expect(parashotForRef('Genesis 6:8')).toEqual(['bereshit']);
    expect(parashotForRef('Genesis 6:9')).toEqual(['noach']);
    expect(parashotForRef('Genesis 6:5-12')).toEqual(['bereshit', 'noach']);
    expect(parashotForRef('Genesis 32:3')).toEqual(['vayetze']);
    expect(parashotForRef('Deuteronomy 34:12')).toEqual(['vezot-haberachah']);
    expect(parashotForRef('Berakhot 2a')).toEqual([]);
  });
});

describe('catálogo das parashiot', () => {
  it('tem as 54 parashiot, 12/11/10/10/11 por livro, com ids únicos', () => {
    expect(PARASHOT).toHaveLength(54);
    expect(TORAH_BOOKS.map((b) => parashotOfBook(b).length)).toEqual([12, 11, 10, 10, 11]);
    expect(new Set(PARASHOT.map((p) => p.id)).size).toBe(54);
    expect(PARASHOT.map((p) => p.number)).toEqual(Array.from({ length: 54 }, (_, i) => i + 1));
    expect(WORLDS.map((w) => w.id)).toEqual([...TORAH_BOOKS]);
  });

  it('as parashiot de cada livro estão em ordem e não se sobrepõem', () => {
    for (const book of TORAH_BOOKS) {
      const list = parashotOfBook(book);
      expect(list[0]!.ref.startsWith(`${book} 1:1-`)).toBe(true);
      for (let i = 1; i < list.length; i++) {
        const prev = parashaRange(list[i - 1]!.id)!;
        const cur = parashaRange(list[i]!.id)!;
        const prevEnd = prev.end.chapter * 1000 + prev.end.verse;
        const curStart = cur.start.chapter * 1000 + cur.start.verse;
        expect(curStart, `${list[i]!.id} começa depois de ${list[i - 1]!.id}`).toBeGreaterThan(prevEnd);
      }
    }
  });

  it('cada episódio e cada chegada citam um versículo de dentro da própria parashá', () => {
    for (const p of PARASHOT) {
      const range = parashaRange(p.id)!;
      expect(p.events.length).toBeGreaterThanOrEqual(2);
      for (const ev of [...p.events, p.goal]) {
        const r = parseTorahRef(ev.ref);
        expect(r, `${p.id}: ${ev.ref}`).not.toBeNull();
        expect(rangeContains(range, r!), `${p.id}: ${ev.ref} fora de ${p.ref}`).toBe(true);
      }
    }
  });
});

describe('desbloqueio do mapa', () => {
  const done = (...ids: string[]) => new Set(ids);

  it('começa só com a Torá de Bereshit aberta', () => {
    expect(nodeState('bereshit:torah', done())).toBe('open');
    expect(nodeState('noach:torah', done())).toBe('locked');
    expect(nodeState('bereshit:kabbalah', done())).toBe('locked');
    expect(nodeState(beitMidrashNodeId('Genesis'), done())).toBe('locked');
  });

  it('nenhum subcaminho abre antes da Torá da mesma parashá', () => {
    for (const p of PARASHOT) {
      for (const t of SUB_TRACKS) {
        const everythingElse = new Set(PARASHOT.filter((x) => x.id !== p.id).map((x) => parashaNodeId(x.id)));
        expect(nodeState(parashaNodeId(p.id, t), everythingElse)).toBe('locked');
        everythingElse.add(parashaNodeId(p.id));
        expect(nodeState(parashaNodeId(p.id, t), everythingElse)).toBe('open');
      }
    }
  });

  it('concluir a Torá de Bereshit abre Nôach e os seis subcaminhos', () => {
    const opened = newlyOpened('bereshit:torah', done());
    expect(opened).toContain('noach:torah');
    for (const t of SUB_TRACKS) expect(opened).toContain(`bereshit:${t}`);
    expect(opened).toHaveLength(1 + SUB_TRACKS.length);
  });

  it('a casa de estudos pede todas as parashiot do livro e abre o mundo seguinte', () => {
    const mains = parashotOfBook('Genesis').map((p) => parashaNodeId(p.id));
    expect(nodeState('beit-midrash:Genesis', new Set(mains.slice(0, -1)))).toBe('locked');
    expect(nodeState('beit-midrash:Genesis', new Set(mains))).toBe('open');
    expect(nodeState('shemot:torah', new Set(mains))).toBe('locked');
    expect(nodeState('shemot:torah', new Set([...mains, 'beit-midrash:Genesis']))).toBe('open');
    expect(currentMainNode(new Set(mains))).toBe('beit-midrash:Genesis');
  });

  it('lê e recusa ids de nó', () => {
    expect(parseNodeId('bereshit:torah')).toEqual({ kind: 'parasha', parashaId: 'bereshit', track: 'torah' });
    expect(parseNodeId('beit-midrash:Exodus')).toEqual({ kind: 'beit-midrash', book: 'Exodus' });
    expect(parseNodeId('bereshit:astrologia')).toBeNull();
    expect(parseNodeId('atlantida:torah')).toBeNull();
    expect(parseNodeId('bereshit:torah:x')).toBeNull();
  });
});

describe('dificuldade dinâmica e moedas', () => {
  const limit = JOURNEY_RULES.questionTimeLimitSeconds * 1000;

  it('classifica pelo tempo de resposta', () => {
    expect(classifyAnswer({ correct: true, timedOut: false, elapsedMs: 3000, limitMs: limit })).toBe('perfect');
    expect(classifyAnswer({ correct: true, timedOut: false, elapsedMs: 12_000, limitMs: limit })).toBe('pass');
    expect(classifyAnswer({ correct: true, timedOut: false, elapsedMs: 22_000, limitMs: limit })).toBe('slow');
    expect(classifyAnswer({ correct: false, timedOut: false, elapsedMs: 2000, limitMs: limit })).toBe('wrong');
    expect(classifyAnswer({ correct: false, timedOut: true, elapsedMs: limit, limitMs: limit })).toBe('timeout');
  });

  it('acertos rápidos sobem o nível mais que os lentos; erros descem', () => {
    let skill: number = JOURNEY_RULES.skill.start;
    expect(difficultyForSkill(skill)).toBe('medium');
    skill = nextSkill(skill, 'perfect');
    skill = nextSkill(skill, 'perfect');
    expect(difficultyForSkill(skill)).toBe('hard');
    expect(nextSkill(1, 'perfect')).toBeGreaterThan(nextSkill(1, 'slow'));
    expect(nextSkill(0, 'wrong')).toBe(0);
    expect(nextSkill(3, 'perfect')).toBe(3);
    expect(difficultyForSkill(0)).toBe('easy');
    expect(difficultyForSkill(3)).toBe('expert');
  });

  it('procura níveis vizinhos do mais perto ao mais longe', () => {
    expect(difficultyNeighbors('medium')).toEqual(['medium', 'easy', 'hard', 'expert']);
    expect(difficultyNeighbors('expert')).toEqual(['expert', 'hard', 'medium', 'easy']);
  });

  it('estrelas e bônus de conclusão', () => {
    expect([starsFor(0), starsFor(1), starsFor(2), starsFor(5)]).toEqual([3, 2, 1, 1]);
    expect(completionCoins('main', 3, true, 0)).toBe(30);
    expect(completionCoins('main', 3, false, 0)).toBe(15);
    expect(completionCoins('beitMidrash', 3, true, 50)).toBe(98);
  });
});

describe('itens do Golem', () => {
  it('todo item tem um jeito de ser obtido e os ids são únicos', () => {
    expect(new Set(ITEMS.map((i) => i.id)).size).toBe(ITEMS.length);
    for (const book of TORAH_BOOKS) {
      expect(ITEMS.some((i) => i.unlock.kind === 'beitMidrash' && i.unlock.book === book), book).toBe(true);
    }
  });

  it('soma as vantagens, um item por espaço', () => {
    const perks = perksOf(['tzitzit', 'lamparina', 'oculos', 'kipa-shabat', 'chavruta']);
    expect(perks).toEqual({
      extraHearts: 1,
      extraTimeSeconds: 6,
      firstMistakeFree: false,
      coinBonusPct: 20,
      powerUps: { eliminate: 1, skip: 0, hint: 2 },
    });
    // Dois itens na mão: só o primeiro vale.
    expect(perksOf(['lamparina', 'pena']).firstMistakeFree).toBe(false);
    expect(itemById('kipa-azul')?.unlock.kind).toBe('starter');
  });
});

describe('vidas da roleta', () => {
  const t0 = new Date('2026-11-01T12:00:00Z');
  const min = (n: number) => new Date(t0.getTime() + n * 60_000);

  it('gasta uma vida e começa a recarga', () => {
    const after = spendLife(LIVES_RULES.max, t0, t0);
    expect(after.lives).toBe(4);
    expect(after.nextLifeAt).toEqual(min(10));
  });

  it('recupera uma vida a cada 10 minutos até encher', () => {
    expect(livesAt(0, t0, min(9)).lives).toBe(0);
    expect(livesAt(0, t0, min(10)).lives).toBe(1);
    expect(livesAt(0, t0, min(25))).toEqual({ lives: 2, updatedAt: min(20), nextLifeAt: min(30) });
    expect(livesAt(0, t0, min(500)).lives).toBe(5);
    expect(livesAt(0, t0, min(500)).nextLifeAt).toBeNull();
  });

  it('não perde o tempo já acumulado ao gastar outra vida', () => {
    const first = spendLife(5, t0, t0); // 4 vidas, relógio em t0
    const second = spendLife(first.lives, first.updatedAt, min(7)); // 3 vidas
    expect(second.nextLifeAt).toEqual(min(10));
    expect(spendLife(0, min(0), min(5)).lives).toBe(0);
  });
});

describe('bots', () => {
  it('acompanham o jogador, um pouco abaixo, e respeitam a dificuldade', () => {
    expect(botAccuracy(0.8, 'medium')).toBeCloseTo(0.76);
    expect(botAccuracy(0.8, 'expert')).toBeLessThan(botAccuracy(0.8, 'easy'));
    expect(botAccuracy(null, 'medium')).toBeCloseTo(BOT_RULES.defaultAccuracy * BOT_RULES.handicap);
    expect(botAccuracy(1, 'easy')).toBe(BOT_RULES.maxAccuracy);
    expect(botAccuracy(0, 'expert')).toBe(BOT_RULES.minAccuracy);
  });
});
