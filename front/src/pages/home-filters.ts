import {
  POSITIONS,
  RARITIES,
  type PlayerFilters,
  type Position,
  type Rarity,
} from '../services/players.service';

/**
 * Traducción entre los filtros de la home y la query string (research #10).
 *
 * Los filtros viven en la URL y no en estado local: así una búsqueda filtrada se puede
 * compartir y recargar, el botón "atrás" se comporta como la persona espera, y cerrar el
 * panel de detalle devuelve la grilla con sus filtros y su página intactos (FR-022) sin
 * tener que preservar nada a mano.
 *
 * Función pura: se testea sin montar ningún componente.
 */

/** Clave de la URL que guarda el jugador abierto en el panel lateral. */
export const SELECTED_PARAM = 'player';

function readNumber(params: URLSearchParams, key: string): number | undefined {
  const raw = params.get(key);
  if (raw === null || raw.trim() === '') return undefined;
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
}

function readEnum<T extends string>(params: URLSearchParams, key: string, allowed: T[]): T[] | undefined {
  // Un valor inventado en la URL se descarta acá en vez de viajar al backend y volver 400.
  const values = params.getAll(key).filter((v): v is T => (allowed as string[]).includes(v));
  return values.length > 0 ? values : undefined;
}

export function filtersFromParams(params: URLSearchParams): PlayerFilters {
  const league = params.getAll('league').filter(Boolean);

  return {
    ...(league.length > 0 ? { league } : {}),
    ...(readEnum<Position>(params, 'position', POSITIONS) ? { position: readEnum<Position>(params, 'position', POSITIONS) } : {}),
    ...(readEnum<Rarity>(params, 'rarity', RARITIES) ? { rarity: readEnum<Rarity>(params, 'rarity', RARITIES) } : {}),
    minValue: readNumber(params, 'minValue'),
    maxValue: readNumber(params, 'maxValue'),
    minOvr: readNumber(params, 'minOvr'),
    maxOvr: readNumber(params, 'maxOvr'),
    search: params.get('search') || undefined,
    page: readNumber(params, 'page') ?? 1,
  };
}

export function paramsFromFilters(
  filters: PlayerFilters,
  selectedId?: string | null,
): URLSearchParams {
  const params = new URLSearchParams();

  for (const value of filters.league ?? []) params.append('league', value);
  for (const value of filters.position ?? []) params.append('position', value);
  for (const value of filters.rarity ?? []) params.append('rarity', value);

  const appendOne = (key: string, value?: number | string) => {
    if (value !== undefined && value !== '') params.append(key, String(value));
  };

  appendOne('minValue', filters.minValue);
  appendOne('maxValue', filters.maxValue);
  appendOne('minOvr', filters.minOvr);
  appendOne('maxOvr', filters.maxOvr);
  appendOne('search', filters.search);
  // La página 1 no se escribe: es el valor por defecto y ensuciaría la URL.
  if (filters.page && filters.page > 1) appendOne('page', filters.page);
  if (selectedId) params.append(SELECTED_PARAM, selectedId);

  return params;
}

/** Los dos filtros son el mismo conjunto, ignorando la página y el orden de los arreglos. */
export function sameFilters(a: PlayerFilters, b: PlayerFilters): boolean {
  const normalize = (f: PlayerFilters) =>
    JSON.stringify({
      league: [...(f.league ?? [])].sort(),
      position: [...(f.position ?? [])].sort(),
      rarity: [...(f.rarity ?? [])].sort(),
      minValue: f.minValue ?? null,
      maxValue: f.maxValue ?? null,
      minOvr: f.minOvr ?? null,
      maxOvr: f.maxOvr ?? null,
      search: f.search ?? null,
    });
  return normalize(a) === normalize(b);
}

/**
 * Cambiar un filtro devuelve el listado a la primera página (US2 §7): quedarse en la página 7
 * de un conjunto que ahora tiene 2 páginas mostraría un resultado vacío sin explicación.
 */
export function nextFilters(current: PlayerFilters, incoming: PlayerFilters): PlayerFilters {
  return sameFilters(current, incoming) ? incoming : { ...incoming, page: 1 };
}
