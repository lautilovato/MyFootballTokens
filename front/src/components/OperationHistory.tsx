import { Link } from 'react-router-dom';
import type { HistoryFilter, OperationEntry, OperationKind, OperationsPage, PackTypeKey } from '../services/history.service';
import { strategyLabel } from '../services/quote.mapper';

interface OperationHistoryProps {
  entries: OperationEntry[];
  meta: OperationsPage['meta'] | null;
  filter: HistoryFilter;
  loading: boolean;
  /** Mensaje de error de la carga; nulo si no falló. */
  error: string | null;
  onFilterChange: (filter: HistoryFilter) => void;
  onPageChange: (page: number) => void;
  onRetry: () => void;
  /** Abre el gráfico de cotizaciones del jugador de la entrada, en el instante de la operación. */
  onViewPlayer?: (entry: OperationEntry) => void;
}

const FILTERS: { value: HistoryFilter; label: string }[] = [
  { value: 'all', label: 'Todas' },
  { value: 'acquired', label: 'Adquiridas' },
  { value: 'sold', label: 'Vendidas' },
];

const KIND_LABEL: Record<OperationKind, string> = {
  sobre: 'Adquirida por sobre',
  compra: 'Adquirida por compra',
  venta: 'Vendida',
};

const KIND_STYLE: Record<OperationKind, string> = {
  sobre: 'text-neon-blue border-neon-blue/40',
  compra: 'text-neon-green border-neon-green/40',
  venta: 'text-gold-bright border-gold-bright/40',
};

const PACK_LABEL: Record<PackTypeKey, string> = {
  common: 'Común',
  rare: 'Raro',
  epic: 'Épico',
  legendary: 'Legendario',
};

const RARITY_LABEL: Record<string, string> = {
  common: 'Común',
  rare: 'Rara',
  epic: 'Épica',
  legendary: 'Legendaria',
};

const DETAIL_STYLE = 'text-sm md:text-right';

const credits = (value: number) => `${value.toLocaleString('es-AR')} créditos`;

function Detail({ entry }: { entry: OperationEntry }) {
  if (entry.kind === 'sobre') {
    return (
      <div className={DETAIL_STYLE}>
        <p className="font-semibold text-neon-blue">Primer propietario</p>
        {entry.packType && <p className="text-xs text-slate-400">Sobre {PACK_LABEL[entry.packType]}</p>}
      </div>
    );
  }

  return (
    <div className={DETAIL_STYLE}>
      <p className="font-semibold text-slate-100">
        {entry.kind === 'compra' ? 'Pagaste' : 'Recibiste'} {entry.price !== null ? credits(entry.price) : '—'}
      </p>
      {entry.balanceBefore !== null && entry.balanceAfter !== null && (
        <p className="text-xs text-slate-400">
          Saldo: {entry.balanceBefore.toLocaleString('es-AR')} → {entry.balanceAfter.toLocaleString('es-AR')}
        </p>
      )}
      {entry.counterparty && (
        <p className="text-xs text-slate-400">{entry.counterparty === 'plataforma' ? 'Plataforma' : 'Otro usuario'}</p>
      )}
      <p className="text-xs text-slate-500">
        {entry.quote
          ? `Cotización de ese momento: ${entry.price !== null ? credits(entry.price) : '—'} · ${strategyLabel(entry.quote.strategy)}`
          : 'Estrategia no disponible'}
      </p>
    </div>
  );
}

function Entry({ entry, onViewPlayer }: { entry: OperationEntry; onViewPlayer?: (entry: OperationEntry) => void }) {
  return (
    // Columnas fijas: el detalle y el botón quedan alineados entre entradas, sea cual sea el largo
    // del nombre o del club.
    <li className={`grid items-center gap-3 rounded border-l-4 bg-navy-card/60 p-3 md:grid-cols-[minmax(0,1fr)_22rem_6.5rem] ${KIND_STYLE[entry.kind]}`}>
      <div className="min-w-0">
        <p className="text-xs uppercase tracking-wide">{KIND_LABEL[entry.kind]}</p>
        <p className="title-display truncate text-slate-100">{entry.player.name}</p>
        <p className="text-xs text-slate-400">
          {entry.player.club.name} · {RARITY_LABEL[entry.rarity] ?? entry.rarity} · Serie #{entry.serial}
        </p>
        <p className="text-xs text-slate-500">{new Date(entry.at).toLocaleString('es-AR')}</p>
      </div>
      <Detail entry={entry} />
      {onViewPlayer && (
        <button
          type="button"
          onClick={() => onViewPlayer(entry)}
          className="bevel justify-self-start bg-navy-card px-3 py-1 text-xs text-slate-200 md:justify-self-end"
          aria-label={`Ver evolución de ${entry.player.name}`}
        >
          Ver evolución
        </button>
      )}
    </li>
  );
}

/**
 * Historial de cartas adquiridas y vendidas (10-historial-operaciones US1 y US4). Presentacional:
 * recibe los datos y avisa qué se pidió. Una entrada por carta; las de sobre no tienen precio de
 * compra y dicen «Primer propietario» (FR-005).
 */
export function OperationHistory({
  entries,
  meta,
  filter,
  loading,
  error,
  onFilterChange,
  onPageChange,
  onRetry,
  onViewPlayer,
}: OperationHistoryProps) {
  const totalPages = meta?.totalPages ?? 0;
  const page = meta?.page ?? 1;

  return (
    <section aria-labelledby="operation-history-title">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 id="operation-history-title" className="title-display text-xl text-slate-100">
          Historial de operaciones
        </h2>
        <div role="tablist" aria-label="Filtrar el historial" className="flex gap-2">
          {FILTERS.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={filter === value}
              onClick={() => onFilterChange(value)}
              className={`bevel px-4 py-1 text-sm ${
                filter === value ? 'bg-neon-blue/20 text-neon-blue' : 'bg-navy-card text-slate-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {loading && entries.length === 0 && <p className="py-8 text-center text-slate-400">Cargando tu historial…</p>}

      {error && (
        <div className="py-8 text-center">
          <p role="alert" className="text-error-red">
            {error}
          </p>
          <button type="button" onClick={onRetry} className="bevel mt-3 bg-navy-card px-4 py-2 text-sm">
            Reintentar
          </button>
        </div>
      )}

      {!loading && !error && entries.length === 0 && (
        <div className="py-8 text-center">
          {filter === 'all' ? (
            <>
              <p className="title-display text-slate-300">Todavía no hiciste operaciones</p>
              <p className="mt-1 text-sm text-slate-500">Abrí un sobre o comprá una carta para empezar tu historial.</p>
              <div className="mt-4 flex justify-center gap-3">
                <Link to="/packs" className="bevel bg-neon-blue/20 px-5 py-2 text-neon-blue">
                  Ir a Sobres
                </Link>
                <Link to="/market" className="bevel bg-navy-card px-5 py-2 text-slate-200">
                  Ir al Market
                </Link>
              </div>
            </>
          ) : (
            <p className="text-slate-400">No hay cartas {filter === 'acquired' ? 'adquiridas' : 'vendidas'} para mostrar.</p>
          )}
        </div>
      )}

      {!error && entries.length > 0 && (
        <>
          <p className="mb-3 text-xs text-slate-500">
            {meta?.total ?? entries.length} {meta?.total === 1 ? 'carta' : 'cartas'}
          </p>
          <ul className="space-y-2">
            {entries.map((entry) => (
              <Entry key={entry.id} entry={entry} onViewPlayer={onViewPlayer} />
            ))}
          </ul>

          {totalPages > 1 && (
            <nav className="mt-6 flex items-center justify-center gap-4" aria-label="Paginación del historial">
              <button
                type="button"
                onClick={() => onPageChange(page - 1)}
                disabled={page <= 1 || loading}
                className="bevel bg-navy-card px-4 py-2 text-sm disabled:opacity-40"
              >
                Anterior
              </button>
              <span className="text-sm text-slate-400">
                Página {page} de {totalPages}
              </span>
              <button
                type="button"
                onClick={() => onPageChange(page + 1)}
                disabled={page >= totalPages || loading}
                className="bevel bg-navy-card px-4 py-2 text-sm disabled:opacity-40"
              >
                Siguiente
              </button>
            </nav>
          )}
        </>
      )}
    </section>
  );
}
