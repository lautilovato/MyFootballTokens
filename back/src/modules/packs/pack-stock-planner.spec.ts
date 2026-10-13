import type { Rarity } from '../player/rarity';
import { DEFAULT_PACK_CONFIG, PACK_TYPES, PacksConfig, RARITY_ORDER, topShare, validatePacksConfig } from './pack-config.rules';
import { EligibleToken, planBatch, planPackCounts } from './pack-stock-planner';

/** Generador con semilla fija (mulberry32): los casos aleatorios son reproducibles. */
function seededRandom(seed: number): (maxExclusive: number) => number {
  let state = seed >>> 0;
  return (maxExclusive: number) => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    const unit = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    return Math.floor(unit * maxExclusive);
  };
}

/** Un lote de jugadores completos: 100 tokens por jugador, todos de la rareza del jugador. */
function lot(rarities: Rarity[]): EligibleToken[] {
  return rarities.flatMap((rarity, p) =>
    Array.from({ length: 100 }, (_, serial) => ({ tokenId: `p${p}-t${serial + 1}`, rarity })),
  );
}

function randomLot(players: number, random: (n: number) => number, weights = [34, 52, 13, 1]): EligibleToken[] {
  const total = weights.reduce((a, b) => a + b, 0);
  const rarities = Array.from({ length: players }, () => {
    let pick = random(total);
    for (let i = 0; i < weights.length; i++) {
      if (pick < weights[i]) return RARITY_ORDER[i];
      pick -= weights[i];
    }
    return 'common' as Rarity;
  });
  return lot(rarities);
}

function config(): PacksConfig {
  const parsed = validatePacksConfig(DEFAULT_PACK_CONFIG);
  if (!parsed.ok) throw new Error('config por defecto inválida');
  return parsed.config;
}

function assertExactPartition(tokens: EligibleToken[], cfg: PacksConfig, random: (n: number) => number) {
  const plan = planBatch(tokens, cfg, random);
  const seen = new Set<string>();
  let cards = 0;
  for (const pack of plan.packs) {
    expect(pack.tokenIds).toHaveLength(cfg[pack.type].cards);
    for (const id of pack.tokenIds) {
      expect(seen.has(id)).toBe(false);
      seen.add(id);
    }
    cards += pack.tokenIds.length;
  }
  expect(cards).toBe(tokens.length);
  expect(seen.size).toBe(tokens.length);
  return plan;
}

describe('pack-stock-planner', () => {
  describe('partición exacta (FR-013, SC-005, SC-006)', () => {
    it('cada token en exactamente un sobre y cada sobre completo, en cientos de lotes aleatorios', () => {
      const random = seededRandom(20261013);
      const cfg = config();
      for (let run = 0; run < 300; run++) {
        const players = 1 + random(300);
        assertExactPartition(randomLot(players, random), cfg, random);
      }
    });

    it('un lote de un solo jugador también se reparte completo', () => {
      for (const rarity of RARITY_ORDER) assertExactPartition(lot([rarity]), config(), seededRandom(7));
    });

    it('un lote vacío no arma sobres', () => {
      expect(planBatch([], config(), seededRandom(1)).packs).toEqual([]);
    });

    it('la cantidad de sobres por tipo sigue la participación', () => {
      const cfg = config();
      const total = 264_400;
      const counts = planPackCounts(total, cfg);
      for (const type of PACK_TYPES) {
        const tokens = counts[type] * cfg[type].cards;
        expect(Math.abs(tokens - cfg[type].share * total)).toBeLessThanOrEqual(cfg[type].cards * 7);
      }
      expect(PACK_TYPES.reduce((s, t) => s + counts[t] * cfg[t].cards, 0)).toBe(total);
    });

    it('con cantidades de cartas que no admiten ajuste local igual encuentra una suma exacta', () => {
      const cfg = config();
      const onlyBig: PacksConfig = {
        ...cfg,
        common: { ...cfg.common, share: 0 },
        rare: { ...cfg.rare, share: 0 },
        epic: { ...cfg.epic, cards: 5, share: 0.5 },
        legendary: { ...cfg.legendary, cards: 6, share: 0.5 },
      };
      assertExactPartition(lot(['rare', 'epic', 'common']), onlyBig, seededRandom(3));
    });
  });

  describe('probabilidades (FR-014, SC-007)', () => {
    it('una rareza con probabilidad objetivo 0 nunca cae en ese tipo', () => {
      const cfg = config();
      cfg.common = { ...cfg.common, probabilities: { common: 0.9, rare: 0.1, epic: 0, legendary: 0 } };
      cfg.rare = { ...cfg.rare, probabilities: { common: 0.6, rare: 0.3, epic: 0.1, legendary: 0 } };
      const random = seededRandom(11);
      const plan = assertExactPartition(randomLot(200, random, [40, 40, 15, 5]), cfg, random);
      expect(plan.composition.common.cards.epic).toBe(0);
      expect(plan.composition.common.cards.legendary).toBe(0);
      expect(plan.composition.rare.cards.legendary).toBe(0);
    });

    it('una rareza con probabilidad positiva puede caer en cualquier tipo', () => {
      const random = seededRandom(5);
      const plan = assertExactPartition(randomLot(300, random, [25, 25, 25, 25]), config(), random);
      for (const type of PACK_TYPES) {
        for (const rarity of RARITY_ORDER) expect(plan.composition[type].cards[rarity]).toBeGreaterThan(0);
      }
    });

    it('epic + legendary no decrece al subir de tipo con la configuración por defecto', () => {
      const cfg = config();
      const random = seededRandom(99);
      for (let run = 0; run < 50; run++) {
        const plan = planBatch(randomLot(50 + random(250), random), cfg, random);
        const shares = PACK_TYPES.map((type) => {
          const cards = plan.composition[type].cards;
          const total = RARITY_ORDER.reduce((s, r) => s + cards[r], 0);
          return total === 0 ? 0 : topShare({
            common: cards.common / total,
            rare: cards.rare / total,
            epic: cards.epic / total,
            legendary: cards.legendary / total,
          });
        });
        for (let i = 1; i < shares.length; i++) expect(shares[i]).toBeGreaterThanOrEqual(shares[i - 1] - 1e-9);
      }
    });

    it('la composición informada coincide con las cartas de los sobres', () => {
      const random = seededRandom(42);
      const tokens = randomLot(120, random);
      const rarityOf = new Map(tokens.map((t) => [t.tokenId, t.rarity]));
      const plan = planBatch(tokens, config(), random);
      for (const type of PACK_TYPES) {
        const counted = { common: 0, rare: 0, epic: 0, legendary: 0 };
        for (const pack of plan.packs.filter((p) => p.type === type)) {
          for (const id of pack.tokenIds) counted[rarityOf.get(id)!]++;
        }
        expect(counted).toEqual(plan.composition[type].cards);
        expect(plan.packs.filter((p) => p.type === type)).toHaveLength(plan.composition[type].packs);
      }
    });
  });

  it('es reproducible con la misma función de azar', () => {
    const tokens = randomLot(80, seededRandom(8));
    const a = planBatch(tokens, config(), seededRandom(123));
    const b = planBatch(tokens, config(), seededRandom(123));
    expect(a).toEqual(b);
  });
});
