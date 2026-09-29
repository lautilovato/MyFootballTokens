import type { ApiPlayerDetail } from '../services/players.service';

interface PlayerDetailPanelProps {
  player: ApiPlayerDetail | null;
  loading: boolean;
  error: string | null;
  onClose: () => void;
}

/** Las métricas que la spec exige en el panel (FR-012), en el orden en que se muestran. */
const METRICS: { label: string; key: keyof ApiPlayerDetail; suffix?: string }[] = [
  { label: 'Goles', key: 'goals' },
  { label: 'Asistencias', key: 'assists' },
  { label: 'Altura', key: 'height', suffix: ' cm' },
  { label: 'Tiros por partido', key: 'shotsPerGame' },
  { label: 'Pases clave', key: 'keyPasses' },
  { label: 'Regates', key: 'dribbles' },
  { label: 'Entradas', key: 'tackles' },
];

/** Un valor nulo es "sin dato", que no es lo mismo que un cero real (FR-015). */
function format(value: unknown, suffix = ''): string {
  if (value === null || value === undefined) return 'Sin dato';
  return `${value}${suffix}`;
}

/** Gráfica de la serie simulada. Deliberadamente sin ejes ni valores: no son datos reales. */
function MockChart({ history }: { history: number[] }) {
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
    <svg viewBox="0 0 100 40" className="h-20 w-full" role="img" aria-label="Serie simulada de 30 días">
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

/**
 * Panel lateral de detalle (US3).
 *
 * La gráfica de 30 días y el bloque de compra son MAQUETA (FR-023, FR-032, FR-033): no existe
 * motor de cotizaciones ni módulo de billetera. El selector y el botón van deshabilitados y
 * sin ningún manejador — ninguna interacción puede emitir una petición de compra.
 */
export function PlayerDetailPanel({ player, loading, error, onClose }: PlayerDetailPanelProps) {
  return (
    <aside
      className="w-full shrink-0 border-l border-white/10 bg-navy-card/60 p-5 md:w-80"
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

          {/* ---- Desde acá todo es maqueta: sin datos reales detrás ---- */}
          <section className="mb-5 rounded border border-dashed border-white/20 p-3">
            <div className="mb-1 flex items-baseline justify-between">
              <h3 className="title-display text-xs text-slate-300">30-Day Market Value</h3>
              <span className="text-[10px] uppercase tracking-wide text-gold">Maqueta</span>
            </div>
            <div className={player.changePct >= 0 ? 'text-neon-green' : 'text-error-red'}>
              <MockChart history={player.priceHistory} />
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Datos simulados: todavía no existe el motor de cotizaciones.
            </p>
          </section>

          <dl className="mb-5 space-y-1 text-sm">
            <div className="flex justify-between">
              <dt className="text-slate-400">Market value</dt>
              <dd className="text-slate-100">{player.marketValue.toLocaleString('es-AR')}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-400">Supply</dt>
              <dd className="text-slate-100">
                {player.supply.minted}/{player.supply.total}
              </dd>
            </div>
          </dl>

          <section className="rounded border border-dashed border-white/20 p-3" aria-label="Compra de tokens">
            <div className="mb-2 flex items-baseline justify-between">
              <h3 className="title-display text-xs text-slate-300">Buy</h3>
              <span className="text-[10px] uppercase tracking-wide text-gold">No disponible</span>
            </div>
            <label className="mb-2 block text-xs text-slate-400">
              Amount (tokens)
              <input
                type="number"
                value={1}
                disabled
                readOnly
                aria-label="Cantidad de tokens"
                className="bevel mt-1 w-full cursor-not-allowed bg-navy px-2 py-1 text-slate-500"
              />
            </label>
            <button
              type="button"
              disabled
              className="bevel w-full cursor-not-allowed bg-navy px-4 py-2 text-sm text-slate-500"
            >
              Buy token (1)
            </button>
            <p className="mt-2 text-xs text-slate-500">
              La compra de tokens todavía no está habilitada.
            </p>
          </section>
        </>
      )}
    </aside>
  );
}
