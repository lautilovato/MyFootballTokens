import { useEffect, useRef, useState } from 'react';
import { todayLocal } from '../pages/date-filter';
import type { ApiQuote, QuoteAt, QuoteOrigin } from '../services/quotes.service';
import { strategyLabel } from '../services/quote.mapper';
import { QuoteChart } from './QuoteChart';

/** Filtro de fechas del gráfico (10-historial-operaciones US3, FR-027 a FR-033). */
export interface PriceHistoryFilters {
  /** Cuántas cotizaciones tiene el jugador en total, con o sin rango aplicado. */
  totalQuotes: number;
  rangeError: string | null;
  /** El rango aplicado no contiene ninguna cotización (FR-032). */
  rangeEmpty: boolean;
  /** La cotización vigente al comienzo de un rango vacío, si existe. */
  rangeStart: QuoteAt | null;
  day: { day: string; loading: boolean; error: string | null; result: QuoteAt | null } | null;
  onApplyRange: (from: string, to: string) => void;
  onClearRange: () => void;
  onSearchDay: (day: string) => void;
  onClearDay: () => void;
}

interface PriceHistoryModalProps {
  open: boolean;
  playerName: string;
  /** Las cotizaciones visibles, del más viejo al más nuevo. */
  quotes: ApiQuote[];
  loading: boolean;
  error: string | null;
  selectedIndex: number | null;
  /** Cotización a resaltar en el gráfico, por ejemplo la vigente en una operación o en una fecha. */
  highlightIndex: number | null;
  onSelect: (index: number) => void;
  onRetry: () => void;
  onClose: () => void;
  /** Sin este grupo el modal no ofrece el filtro de fechas. */
  filters?: PriceHistoryFilters;
}

const ORIGIN_LABEL: Record<QuoteOrigin, string> = { AUTOMATIC: 'Automática', MANUAL: 'Manual' };

const formatCredits = (value: number) => `${value.toLocaleString('es-AR')} créditos`;
const formatDateTime = (iso: string) => new Date(iso).toLocaleString('es-AR');
const formatDate = (iso: string) => new Date(iso).toLocaleDateString('es-AR');

/** Un `YYYY-MM-DD` como día/mes/año, sin pasar por una zona horaria. */
const formatDay = (day: string) => day.split('-').reverse().join('/');

/** Detalle de una cotización: precio, score, fecha y hora, origen y estrategia con versión (FR-022). */
export function QuoteDetail({ quote, title = 'Cotización elegida' }: { quote: ApiQuote; title?: string }) {
  return (
    <section aria-label={title} className="rounded border border-white/10 bg-navy-deep/40 p-3">
      <h3 className="title-display mb-2 text-sm text-slate-300">{title}</h3>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
        <dt className="text-slate-400">Precio</dt>
        <dd className="text-right text-slate-100 sm:text-left">{formatCredits(quote.price)}</dd>
        <dt className="text-slate-400">Puntaje</dt>
        <dd className="text-right text-slate-100 sm:text-left">{quote.score.toLocaleString('es-AR', { maximumFractionDigits: 4 })}</dd>
        <dt className="text-slate-400">Calculada</dt>
        <dd className="text-right text-slate-100 sm:text-left">{formatDateTime(quote.calculatedAt)}</dd>
        <dt className="text-slate-400">Origen</dt>
        <dd className="text-right text-slate-100 sm:text-left">{ORIGIN_LABEL[quote.origin] ?? quote.origin}</dd>
        <dt className="text-slate-400">Estrategia</dt>
        <dd className="text-right font-semibold text-neon-blue sm:text-left">{strategyLabel(quote.strategy)}</dd>
      </dl>
    </section>
  );
}

const inputClass = 'rounded border border-white/15 bg-navy-deep px-2 py-1 text-sm text-slate-100';
const smallButton = 'bevel bg-navy-deep px-3 py-1 text-sm text-slate-200 disabled:opacity-40';

/** Resultado de buscar un día: la cotización vigente, o el aviso de que todavía no había (US3-1 a US3-3). */
function DayResult({ search, onClear }: { search: NonNullable<PriceHistoryFilters['day']>; onClear: () => void }) {
  const { day, loading, error, result } = search;
  return (
    <div className="mt-3 space-y-2" aria-live="polite">
      {loading && <p className="text-sm text-slate-400">Buscando la cotización del {formatDay(day)}…</p>}
      {error && (
        <p role="alert" className="text-sm text-error-red">
          {error}
        </p>
      )}
      {result && !result.quoted && (
        <p className="text-sm text-slate-300">
          No había cotización al {formatDay(day)}.{' '}
          {result.firstQuotedAt
            ? `La primera se calculó el ${formatDate(result.firstQuotedAt)}.`
            : 'El jugador todavía no tiene cotizaciones.'}
        </p>
      )}
      {result?.quote && (
        <>
          <QuoteDetail quote={result.quote} title={`Cotización vigente el ${formatDay(day)}`} />
          <p className="text-xs text-slate-400">
            {todayLocal(new Date(result.quote.calculatedAt)) === day
              ? 'Se calculó ese mismo día.'
              : `Es la última cotización calculada hasta ese día (se calculó el ${formatDate(result.quote.calculatedAt)}), no una calculada ese día.`}
          </p>
        </>
      )}
      {(result || error) && (
        <button type="button" onClick={onClear} className={smallButton}>
          Quitar búsqueda
        </button>
      )}
    </div>
  );
}

/** Filtro de fechas: acota el gráfico a un rango y busca la cotización vigente de un día. */
function DateFilters({ filters, quotes }: { filters: PriceHistoryFilters; quotes: ApiQuote[] }) {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [day, setDay] = useState('');
  const max = todayLocal();
  const { rangeStart } = filters;

  return (
    <section aria-label="Filtro de fechas" className="rounded border border-white/10 p-3">
      <h3 className="title-display mb-2 text-sm text-slate-300">Buscar por fecha</h3>

      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs text-slate-400">
          Desde
          <input type="date" value={from} max={max} onChange={(e) => setFrom(e.target.value)} className={`${inputClass} mt-1 block`} />
        </label>
        <label className="text-xs text-slate-400">
          Hasta
          <input type="date" value={to} max={max} onChange={(e) => setTo(e.target.value)} className={`${inputClass} mt-1 block`} />
        </label>
        <button type="button" onClick={() => filters.onApplyRange(from, to)} className={smallButton}>
          Aplicar
        </button>
        <button
          type="button"
          onClick={() => {
            setFrom('');
            setTo('');
            filters.onClearRange();
          }}
          className={smallButton}
        >
          Limpiar
        </button>
      </div>
      {filters.rangeError && (
        <p role="alert" className="mt-2 text-sm text-error-red">
          {filters.rangeError}
        </p>
      )}
      {filters.rangeEmpty && (
        <p className="mt-2 text-sm text-slate-300">
          No hay cotizaciones en ese rango.{' '}
          {rangeStart?.quote
            ? `La vigente al comienzo era de ${formatCredits(rangeStart.quote.price)} (${strategyLabel(rangeStart.quote.strategy)}), calculada el ${formatDate(rangeStart.quote.calculatedAt)}.`
            : rangeStart && !rangeStart.quoted
              ? 'El jugador todavía no tenía cotización al comienzo del rango.'
              : ''}
        </p>
      )}
      {!filters.rangeEmpty && filters.totalQuotes > quotes.length && (
        <p className="mt-2 text-xs text-slate-500">
          Mostrando {quotes.length} de {filters.totalQuotes} cotizaciones.
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-end gap-3 border-t border-white/10 pt-3">
        <label className="text-xs text-slate-400">
          Ver cotización del día
          <input type="date" value={day} max={max} onChange={(e) => setDay(e.target.value)} className={`${inputClass} mt-1 block`} />
        </label>
        <button type="button" onClick={() => filters.onSearchDay(day)} className={smallButton}>
          Buscar
        </button>
      </div>
      {filters.day && (
        <DayResult
          search={filters.day}
          onClear={() => {
            setDay('');
            filters.onClearDay();
          }}
        />
      )}
    </section>
  );
}

/**
 * Gráfico completo de cotizaciones de un jugador (10-historial-operaciones US2 y US3, FR-021 a
 * FR-033).
 *
 * Es un `<dialog>` nativo: el navegador atrapa el foco, deja inerte el resto de la página y cierra
 * con Escape. Es controlado: el padre decide `open`. Presentacional, sin red.
 */
export function PriceHistoryModal({
  open,
  playerName,
  quotes,
  loading,
  error,
  selectedIndex,
  highlightIndex,
  onSelect,
  onRetry,
  onClose,
  filters,
}: PriceHistoryModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const totalQuotes = filters?.totalQuotes ?? quotes.length;
  const selected = selectedIndex !== null ? quotes[selectedIndex] : undefined;
  const newestFirst = quotes.map((quote, index) => ({ quote, index })).reverse();
  const hasData = !loading && !error && totalQuotes > 0;

  return (
    <dialog
      ref={dialogRef}
      aria-label={`Cotizaciones de ${playerName}`}
      className="m-auto w-[min(48rem,calc(100vw-1.5rem))] max-w-none rounded-lg border border-white/10 bg-navy-card p-0 text-slate-200 shadow-2xl backdrop:bg-black/70"
      // Escape: se cierra desde el estado del padre, no por la libre del navegador.
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      // El fondo es el propio <dialog>: un clic que cae sobre él, y no sobre el contenido, cierra.
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="max-h-[calc(100vh-3rem)] overflow-y-auto p-5">
        <header className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="title-display text-lg text-slate-100">Cotizaciones de {playerName}</h2>
            {totalQuotes > 0 && <p className="text-xs text-slate-500">{totalQuotes} en total</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            autoFocus
            className="bevel bg-navy-deep px-3 py-1 text-sm text-slate-200"
          >
            Cerrar
          </button>
        </header>

        {loading && <p className="py-10 text-center text-slate-400">Cargando cotizaciones…</p>}

        {error && !loading && (
          <div className="py-10 text-center">
            <p role="alert" className="text-error-red">
              {error}
            </p>
            <button type="button" onClick={onRetry} className="bevel mt-3 bg-navy-deep px-4 py-2 text-sm">
              Reintentar
            </button>
          </div>
        )}

        {!loading && !error && totalQuotes === 0 && (
          <p className="py-10 text-center text-slate-400">Este jugador todavía no tiene cotizaciones.</p>
        )}

        {hasData && (
          <div className="space-y-4">
            {totalQuotes === 1 && (
              <p className="text-sm text-slate-400">Hay una sola cotización: todavía no hay historial para comparar.</p>
            )}

            {filters && <DateFilters filters={filters} quotes={quotes} />}

            {quotes.length > 0 && (
              <>
                <QuoteChart
                  quotes={quotes}
                  playerName={playerName}
                  selectedIndex={selectedIndex}
                  highlightIndex={highlightIndex}
                  onSelect={onSelect}
                />

                {selected && <QuoteDetail quote={selected} />}

                {/* Alternativa en texto del gráfico (FR-024): toda cotización, con su estrategia. */}
                <div className="max-h-56 overflow-y-auto rounded border border-white/10">
                  <table className="w-full text-left text-sm">
                    <caption className="sr-only">Lista de cotizaciones de {playerName}, de la más reciente a la más antigua</caption>
                    <thead className="sticky top-0 bg-navy-card text-xs text-slate-400">
                      <tr>
                        <th scope="col" className="px-3 py-2">Fecha</th>
                        <th scope="col" className="px-3 py-2">Precio</th>
                        <th scope="col" className="px-3 py-2">Estrategia</th>
                      </tr>
                    </thead>
                    <tbody>
                      {newestFirst.map(({ quote, index }) => (
                        <tr key={quote.calculatedAt} className={index === selectedIndex ? 'bg-neon-blue/10' : undefined}>
                          <td className="px-3 py-1">
                            <button
                              type="button"
                              onClick={() => onSelect(index)}
                              aria-current={index === selectedIndex ? 'true' : undefined}
                              className="text-left text-slate-200 underline-offset-2 hover:underline"
                            >
                              {formatDateTime(quote.calculatedAt)}
                            </button>
                          </td>
                          <td className="px-3 py-1 text-slate-100">{formatCredits(quote.price)}</td>
                          <td className="px-3 py-1 text-slate-300">{strategyLabel(quote.strategy)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </dialog>
  );
}
