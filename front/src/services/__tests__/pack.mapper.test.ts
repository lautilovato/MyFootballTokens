import { describe, expect, it } from 'vitest';
import { toInventoryCard, toPackData, toRevealedCard } from '../pack.mapper';
import type { OpeningCard } from '../packs.service';
import type { ApiPlayerCard } from '../players.service';

function apiPlayer(over: Partial<ApiPlayerCard> = {}): ApiPlayerCard {
  return {
    id: 'p1',
    name: 'Leo Legendario',
    position: 'FW',
    ovr: 91,
    rarity: 'legendary',
    club: { name: 'E2E FC', crestUrl: null },
    nationality: { name: 'Argentina', code: 'ar' },
    imageUrl: null,
    goals: 10,
    assists: 5,
    marketValue: 9500,
    changePct: 5,
    supply: { minted: 100, total: 100 }, forSaleCount: 0, firstListedSerial: null,
    priceHistory: [9000, 9500],
    ...over,
  };
}

/** 08-sobres T053 — respuestas de sobres → props de `Pack` y `PlayerCard`. */
describe('pack.mapper', () => {
  it('toPackData arma el sobre con el nivel visual de su tipo', () => {
    expect(
      toPackData({ type: 'epic', price: 400, cards: 5, remaining: 37, probabilities: null }),
    ).toEqual({ name: 'Epic', tier: 'epic', series: '37 sin abrir', cardCount: 5 });
  });

  it('toInventoryCard pone el número de serie del token en la carta, con la cotización vigente', () => {
    const data = toInventoryCard(apiPlayer(), 17);
    expect(data.token.serial).toBe(17);
    expect(data.token.rarity).toBe('legendary');
    expect(data.price.current).toBe(9500);
  });

  it('toRevealedCard usa la rareza y la cotización del momento cero y el número de serie', () => {
    const card: OpeningCard = {
      tokenId: 't1',
      serial: 42,
      rarity: 'epic',
      quotePrice: 9000,
      player: apiPlayer({ rarity: 'legendary', marketValue: 9500 }),
    };
    const data = toRevealedCard(card);

    expect(data.name).toBe('Leo Legendario');
    expect(data.token.rarity).toBe('epic');
    expect(data.token.serial).toBe(42);
    expect(data.price.current).toBe(9000);
    expect(data.overall).toBe(91);
  });
});
