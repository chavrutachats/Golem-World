import { describe, expect, it } from 'vitest';
import {
  AD_RULES,
  BOOST_AD_PRIZES,
  COSMETIC_SLOTS,
  GIFT_PRIZES,
  ITEMS,
  LIVES_RULES,
  PARASHOT,
  PrizeSchema,
  SHEKEL_OFFERS,
  STORE_PRODUCTS,
  WHEEL_PRIZES,
  drawPrize,
  gainLives,
  itemCategory,
  itemPrice,
  lookFromItems,
  pacingAfterAd,
  perksOf,
  prizeEffect,
  registerBreak,
} from '../src/index.js';

describe('catálogo da Fase 9', () => {
  it('nada comprado com shekels dá vantagem (a roleta e o Golem World continuam justos)', () => {
    for (const item of ITEMS) {
      if (itemPrice(item)?.currency === 'shekels') expect(item.perk, item.id).toBeNull();
    }
  });

  it('material e personagens só mudam o visual', () => {
    for (const item of ITEMS.filter((i) => COSMETIC_SLOTS.includes(i.slot))) {
      expect(item.perk, item.id).toBeNull();
      expect(item.perkPt, item.id).toBeNull();
    }
  });

  it('cada material tem cor e cada personagem tem o versículo de onde vem', () => {
    for (const item of ITEMS) {
      if (item.slot === 'skin') expect(item.clay, item.id).toMatch(/^#[0-9A-F]{6}$/i);
      if (item.slot === 'costume') expect(item.ref, item.id).toMatch(/^[A-Z][A-Za-z ]+ \d+:\d+(-\d+)?$/);
    }
  });

  it('personagens da história pedem uma parashá que existe; visitantes são pagos com shekels', () => {
    const ids = new Set(PARASHOT.map((p) => p.id));
    const costumes = ITEMS.filter((i) => itemCategory(i) === 'character');
    expect(costumes.length).toBeGreaterThanOrEqual(12);
    for (const c of costumes) {
      if (c.unlock.kind === 'parasha') expect(ids.has(c.unlock.parashaId), c.id).toBe(true);
      else expect(c.unlock.kind, c.id).toBe('shekels');
    }
    // O exemplo do pedido: Adão, Eva e a Serpente em Bereshit; Davi visita.
    for (const id of ['adao', 'eva', 'serpente']) expect(ITEMS.find((i) => i.id === id)?.unlock).toMatchObject({ kind: 'parasha', parashaId: 'bereshit' });
    expect(ITEMS.find((i) => i.id === 'davi')?.unlock).toMatchObject({ kind: 'shekels' });
  });

  it('ids únicos, preços positivos e ofertas coerentes', () => {
    expect(new Set(ITEMS.map((i) => i.id)).size).toBe(ITEMS.length);
    for (const item of ITEMS) {
      const price = itemPrice(item);
      if (price) expect(price.amount, item.id).toBeGreaterThan(0);
    }
    for (const o of SHEKEL_OFFERS) expect(o.price).toBeGreaterThan(0);
    expect(STORE_PRODUCTS.filter((p) => !p.consumable).map((p) => p.id)).toEqual(['no_ads']);
  });

  it('fantasia por cima não tira as vantagens dos itens por baixo', () => {
    const perks = perksOf(['tzitzit', 'adao', 'barro-nilo']);
    expect(perks.extraHearts).toBe(1);
  });

  it('a aparência leva material e personagem', () => {
    const look = lookFromItems([
      { itemId: 'kipa-azul', equipped: true },
      { itemId: 'cobre', equipped: true },
      { itemId: 'davi', equipped: true },
    ]);
    expect(look.equipped).toEqual({ head: 'kipa-azul', skin: 'cobre', costume: 'davi' });
  });
});

describe('prêmios', () => {
  it('todo prêmio das tabelas é válido e mostrável', () => {
    for (const table of [WHEEL_PRIZES, GIFT_PRIZES, BOOST_AD_PRIZES]) {
      for (const { prize, weight } of table) {
        expect(PrizeSchema.parse(prize)).toEqual(prize);
        expect(weight).toBeGreaterThan(0);
      }
    }
  });

  it('o mesmo número dá o mesmo prêmio; a distribuição segue os pesos', () => {
    expect(drawPrize(WHEEL_PRIZES, 123_456)).toEqual(drawPrize(WHEEL_PRIZES, 123_456));
    const total = WHEEL_PRIZES.reduce((s, p) => s + p.weight, 0);
    const counts = new Map<string, number>();
    for (let i = 0; i < total * 50; i++) {
      const key = JSON.stringify(drawPrize(WHEEL_PRIZES, i));
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    for (const { prize, weight } of WHEEL_PRIZES) expect(counts.get(JSON.stringify(prize))).toBe(weight * 50);
  });

  it('cada prêmio vira o efeito certo nos saldos', () => {
    expect(prizeEffect({ kind: 'coins', amount: 15 })).toMatchObject({ coins: 15, shekels: 0 });
    expect(prizeEffect({ kind: 'double', amount: 40 })).toMatchObject({ coins: 40 });
    expect(prizeEffect({ kind: 'shekels', amount: 5 })).toMatchObject({ shekels: 5, coins: 0 });
    expect(prizeEffect({ kind: 'boost', boost: 'skip', amount: 1 }).boosts).toEqual({ skip: 1 });
    expect(prizeEffect({ kind: 'life', amount: 1 }).lives).toBe(1);
    expect(prizeEffect({ kind: 'heart' }).revive).toBe(true);
    expect(prizeEffect({ kind: 'moves', amount: 5 })).toMatchObject({ moves: 5, coins: 0, revive: false });
  });
});

describe('vidas ganhas', () => {
  const t0 = new Date('2026-11-03T10:00:00Z');
  it('somam sem passar do máximo e param o relógio quando enchem', () => {
    const after = gainLives(0, t0, new Date(t0.getTime() + 60_000), 1);
    expect(after.lives).toBe(1);
    expect(after.nextLifeAt).not.toBeNull();
    const full = gainLives(4, t0, t0, 5);
    expect(full).toMatchObject({ lives: LIVES_RULES.max, nextLifeAt: null });
  });
  it('não perdem a recarga que já estava correndo', () => {
    // 25 minutos depois com 0 vidas: já voltaram 2; o anúncio dá mais 1.
    const now = new Date(t0.getTime() + 25 * 60_000);
    expect(gainLives(0, t0, now, 1).lives).toBe(3);
  });
});

describe('ritmo do anúncio obrigatório', () => {
  const now = new Date('2026-11-03T10:00:00Z');

  it('vem na pausa da meta, nunca antes', () => {
    let pacing = { breaks: 0, target: 3, lastAdAt: null as Date | null };
    const decisions: string[] = [];
    for (let i = 0; i < 3; i++) {
      const r = registerBreak(pacing, now, false);
      decisions.push(r.decision);
      pacing = { ...pacing, breaks: r.breaks };
    }
    expect(decisions).toEqual(['none', 'none', 'ad']);
  });

  it('respeita o intervalo mínimo entre anúncios', () => {
    const recent = { breaks: 9, target: 3, lastAdAt: new Date(now.getTime() - 30_000) };
    expect(registerBreak(recent, now, false).decision).toBe('none');
    const old = { ...recent, lastAdAt: new Date(now.getTime() - AD_RULES.minGapSeconds * 1000) };
    expect(registerBreak(old, now, false).decision).toBe('ad');
  });

  it('"Sem anúncios" desliga só o obrigatório', () => {
    expect(registerBreak({ breaks: 50, target: 3, lastAdAt: null }, now, true).decision).toBe('none');
  });

  it('depois de um anúncio, a próxima meta fica entre 3 e 5 pausas', () => {
    const seen = new Set<number>();
    for (let r = 0; r < 3; r++) seen.add(pacingAfterAd(now, () => r).target);
    expect([...seen].sort()).toEqual([3, 4, 5]);
    expect(pacingAfterAd(now, () => 0)).toMatchObject({ breaks: 0, lastAdAt: now });
  });
});
