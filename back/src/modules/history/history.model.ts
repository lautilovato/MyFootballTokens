/**
 * Tipos de entrada del historial y su filtro (10-historial-operaciones FR-004, FR-009).
 *
 * Utilidad pura, sin framework ni base de datos (constitución §7): se prueba sin levantar nada.
 */

/** `sobre` y `compra` son cartas adquiridas; `venta` es una carta vendida. */
export type HistoryKind = 'sobre' | 'compra' | 'venta';

export const HISTORY_TYPES = ['all', 'acquired', 'sold'] as const;

export type HistoryType = (typeof HISTORY_TYPES)[number];

const KINDS_BY_TYPE: Record<HistoryType, readonly HistoryKind[]> = {
  all: ['sobre', 'compra', 'venta'],
  acquired: ['sobre', 'compra'],
  sold: ['venta'],
};

/** Qué tipos de entrada incluye cada filtro. Un valor desconocido es un error de programación. */
export function kindsFor(type: HistoryType): readonly HistoryKind[] {
  const kinds = KINDS_BY_TYPE[type];
  if (!kinds) throw new Error(`filtro de historial desconocido: ${String(type)}`);
  return kinds;
}
