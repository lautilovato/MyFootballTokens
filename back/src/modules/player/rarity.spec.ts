import { RARITY_THRESHOLDS, Rarity, ratingRangesForRarities, rarityFromOvr } from './rarity';

// data-model.md §2.2 y §2.3 — cortes de rareza y su traducción a rangos de rating.
describe('rarity', () => {
  describe('rarityFromOvr', () => {
    it('clasifica según los cortes definidos', () => {
      expect(rarityFromOvr(95)).toBe<Rarity>('legendary');
      expect(rarityFromOvr(80)).toBe<Rarity>('epic');
      expect(rarityFromOvr(73)).toBe<Rarity>('rare');
      expect(rarityFromOvr(50)).toBe<Rarity>('common');
    });

    it('respeta los bordes exactos de cada corte', () => {
      expect(rarityFromOvr(85)).toBe<Rarity>('legendary');
      expect(rarityFromOvr(84)).toBe<Rarity>('epic');
      expect(rarityFromOvr(77)).toBe<Rarity>('epic');
      expect(rarityFromOvr(76)).toBe<Rarity>('rare');
      expect(rarityFromOvr(70)).toBe<Rarity>('rare');
      expect(rarityFromOvr(69)).toBe<Rarity>('common');
    });

    it('clasifica como common al jugador sin OVR (FR-030)', () => {
      expect(rarityFromOvr(null)).toBe<Rarity>('common');
    });

    it('los umbrales coinciden con los de la spec', () => {
      expect(RARITY_THRESHOLDS.legendary).toBe(85);
      expect(RARITY_THRESHOLDS.epic).toBe(77);
      expect(RARITY_THRESHOLDS.rare).toBe(70);
    });
  });

  describe('ratingRangesForRarities', () => {
    it('traduce cada rareza a su rango de rating', () => {
      expect(ratingRangesForRarities(['legendary'])).toEqual([
        { min: 8.5, max: null, includeNull: false },
      ]);
      expect(ratingRangesForRarities(['epic'])).toEqual([
        { min: 7.7, max: 8.5, includeNull: false },
      ]);
      expect(ratingRangesForRarities(['rare'])).toEqual([
        { min: 7.0, max: 7.7, includeNull: false },
      ]);
    });

    it('common incluye a los jugadores sin estadísticas', () => {
      expect(ratingRangesForRarities(['common'])).toEqual([
        { min: null, max: 7.0, includeNull: true },
      ]);
    });

    it('varias rarezas producen varios rangos, para unirlos con OR', () => {
      const ranges = ratingRangesForRarities(['legendary', 'rare']);
      expect(ranges).toHaveLength(2);
      expect(ranges).toContainEqual({ min: 8.5, max: null, includeNull: false });
      expect(ranges).toContainEqual({ min: 7.0, max: 7.7, includeNull: false });
    });

    it('sin rarezas no impone ningún rango', () => {
      expect(ratingRangesForRarities([])).toEqual([]);
      expect(ratingRangesForRarities(undefined)).toEqual([]);
    });

    it('las cuatro rarezas juntas cubren todo el espacio sin solaparse', () => {
      const ranges = ratingRangesForRarities(['legendary', 'epic', 'rare', 'common']);
      expect(ranges).toHaveLength(4);
      expect(ranges.some((r) => r.includeNull)).toBe(true);
      // Los cortes encadenan: el máximo de uno es el mínimo del siguiente.
      const sorted = [...ranges].sort((a, b) => (a.min ?? -Infinity) - (b.min ?? -Infinity));
      expect(sorted[0].max).toBe(sorted[1].min);
      expect(sorted[1].max).toBe(sorted[2].min);
      expect(sorted[2].max).toBe(sorted[3].min);
    });
  });
});
