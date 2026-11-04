import { useCallback, useMemo, useRef, useState } from 'react';
import type { PriceHistoryFilters } from '../components/PriceHistoryModal';
import { extractApiErrorCode } from '../services/packs.service';
import { fetchAllQuotes, fetchQuoteAt, quoteAtErrorMessage, type ApiQuote, type QuoteAt } from '../services/quotes.service';
import { endOfLocalDay, startOfLocalDay, validateDay, validateRange } from './date-filter';

export interface DateRange {
  from: string;
  to: string;
}

/** Resultado de buscar la cotización de un día (FR-028 a FR-030). */
export interface DaySearch {
  day: string;
  loading: boolean;
  error: string | null;
  result: QuoteAt | null;
}

export interface PriceHistoryState {
  open: boolean;
  playerId: string | null;
  playerName: string;
  /** Las cotizaciones visibles (dentro del rango aplicado), del más viejo al más nuevo. */
  quotes: ApiQuote[];
  /** Cuántas cotizaciones tiene el jugador en total, con o sin filtro. */
  totalQuotes: number;
  loading: boolean;
  error: string | null;
  /** Índices dentro de `quotes`. */
  selectedIndex: number | null;
  highlightIndex: number | null;
  range: DateRange;
  rangeError: string | null;
  /** El rango aplicado no contiene ninguna cotización (FR-032). */
  rangeEmpty: boolean;
  /** La cotización vigente al comienzo de un rango vacío, si existe. */
  rangeStart: QuoteAt | null;
  day: DaySearch | null;
}

interface Internal {
  open: boolean;
  playerId: string | null;
  playerName: string;
  all: ApiQuote[];
  loading: boolean;
  error: string | null;
  selectedAt: string | null;
  /** La cotización vigente en el instante de una operación, para resaltarla (US4-4). */
  operationAt: string | null;
  range: DateRange;
  rangeError: string | null;
  rangeStart: QuoteAt | null;
  day: DaySearch | null;
}

const NO_RANGE: DateRange = { from: '', to: '' };

const CLOSED: Internal = {
  open: false,
  playerId: null,
  playerName: '',
  all: [],
  loading: false,
  error: null,
  selectedAt: null,
  operationAt: null,
  range: NO_RANGE,
  rangeError: null,
  rangeStart: null,
  day: null,
};

export const LOAD_ERROR = 'No se pudieron cargar las cotizaciones. Intentá de nuevo.';

/** Las cotizaciones dentro del rango, ambos extremos inclusive y tomando los días completos. */
function withinRange(all: ApiQuote[], range: DateRange): ApiQuote[] {
  const from = range.from ? new Date(startOfLocalDay(range.from)).getTime() : -Infinity;
  const to = range.to ? new Date(endOfLocalDay(range.to)).getTime() : Infinity;
  return all.filter((q) => {
    const time = new Date(q.calculatedAt).getTime();
    return time >= from && time <= to;
  });
}

const indexOfQuote = (quotes: ApiQuote[], calculatedAt: string | null) =>
  calculatedAt === null ? -1 : quotes.findIndex((q) => q.calculatedAt === calculatedAt);

/**
 * Pedidos y estado del modal de cotizaciones (10-historial-operaciones US2, US3 y US4). Lo usan la
 * home y «Mi perfil»; el modal en sí es presentacional.
 *
 * - Carga la serie completa una vez; el rango «desde–hasta» filtra en memoria, sin ir a la red.
 * - Buscar un día pide la cotización vigente al final de ese día (zona del navegador).
 * - Una respuesta de un jugador anterior, o de un modal ya cerrado, no pisa el estado actual.
 */
export function usePriceHistory() {
  const [internal, setInternal] = useState<Internal>(CLOSED);
  const loadId = useRef(0);
  const dayId = useRef(0);
  const rangeId = useRef(0);

  const load = useCallback(async (playerId: string, highlightAt: string | null) => {
    const current = ++loadId.current;
    setInternal((s) => ({ ...s, loading: true, error: null }));
    try {
      const all = await fetchAllQuotes(playerId);
      if (current !== loadId.current) return;

      // US4-4: resaltar la cotización vigente en el instante de la operación, si hay una.
      let operationAt: string | null = null;
      if (highlightAt && all.length > 0) {
        try {
          const found = await fetchQuoteAt(playerId, highlightAt);
          if (current !== loadId.current) return;
          operationAt = found.quote?.calculatedAt ?? null;
        } catch {
          // Sin el resaltado el gráfico se muestra igual.
          if (current !== loadId.current) return;
        }
      }

      const selectedAt = operationAt ?? (all.length > 0 ? all[all.length - 1].calculatedAt : null);
      setInternal((s) => ({ ...s, all, loading: false, selectedAt, operationAt }));
    } catch {
      if (current !== loadId.current) return;
      setInternal((s) => ({ ...s, loading: false, error: LOAD_ERROR }));
    }
  }, []);

  const openFor = useCallback(
    (playerId: string, playerName: string, highlightAt?: string) => {
      dayId.current++;
      rangeId.current++;
      setInternal({ ...CLOSED, open: true, playerId, playerName, loading: true });
      void load(playerId, highlightAt ?? null);
    },
    [load],
  );

  const close = useCallback(() => {
    loadId.current++;
    dayId.current++;
    rangeId.current++;
    setInternal(CLOSED);
  }, []);

  const retry = useCallback(() => {
    if (internal.playerId) void load(internal.playerId, internal.operationAt);
  }, [load, internal.playerId, internal.operationAt]);

  const select = useCallback((index: number) => {
    setInternal((s) => {
      const visible = withinRange(s.all, s.range);
      return visible[index] ? { ...s, selectedAt: visible[index].calculatedAt } : s;
    });
  }, []);

  const clearRange = useCallback(() => {
    rangeId.current++;
    setInternal((s) => {
      const selectedAt = s.selectedAt ?? (s.all.length > 0 ? s.all[s.all.length - 1].calculatedAt : null);
      return { ...s, range: NO_RANGE, rangeError: null, rangeStart: null, selectedAt };
    });
  }, []);

  const applyRange = useCallback(
    (from: string, to: string) => {
      const message = validateRange(from, to);
      if (message) {
        // Un rango inválido no consulta ni cambia lo que se veía (US3-7).
        setInternal((s) => ({ ...s, rangeError: message }));
        return;
      }
      if (!from && !to) {
        clearRange();
        return;
      }

      const current = ++rangeId.current;
      const range = { from, to };
      setInternal((s) => {
        const visible = withinRange(s.all, range);
        const keep = indexOfQuote(visible, s.selectedAt) >= 0;
        const selectedAt = keep ? s.selectedAt : (visible.at(-1)?.calculatedAt ?? null);
        return { ...s, range, rangeError: null, rangeStart: null, selectedAt };
      });

      // Un rango sin cotizaciones informa cuál regía al comienzo (FR-032).
      const playerId = internal.playerId;
      if (playerId && from && withinRange(internal.all, range).length === 0) {
        fetchQuoteAt(playerId, startOfLocalDay(from))
          .then((found) => {
            if (current === rangeId.current) setInternal((s) => ({ ...s, rangeStart: found }));
          })
          .catch(() => {
            if (current === rangeId.current) setInternal((s) => ({ ...s, rangeStart: null }));
          });
      }
    },
    [clearRange, internal.all, internal.playerId],
  );

  const searchDay = useCallback(
    (day: string) => {
      const message = validateDay(day);
      if (message) {
        setInternal((s) => ({ ...s, day: { day, loading: false, error: message, result: null } }));
        return;
      }
      const playerId = internal.playerId;
      if (!playerId) return;

      const current = ++dayId.current;
      setInternal((s) => ({ ...s, day: { day, loading: true, error: null, result: null } }));
      fetchQuoteAt(playerId, endOfLocalDay(day))
        .then((result) => {
          if (current !== dayId.current) return;
          setInternal((s) => {
            const found = result.quote?.calculatedAt ?? null;
            // Si el filtro de rango deja afuera la cotización encontrada, se quita para poder verla.
            const hidden = found !== null && indexOfQuote(withinRange(s.all, s.range), found) < 0;
            return {
              ...s,
              day: { day, loading: false, error: null, result },
              selectedAt: found ?? s.selectedAt,
              ...(hidden ? { range: NO_RANGE, rangeError: null, rangeStart: null } : {}),
            };
          });
        })
        .catch((err: unknown) => {
          if (current !== dayId.current) return;
          setInternal((s) => ({
            ...s,
            day: { day, loading: false, error: quoteAtErrorMessage(extractApiErrorCode(err)), result: null },
          }));
        });
    },
    [internal.playerId],
  );

  const clearDay = useCallback(() => {
    dayId.current++;
    setInternal((s) => ({ ...s, day: null }));
  }, []);

  const state = useMemo<PriceHistoryState>(() => {
    const quotes = withinRange(internal.all, internal.range);
    const active = internal.range.from !== '' || internal.range.to !== '';
    const highlightAt = internal.day?.result?.quote?.calculatedAt ?? internal.operationAt;
    const selected = indexOfQuote(quotes, internal.selectedAt);
    const highlighted = indexOfQuote(quotes, highlightAt);
    return {
      open: internal.open,
      playerId: internal.playerId,
      playerName: internal.playerName,
      quotes,
      totalQuotes: internal.all.length,
      loading: internal.loading,
      error: internal.error,
      selectedIndex: selected >= 0 ? selected : null,
      highlightIndex: highlighted >= 0 ? highlighted : null,
      range: internal.range,
      rangeError: internal.rangeError,
      rangeEmpty: active && internal.all.length > 0 && quotes.length === 0,
      rangeStart: internal.rangeStart,
      day: internal.day,
    };
  }, [internal]);

  /** Lo que el modal necesita para el filtro de fechas. */
  const filters = useMemo<PriceHistoryFilters>(
    () => ({
      totalQuotes: state.totalQuotes,
      rangeError: state.rangeError,
      rangeEmpty: state.rangeEmpty,
      rangeStart: state.rangeStart,
      day: state.day,
      onApplyRange: applyRange,
      onClearRange: clearRange,
      onSearchDay: searchDay,
      onClearDay: clearDay,
    }),
    [state, applyRange, clearRange, searchDay, clearDay],
  );

  return { state, filters, openFor, close, select, retry, applyRange, clearRange, searchDay, clearDay };
}
