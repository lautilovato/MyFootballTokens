import { describe, expect, it } from 'vitest';
import type { StrategyVersion } from '../../services/valuation-strategies.service';
import { parseDraft, toDraft } from '../strategy-draft';

const VERSION: StrategyVersion = {
  version: 1,
  createdAt: '2026-10-13T00:00:00.000Z',
  weights: { general: { goals: 0.25, absence: -0.1 }, byPosition: { GK: { rating: 0.9 } } },
  baseValue: 100,
  scaleFactor: 900,
  minPrice: 10,
  defaultReputation: 20,
};

/** 16-config-estrategia — el formulario de una versión. */
describe('strategy-draft', () => {
  it('una versión sin cambios vuelve igual', () => {
    expect(parseDraft(toDraft(VERSION))).toEqual({
      config: {
        weights: VERSION.weights,
        baseValue: 100,
        scaleFactor: 900,
        minPrice: 10,
        defaultReputation: 20,
      },
    });
  });

  it('un peso vacío o en cero es una métrica ausente', () => {
    const draft = toDraft(VERSION);
    draft.profiles.general.goals = '';
    draft.profiles.general.absence = '0';
    draft.profiles.general.rating = '0.5';

    const parsed = parseDraft(draft);
    expect('config' in parsed && parsed.config.weights.general).toEqual({ rating: 0.5 });
  });

  it('una posición sin pesos no se envía: usa los generales', () => {
    const draft = toDraft(VERSION);
    draft.profiles.GK.rating = '';

    const parsed = parseDraft(draft);
    expect('config' in parsed && parsed.config.weights.byPosition).toBeUndefined();
  });

  it('rechaza un peso que no es un número y valores no enteros', () => {
    const weight = toDraft(VERSION);
    weight.profiles.DF.goals = 'mucho';
    expect(parseDraft(weight)).toEqual({ error: 'Los pesos tienen que ser números.' });

    for (const value of ['', '1.5']) {
      expect('error' in parseDraft({ ...toDraft(VERSION), minPrice: value })).toBe(true);
    }
  });
});
