import type { ApiPlayerDetail } from '../services/players.service';
import { MarketListings, type MarketListingsProps } from './MarketListings';

interface PlayerDetailPanelProps {
  player: ApiPlayerDetail | null;
  loading: boolean;
  error: string | null;
  onClose: () => void;
  /** Cartas a la venta del jugador y la compra (09-mercado FR-038); nulo para no mostrar el bloque. */
  market?: MarketListingsProps | null;
  /**
   * Gráfico completo de cotizaciones (10-historial-operaciones FR-019, FR-020): `onOpen` abre el
   * modal y `quoteLabel` es la estrategia de la cotización vigente («Performance v2»), nula si
   * todavía no se conoce.
   */
  priceHistoryView?: { quoteLabel: string | null; onOpen: () => void } | null;
}

/**
 * Métricas de temporada del panel (FR-012), en el orden en que se muestran. Tiros, pases
 * clave, regates y entradas llegan como promedio por partido desde WhoScored.
 */
const METRICS: { label: string; key: keyof ApiPlayerDetail; suffix?: string }[] = [
  { label: 'Partidos jugados', key: 'matchesPlayed' },
  { label: 'Goles', key: 'goals' },
  { label: 'Asistencias', key: 'assists' },
  { label: 'Tiros por partido', key: 'shotsPerGame' },
  { label: 'Pases clave por partido', key: 'keyPasses' },
  { label: 'Regates por partido', key: 'dribbles' },
  { label: 'Entradas por partido', key: 'tackles' },
];

/** Un valor nulo es "sin dato", que no es lo mismo que un cero real (FR-015). */
function format(value: unknown, suffix = ''): string {
  if (value === null || value === undefined) return 'Sin dato';
  return `${value}${suffix}`;
}

/**
 * Gráfica de las últimas cotizaciones del jugador, del precio más viejo al más nuevo. Es una
 * línea sin ejes: el rango y la cantidad de puntos se informan en el texto que la acompaña.
 */
function PriceChart({ history }: { history: number[] }) {
  if (history.length < 2) return null;

  const min = Math.min(...history);
  const max = Math.max(...history);
  const range = max - min || 1;
  const points = history
    .map((v, i) => {
      const x = (i / (history.length - 1)) * 100;
      const y = 40 - ((v - min) / range) * 36;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');

  return (
    <svg viewBox="0 0 100 40" className="h-20 w-full" role="img" aria-label="Historial de cotizaciones">
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

const formatCredits = (value: number) => value.toLocaleString('es-AR');

/**
 * Resumen en texto de la serie de cotizaciones, para que la gráfica no dependa solo del color y
 * de la forma de la línea. Con menos de dos cotizaciones no hay historial que graficar.
 */
function historySummary(history: number[]): string {
  if (history.length < 2) {
    return history.length === 0
      ? 'Este jugador todavía no tiene cotizaciones.'
      : 'Hay una sola cotización: todavía no hay historial para graficar.';
  }
  return `Últimas ${history.length} cotizaciones · mín ${formatCredits(Math.min(...history))} · máx ${formatCredits(Math.max(...history))}`;
}

/**
 * Panel lateral de detalle (06-home US3).
 *
 * La gráfica sale de las cotizaciones reales del jugador (07-cotizacion). El bloque de compra
 * (09-mercado FR-038, que reemplaza la maqueta de 06 FR-032 y FR-033) es `MarketListings`: la
 * página le pasa las cartas a la venta y decide qué hacer al comprar.
 */
export function PlayerDetailPanel({ player, loading, error, onClose, market, priceHistoryView }: PlayerDetailPanelProps) {
  return (
    // Siempre a la vista, sin importar hasta dónde se scrolleó la grilla: en desktop queda
    // fijo (sticky) en su columna; en mobile, donde la columna quedaría debajo de toda la
    // grilla, se muestra como hoja fija al pie de la pantalla. En ambos casos scrollea solo.
    <aside
      className={
        'fixed inset-x-0 bottom-0 z-40 max-h-[80vh] w-full shrink-0 overflow-y-auto ' +
        'rounded-t-lg border-t border-white/10 bg-navy-card p-5 shadow-2xl ' +
        'md:sticky md:inset-x-auto md:bottom-auto md:top-6 md:z-auto md:max-h-[calc(100vh-3rem)] ' +
        'md:w-80 md:self-start md:rounded-none md:border-l md:border-t-0 md:bg-navy-card/60 md:shadow-none'
      }
      aria-label="Detalle del jugador"
    >
      <header className="mb-4 flex items-center justify-between">
        <h2 className="title-display text-lg text-slate-100">Player Details</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar el detalle"
          className="px-2 text-xl leading-none text-slate-400 hover:text-slate-100"
        >
          ×
        </button>
      </header>

      {loading && <p className="text-sm text-slate-400">Cargando detalle…</p>}
      {error && !loading && <p className="text-sm text-error-red">{error}</p>}

      {player && !loading && !error && (
        <>
          <div className="mb-4">
            <p className="title-display text-xl text-neon-blue">{player.name}</p>
            <p className="text-sm text-slate-400">
              {player.club.name} · {player.league}
            </p>
            <p className="mt-2 text-sm text-slate-300">
              OVR <strong className="text-gold">{player.ovr ?? 'Sin dato'}</strong> ·{' '}
              {player.position} · {player.rarity}
            </p>
            {player.season && (
              <p className="text-xs text-slate-500">Temporada {player.season}</p>
            )}
          </div>

          <dl className="mb-5 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            {METRICS.map(({ label, key, suffix }) => (
              <div key={key} className="contents">
                <dt className="text-slate-400">{label}</dt>
                <dd className="text-right text-slate-100">{format(player[key], suffix)}</dd>
              </div>
            ))}
          </dl>

          <section className="mb-5 rounded border border-white/10 p-3" aria-label="Historial de cotizaciones">
            <div className="mb-1 flex items-baseline justify-between">
              <h3 className="title-display text-xs text-slate-300">Price History</h3>
              <span className="flex items-baseline gap-3">
                {player.priceHistory.length >= 2 && (
                  <span className={player.changePct >= 0 ? 'text-xs text-neon-green' : 'text-xs text-error-red'}>
                    {player.changePct > 0 ? '+' : ''}
                    {player.changePct.toFixed(1)}%
                  </span>
                )}
                {/* Con al menos una cotización hay algo que ver en el gráfico completo (FR-019). */}
                {priceHistoryView && player.priceHistory.length >= 1 && (
                  <button
                    type="button"
                    onClick={priceHistoryView.onOpen}
                    className="text-xs text-neon-blue underline-offset-2 hover:underline"
                  >
                    Ver más
                  </button>
                )}
              </span>
            </div>
            <div className={player.changePct >= 0 ? 'text-neon-green' : 'text-error-red'}>
              <PriceChart history={player.priceHistory} />
            </div>
            <p className="mt-1 text-xs text-slate-500">{historySummary(player.priceHistory)}</p>
            {priceHistoryView?.quoteLabel && player.priceHistory.length >= 1 && (
              <p className="text-xs text-slate-400">Cotizado con {priceHistoryView.quoteLabel}</p>
            )}
          </section>

          <dl className="mb-5 space-y-1 text-sm">
            <div className="flex justify-between">
              <dt className="text-slate-400">Market value</dt>
              <dd className="text-slate-100">{formatCredits(player.marketValue)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-400">Supply</dt>
              <dd className="text-slate-100">
                {player.supply.minted}/{player.supply.total}
              </dd>
            </div>
          </dl>

          {/* 09-mercado FR-038: el bloque de compra lista las cartas a la venta. */}
          {market && <MarketListings {...market} />}
        </>
      )}
    </aside>
  );
}
