import { PlayerPosition } from '../../infrastructure/database/entities/player.entity';
import {
  DEFAULT_LIMIT,
  DEFAULT_PAGE,
  OVR_MAX,
  PRICE_HISTORY_POINTS,
  RARITY_THRESHOLDS,
  Rarity,
  filterLogFields,
  ovrFromReputation,
  pageMeta,
  playersListCacheKey,
  priceMovement,
  rarityFromOvr,
  reputationRangesForRarities,
  resolvePagination,
} from './player.model';

/** 08-sobres FR-067, FR-068: el OVR es la reputación mundial cargada. */
describe('ovrFromReputation', () => {
  it('es la reputación', () => {
    expect(ovrFromReputation(91)).toBe(91);
    expect(ovrFromReputation(70)).toBe(70);
    expect(ovrFromReputation(0)).toBe(0);
  });

  it('una reputación de 100 se presenta como 99', () => {
    expect(ovrFromReputation(100)).toBe(OVR_MAX);
  });

  it('acota valores fuera de rango', () => {
    expect(ovrFromReputation(120)).toBe(OVR_MAX);
    expect(ovrFromReputation(-5)).toBe(0);
  });

  it('es nulo sin reputación cargada', () => {
    expect(ovrFromReputation(null)).toBeNull();
    expect(ovrFromReputation(undefined)).toBeNull();
    expect(ovrFromReputation(Number.NaN)).toBeNull();
  });
});
// 08-sobres FR-016 y FR-068 — cortes de rareza sobre el OVR (la reputación) y su traducción a
// rangos de reputación para los filtros.
describe('rarity', () => {
  describe('rarityFromOvr', () => {
    it('clasifica según los cortes definidos', () => {
      expect(rarityFromOvr(91)).toBe<Rarity>('legendary');
      expect(rarityFromOvr(84)).toBe<Rarity>('epic');
      expect(rarityFromOvr(73)).toBe<Rarity>('rare');
      expect(rarityFromOvr(50)).toBe<Rarity>('common');
    });

    it('respeta los bordes exactos de cada corte', () => {
      expect(rarityFromOvr(88)).toBe<Rarity>('legendary');
      expect(rarityFromOvr(87)).toBe<Rarity>('epic');
      expect(rarityFromOvr(80)).toBe<Rarity>('epic');
      expect(rarityFromOvr(79)).toBe<Rarity>('rare');
      expect(rarityFromOvr(70)).toBe<Rarity>('rare');
      expect(rarityFromOvr(69)).toBe<Rarity>('common');
    });

    it('clasifica como common al jugador sin OVR (FR-068)', () => {
      expect(rarityFromOvr(null)).toBe<Rarity>('common');
    });

    it('los umbrales coinciden con los de la spec', () => {
      expect(RARITY_THRESHOLDS).toEqual({ legendary: 88, epic: 80, rare: 70 });
    });
  });

  describe('reputationRangesForRarities', () => {
    it('traduce cada rareza a su rango de reputación', () => {
      expect(reputationRangesForRarities(['legendary'])).toEqual([{ min: 88, max: null, includeNull: false }]);
      expect(reputationRangesForRarities(['epic'])).toEqual([{ min: 80, max: 88, includeNull: false }]);
      expect(reputationRangesForRarities(['rare'])).toEqual([{ min: 70, max: 80, includeNull: false }]);
    });

    it('common incluye a los jugadores sin reputación', () => {
      expect(reputationRangesForRarities(['common'])).toEqual([{ min: null, max: 70, includeNull: true }]);
    });

    it('varias rarezas producen varios rangos, para unirlos con OR', () => {
      const ranges = reputationRangesForRarities(['legendary', 'rare']);
      expect(ranges).toHaveLength(2);
      expect(ranges).toContainEqual({ min: 88, max: null, includeNull: false });
      expect(ranges).toContainEqual({ min: 70, max: 80, includeNull: false });
    });

    it('sin rarezas no impone ningún rango', () => {
      expect(reputationRangesForRarities([])).toEqual([]);
      expect(reputationRangesForRarities(undefined)).toEqual([]);
    });

    it('una rareza repetida produce un solo rango', () => {
      expect(reputationRangesForRarities(['epic', 'epic'])).toHaveLength(1);
    });

    it('las cuatro rarezas juntas cubren todo el espacio sin solaparse', () => {
      const ranges = reputationRangesForRarities(['legendary', 'epic', 'rare', 'common']);
      expect(ranges).toHaveLength(4);
      expect(ranges.some((r) => r.includeNull)).toBe(true);
      const sorted = [...ranges].sort((a, b) => (a.min ?? -Infinity) - (b.min ?? -Infinity));
      expect(sorted[0].max).toBe(sorted[1].min);
      expect(sorted[1].max).toBe(sorted[2].min);
      expect(sorted[2].max).toBe(sorted[3].min);
    });

    it('cada reputación cae en el rango de su rareza', () => {
      const all = reputationRangesForRarities(['legendary', 'epic', 'rare', 'common']);
      for (let reputation = 0; reputation <= 100; reputation++) {
        const rarity = rarityFromOvr(Math.min(99, reputation));
        const matching = all.filter(
          (r) => (r.min === null || reputation >= r.min) && (r.max === null || reputation < r.max),
        );
        expect(matching).toEqual(reputationRangesForRarities([rarity]));
      }
    });
  });
});

describe('priceMovement', () => {
  it('sin cotizaciones: serie vacía y variación 0', () => {
    expect(priceMovement([])).toEqual({ changePct: 0, history: [] });
  });

  it('con una sola cotización no hay variación que calcular', () => {
    expect(priceMovement([724])).toEqual({ changePct: 0, history: [724] });
  });

  it('la variación compara la última cotización con la anterior', () => {
    expect(priceMovement([500, 600, 660]).changePct).toBe(10);
    expect(priceMovement([500, 600, 540]).changePct).toBe(-10);
  });

  it('la serie conserva el orden del más viejo al más nuevo', () => {
    expect(priceMovement([100, 200, 300]).history).toEqual([100, 200, 300]);
  });

  it('una anterior de 0 no sirve de base: variación 0', () => {
    expect(priceMovement([0, 500]).changePct).toBe(0);
  });

  it('se queda con las últimas cotizaciones cuando hay más del tope', () => {
    const prices = Array.from({ length: 45 }, (_, i) => 100 + i);
    const { history, changePct } = priceMovement(prices);

    expect(PRICE_HISTORY_POINTS).toBe(30);
    expect(history).toHaveLength(30);
    expect(history[0]).toBe(115);
    expect(history[29]).toBe(144);
    expect(changePct).toBe(0.7); // (144 − 143) / 143
  });

  it('la variación usa la fórmula del módulo de cotizaciones: un decimal', () => {
    expect(priceMovement([700, 724]).changePct).toBe(3.4);
  });
});

// research #8 — paginación y clave de caché del listado.
describe('listado', () => {
  describe('resolvePagination', () => {
    it('usa página 1 y 20 por página si no se piden', () => {
      expect(resolvePagination({})).toEqual({ page: DEFAULT_PAGE, limit: DEFAULT_LIMIT });
      expect(DEFAULT_PAGE).toBe(1);
      expect(DEFAULT_LIMIT).toBe(20);
    });

    it('respeta la página y el tamaño pedidos', () => {
      expect(resolvePagination({ page: 3, limit: 50 })).toEqual({ page: 3, limit: 50 });
    });
  });

  describe('pageMeta', () => {
    it('redondea hacia arriba las páginas totales', () => {
      expect(pageMeta(41, 2, 20)).toEqual({ total: 41, page: 2, limit: 20, totalPages: 3 });
    });

    it('sin resultados no hay páginas', () => {
      expect(pageMeta(0, 1, 20).totalPages).toBe(0);
    });
  });

  describe('playersListCacheKey', () => {
    it('vive dentro del espacio de la versión vigente', () => {
      expect(playersListCacheKey({}, 1, 20, 7)).toMatch(/^players:list:v7:/);
      expect(playersListCacheKey({}, 1, 20, 7)).not.toBe(playersListCacheKey({}, 1, 20, 8));
    });

    it('el orden de los valores repetidos no cambia la clave', () => {
      const a = playersListCacheKey({ position: [PlayerPosition.FW, PlayerPosition.MF] }, 1, 20, 0);
      const b = playersListCacheKey({ position: [PlayerPosition.MF, PlayerPosition.FW] }, 1, 20, 0);
      expect(a).toBe(b);
    });

    it('la búsqueda se normaliza: mayúsculas y espacios no generan otra entrada', () => {
      expect(playersListCacheKey({ search: '  Nicolas ' }, 1, 20, 0)).toBe(
        playersListCacheKey({ search: 'nicolas' }, 1, 20, 0),
      );
    });

    it('filtros, página o tamaño distintos generan claves distintas', () => {
      const base = playersListCacheKey({}, 1, 20, 0);
      expect(playersListCacheKey({ minOvr: 80 }, 1, 20, 0)).not.toBe(base);
      expect(playersListCacheKey({}, 2, 20, 0)).not.toBe(base);
      expect(playersListCacheKey({}, 1, 50, 0)).not.toBe(base);
    });
  });

  describe('filterLogFields', () => {
    it('registra la búsqueda solo como presencia, no su texto', () => {
      const fields = filterLogFields({ search: 'nicolas', rarity: ['epic'] });
      expect(fields.hasSearch).toBe(true);
      expect(fields.rarity).toEqual(['epic']);
      expect(Object.values(fields)).not.toContain('nicolas');
    });

    it('los filtros ausentes se registran como null', () => {
      expect(filterLogFields({})).toMatchObject({ league: null, minOvr: null, hasSearch: false });
    });
  });
});
