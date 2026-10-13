import { RARITY_THRESHOLDS, Rarity, rarityFromOvr, reputationRangesForRarities } from './rarity';

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
