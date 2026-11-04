import {
  DEFAULT_PACK_CONFIG,
  PACK_TYPES,
  batchParams,
  canSumTo,
  catalogCacheKey,
  catalogTypes,
  isPackType,
  parsePacksConfig,
  rarityOfReputation,
  topShare,
  validatePacksConfig,
} from './packs.model';

function withType(type: string, patch: Record<string, unknown>) {
  const base = JSON.parse(JSON.stringify(DEFAULT_PACK_CONFIG)) as Record<string, Record<string, unknown>>;
  base[type] = { ...base[type], ...patch };
  return base;
}

describe('configuración de los tipos de sobre', () => {
  describe('valores por defecto', () => {
    it('son válidos y quedan normalizados', () => {
      const result = parsePacksConfig({});
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const shares = PACK_TYPES.reduce((sum, t) => sum + result.config[t].share, 0);
      expect(shares).toBeCloseTo(1, 9);
      for (const type of PACK_TYPES) {
        const p = result.config[type].probabilities;
        expect(p.common + p.rare + p.epic + p.legendary).toBeCloseTo(1, 9);
      }
    });

    it('cumplen la monotonía de epic + legendary (FR-009)', () => {
      const shares = PACK_TYPES.map((t) => topShare(DEFAULT_PACK_CONFIG[t].probabilities));
      for (let i = 1; i < shares.length; i++) expect(shares[i]).toBeGreaterThanOrEqual(shares[i - 1]);
    });
  });

  describe('PACK_TYPES_CONFIG', () => {
    it('acepta un JSON completo', () => {
      const result = parsePacksConfig({ PACK_TYPES_CONFIG: JSON.stringify(DEFAULT_PACK_CONFIG) });
      expect(result.ok).toBe(true);
    });

    it('rechaza un JSON malformado', () => {
      const result = parsePacksConfig({ PACK_TYPES_CONFIG: '{ no es json' });
      expect(result).toEqual({ ok: false, errors: ['PACK_TYPES_CONFIG no es un JSON válido'] });
    });

    it('rechaza un tipo faltante y uno desconocido', () => {
      const config: Record<string, unknown> = { ...DEFAULT_PACK_CONFIG, mega: DEFAULT_PACK_CONFIG.common };
      delete config.epic;
      const result = validatePacksConfig(config);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.errors).toEqual(
        expect.arrayContaining(['tipo de sobre desconocido: mega', 'epic: falta la configuración del tipo']),
      );
    });
  });

  describe('FR-045', () => {
    it.each([
      ['precio 0', withType('rare', { price: 0 }), 'rare: el precio tiene que ser un entero positivo'],
      ['precio con decimales', withType('rare', { price: 10.5 }), 'rare: el precio tiene que ser un entero positivo'],
      ['cartas negativas', withType('epic', { cards: -1 }), 'epic: la cantidad de cartas tiene que ser un entero positivo'],
      [
        'probabilidades en 0',
        withType('common', { probabilities: { common: 0, rare: 0, epic: 0, legendary: 0 } }),
        'common: al menos una probabilidad tiene que ser positiva',
      ],
      [
        'probabilidad negativa',
        withType('common', { probabilities: { common: 1, rare: -0.1, epic: 0, legendary: 0 } }),
        'common: la probabilidad de rare tiene que ser un número no negativo',
      ],
      ['participación negativa', withType('legendary', { share: -1 }), 'legendary: la participación tiene que ser un número no negativo'],
    ])('rechaza %s', (_name, config, error) => {
      const result = validatePacksConfig(config);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors).toContain(error);
    });

    it('rechaza que todas las participaciones sean 0', () => {
      const config = JSON.parse(JSON.stringify(DEFAULT_PACK_CONFIG));
      for (const type of PACK_TYPES) config[type].share = 0;
      expect(validatePacksConfig(config)).toEqual({
        ok: false,
        errors: ['al menos un tipo tiene que tener participación positiva'],
      });
    });

    it('rechaza cantidades de cartas que no pueden sumar 100', () => {
      const config = JSON.parse(JSON.stringify(DEFAULT_PACK_CONFIG));
      config.rare.share = 0;
      config.epic.share = 0;
      config.legendary.share = 0;
      const result = validatePacksConfig(config);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors[0]).toMatch(/no pueden sumar exactamente 100/);
    });

    it('ignora las cartas de un tipo sin participación', () => {
      const config = JSON.parse(JSON.stringify(DEFAULT_PACK_CONFIG));
      config.common.cards = 7;
      config.common.share = 0;
      expect(validatePacksConfig(config).ok).toBe(true);
    });

    it('normaliza probabilidades que no suman 1', () => {
      const config = withType('rare', { probabilities: { common: 55, rare: 32, epic: 10, legendary: 3 } });
      const result = validatePacksConfig(config);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.config.rare.probabilities.common).toBeCloseTo(0.55, 9);
    });
  });

  it('rechaza una monotonía violada (FR-009)', () => {
    const config = withType('epic', { probabilities: { common: 0.8, rare: 0.18, epic: 0.01, legendary: 0.01 } });
    const result = validatePacksConfig(config);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.some((e) => e.startsWith('epic: la probabilidad de epic + legendary'))).toBe(true);
  });

  describe('canSumTo', () => {
    it.each([
      [[3], false],
      [[4], true],
      [[4, 6], true],
      [[3, 4, 5, 6], true],
      [[3, 6], false],
      [[7], false],
    ])('100 con %j → %s', (cards, expected) => {
      expect(canSumTo(100, cards)).toBe(expected);
    });
  });

  it('isPackType', () => {
    expect(isPackType('epic')).toBe(true);
    expect(isPackType('mega')).toBe(false);
    expect(isPackType(5)).toBe(false);
  });
});

// FR-016, FR-069 — la rareza de una carta es la de la home.
describe('rarityOfReputation', () => {
  it('aplica los cortes del OVR sobre la reputación', () => {
    expect(rarityOfReputation(95)).toBe('legendary');
    expect(rarityOfReputation(82)).toBe('epic');
    expect(rarityOfReputation(70)).toBe('rare');
    expect(rarityOfReputation(40)).toBe('common');
  });

  it('sin reputación cargada la carta es common (FR-068)', () => {
    expect(rarityOfReputation(null)).toBe('common');
  });
});

// FR-010, research #9 — catálogo en vivo.
describe('catálogo', () => {
  const zero = { common: 0, rare: 0, epic: 0, legendary: 0 };
  const remaining = { common: 2, rare: 0, epic: 1, legendary: 1 };
  const cards = {
    common: { common: 4, rare: 2, epic: 0, legendary: 0 },
    rare: { ...zero },
    epic: { common: 1, rare: 1, epic: 2, legendary: 1 },
    legendary: { ...zero },
  };

  it('informa los cuatro tipos con precio y cartas de la configuración', () => {
    const types = catalogTypes(DEFAULT_PACK_CONFIG, remaining, cards);
    expect(types.map((t) => t.type)).toEqual([...PACK_TYPES]);
    expect(types[0]).toMatchObject({ price: 100, cards: 3, remaining: 2 });
  });

  it('las probabilidades son la proporción de cada rareza entre las cartas sin abrir', () => {
    const [common, , epic] = catalogTypes(DEFAULT_PACK_CONFIG, remaining, cards);
    expect(common.probabilities).toEqual({ common: 4 / 6, rare: 2 / 6, epic: 0, legendary: 0 });
    expect(epic.probabilities).toEqual({ common: 0.2, rare: 0.2, epic: 0.4, legendary: 0.2 });
  });

  it('un tipo agotado, o sin cartas contadas, no tiene probabilidades', () => {
    const types = catalogTypes(DEFAULT_PACK_CONFIG, remaining, cards);
    expect(types[1].probabilities).toBeNull();
    expect(types[3].probabilities).toBeNull();
  });

  it('la clave de caché cambia con la versión del stock', () => {
    expect(catalogCacheKey(3)).toBe('packs:types:v3');
  });

  it('los parámetros del lote son cartas, probabilidades y participación de cada tipo (FR-046)', () => {
    const params = batchParams(DEFAULT_PACK_CONFIG) as Record<string, Record<string, unknown>>;
    expect(Object.keys(params)).toEqual([...PACK_TYPES]);
    expect(params.common).toEqual({
      cards: DEFAULT_PACK_CONFIG.common.cards,
      probabilities: DEFAULT_PACK_CONFIG.common.probabilities,
      share: DEFAULT_PACK_CONFIG.common.share,
    });
    expect(params.common).not.toHaveProperty('price');
  });
});
