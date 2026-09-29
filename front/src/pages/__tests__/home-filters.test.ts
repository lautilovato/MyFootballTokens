import { describe, expect, it } from 'vitest';
import {
  SELECTED_PARAM,
  filtersFromParams,
  nextFilters,
  paramsFromFilters,
  sameFilters,
} from '../home-filters';
import { buildPlayerQueryParams } from '../../services/players.service';

/** T033 / research #10 — los filtros viven en la URL, no en estado local. */
describe('home-filters', () => {
  describe('filtersFromParams', () => {
    it('lee los filtros de valores múltiples repetidos', () => {
      const params = new URLSearchParams(
        'league=Premier+League&league=La+Liga&position=FW&position=MF&rarity=legendary',
      );
      const filters = filtersFromParams(params);

      expect(filters.league).toEqual(['Premier League', 'La Liga']);
      expect(filters.position).toEqual(['FW', 'MF']);
      expect(filters.rarity).toEqual(['legendary']);
    });

    it('lee los rangos y la búsqueda', () => {
      const filters = filtersFromParams(
        new URLSearchParams('minOvr=70&maxOvr=99&minValue=100&maxValue=9000&search=nicolas'),
      );

      expect(filters).toMatchObject({
        minOvr: 70,
        maxOvr: 99,
        minValue: 100,
        maxValue: 9000,
        search: 'nicolas',
      });
    });

    it('descarta valores inventados en vez de mandarlos al backend', () => {
      // Un enum falso en la URL provocaría un 400: se filtra acá.
      const filters = filtersFromParams(new URLSearchParams('position=XX&rarity=mythic'));
      expect(filters.position).toBeUndefined();
      expect(filters.rarity).toBeUndefined();
    });

    it('sin parámetros arranca en la página 1 y sin filtros', () => {
      const filters = filtersFromParams(new URLSearchParams());
      expect(filters.page).toBe(1);
      expect(filters.league).toBeUndefined();
      expect(filters.search).toBeUndefined();
    });
  });

  describe('paramsFromFilters', () => {
    it('serializa los valores múltiples como clave repetida', () => {
      const params = paramsFromFilters({ league: ['Premier League', 'La Liga'], position: ['FW'] });
      expect(params.getAll('league')).toEqual(['Premier League', 'La Liga']);
      expect(params.getAll('position')).toEqual(['FW']);
    });

    it('no escribe la página 1 para no ensuciar la URL', () => {
      expect(paramsFromFilters({ page: 1 }).has('page')).toBe(false);
      expect(paramsFromFilters({ page: 3 }).get('page')).toBe('3');
    });

    it('incluye el jugador seleccionado cuando el panel está abierto', () => {
      const params = paramsFromFilters({ page: 1 }, 'abc-123');
      expect(params.get(SELECTED_PARAM)).toBe('abc-123');
      expect(paramsFromFilters({ page: 1 }, null).has(SELECTED_PARAM)).toBe(false);
    });

    it('ida y vuelta conserva los filtros', () => {
      const original = {
        league: ['Premier League'],
        position: ['FW' as const],
        rarity: ['epic' as const],
        minOvr: 70,
        maxOvr: 90,
        minValue: 100,
        maxValue: 5000,
        search: 'haaland',
        page: 2,
      };
      expect(filtersFromParams(paramsFromFilters(original))).toEqual(original);
    });
  });

  describe('nextFilters', () => {
    it('vuelve a la página 1 al cambiar un filtro (US2 §7)', () => {
      const current = { league: ['Premier League'], page: 7 };
      const result = nextFilters(current, { league: ['La Liga'], page: 7 });
      expect(result.page).toBe(1);
    });

    it('respeta la página cuando solo cambia la paginación', () => {
      const current = { league: ['Premier League'], page: 1 };
      const result = nextFilters(current, { league: ['Premier League'], page: 3 });
      expect(result.page).toBe(3);
    });

    it('agregar un filtro nuevo también reinicia la página', () => {
      const result = nextFilters({ page: 5 }, { minOvr: 80, page: 5 });
      expect(result.page).toBe(1);
    });
  });

  describe('sameFilters', () => {
    it('ignora el orden de los arreglos y la página', () => {
      expect(
        sameFilters({ league: ['a', 'b'], page: 1 }, { league: ['b', 'a'], page: 9 }),
      ).toBe(true);
    });

    it('distingue conjuntos distintos', () => {
      expect(sameFilters({ minOvr: 70 }, { minOvr: 80 })).toBe(false);
      expect(sameFilters({ search: 'a' }, {})).toBe(false);
    });
  });

  describe('serialización hacia el backend', () => {
    it('manda los valores múltiples repitiendo la clave, como espera la API', () => {
      const params = buildPlayerQueryParams({ rarity: ['legendary', 'rare'], minOvr: 70 });
      expect(params.getAll('rarity')).toEqual(['legendary', 'rare']);
      expect(params.get('minOvr')).toBe('70');
      // Sin sufijo `[]`: el backend espera ?rarity=a&rarity=b
      expect(params.toString()).toContain('rarity=legendary&rarity=rare');
    });

    it('omite los filtros sin valor', () => {
      const params = buildPlayerQueryParams({ search: '' });
      expect(params.has('search')).toBe(false);
    });
  });
});
