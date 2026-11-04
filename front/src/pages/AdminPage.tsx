import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AdminActivityChart } from '../components/AdminActivityChart';
import { AdminBarChart } from '../components/AdminBarChart';
import { AdminPeriodSelector } from '../components/AdminPeriodSelector';
import { AdminReconciliation } from '../components/AdminReconciliation';
import { AdminStatCard } from '../components/AdminStatCard';
import { AppHeader } from '../components/AppHeader';
import { useCredits } from '../app/useCredits';
import { adminErrorMessage, getAdminMetrics, type AdminMetrics, type AdminPeriodQuery } from '../services/admin.service';
import { extractApiErrorCode } from '../services/packs.service';
import { useAuth } from '../services/useAuth';
import { periodLabel, presetPeriod, validateCustomRange, type AdminPreset } from './admin-period';
import { AdminStrategies } from './AdminStrategies';
import { todayLocal } from './date-filter';

const n = (value: number) => value.toLocaleString('es-AR');
const credits = (value: number) => `${n(value)} créditos`;

const PACK_LABELS: Record<string, string> = { common: 'Común', rare: 'Raro', epic: 'Épico', legendary: 'Legendario' };

const RARITY_COLORS: Record<string, string> = {
  common: '#94a3b8',
  rare: 'var(--color-neon-blue)',
  epic: '#c084fc',
  legendary: 'var(--color-gold-bright)',
};

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3" aria-label={title}>
      <h2 className="title-display text-lg text-slate-200">{title}</h2>
      {children}
    </section>
  );
}

const STATS_GRID = 'grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4';

const SECTIONS = [
  { key: 'resumen', label: 'Resumen' },
  { key: 'actividad', label: 'Actividad' },
  { key: 'cartas', label: 'Cartas y sobres' },
  { key: 'mercado', label: 'Mercado' },
  { key: 'economia', label: 'Economía' },
  { key: 'estrategias', label: 'Estrategias' },
] as const;

type MetricsSection = Exclude<(typeof SECTIONS)[number]['key'], 'estrategias'>;
const SECTION_PARAM = 'seccion';

/**
 * Panel de administración (11-admin-panel): orquesta el período y la carga, y compone las métricas.
 * Las métricas son de solo lectura y todos los cálculos vienen del servidor. El menú lateral muestra
 * una sección por vez; las estrategias tienen su propia carga (16-config-estrategia).
 */
export default function AdminPage() {
  const { user, logout } = useAuth();
  const { balance } = useCredits();
  // La sección vive en la URL: recargar o volver atrás deja al administrador donde estaba.
  const [searchParams, setSearchParams] = useSearchParams();
  const section = SECTIONS.find(({ key }) => key === searchParams.get(SECTION_PARAM))?.key ?? 'resumen';
  const [preset, setPreset] = useState<AdminPreset | null>('30d');
  const [period, setPeriod] = useState<AdminPeriodQuery>(() => presetPeriod('30d'));
  const [metrics, setMetrics] = useState<AdminMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rangeError, setRangeError] = useState<string | null>(null);
  // Una respuesta vieja no debe pisar a la del último período elegido.
  const requestId = useRef(0);

  const load = useCallback(async (target: AdminPeriodQuery, refresh = false) => {
    const current = ++requestId.current;
    setLoading(true);
    setError(null);
    try {
      const result = await getAdminMetrics(target, refresh);
      if (current === requestId.current) setMetrics(result);
    } catch (err) {
      if (current === requestId.current) setError(adminErrorMessage(extractApiErrorCode(err)));
    } finally {
      if (current === requestId.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(period);
  }, [load, period]);

  const choosePreset = (next: AdminPreset) => {
    setRangeError(null);
    setPreset(next);
    setPeriod(presetPeriod(next));
  };

  const chooseRange = (from: string, to: string) => {
    const invalid = validateCustomRange(from, to);
    setRangeError(invalid);
    if (invalid) return;
    setPreset(null);
    setPeriod({ from, to });
  };

  return (
    <main className="min-h-screen bg-navy-deep text-slate-200">
      <AppHeader username={user?.username} balance={balance} onLogout={logout} isAdmin />

      <div className="mx-auto flex max-w-6xl flex-col gap-6 p-6">
        <h1 className="title-display text-3xl text-slate-100">Panel de administración</h1>

        <div className="flex flex-col gap-6 md:flex-row">
          <nav aria-label="Secciones del panel" className="flex shrink-0 flex-wrap gap-1 md:sticky md:top-6 md:w-48 md:flex-col md:self-start">
            {SECTIONS.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                aria-current={section === key ? 'page' : undefined}
                onClick={() => setSearchParams({ [SECTION_PARAM]: key })}
                className={`bevel flex shrink-0 items-center justify-between gap-2 px-4 py-2 text-left text-sm ${
                  section === key ? 'bg-neon-blue/20 text-neon-blue' : 'bg-navy-card text-slate-200'
                }`}
              >
                {label}
                {key === 'economia' && metrics && !reconciled(metrics) && (
                  <span role="img" aria-label="La conciliación no cierra" className="size-2 rounded-full bg-error-red" />
                )}
              </button>
            ))}
          </nav>

          <div className="flex min-w-0 flex-1 flex-col gap-6">
            {/* El período va acá y no bajo el título: así el título y el menú no se mueven en Estrategias. */}
            {section !== 'estrategias' && (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm text-slate-400" aria-live="polite">
                    {periodLabel(period)}
                    {metrics && !loading && ` · Datos de las ${new Date(metrics.computedAt).toLocaleTimeString('es-AR', { hour12: false })}`}
                  </p>
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => void load(period, true)}
                    className="bevel bg-navy-card px-4 py-1 text-sm text-slate-200 disabled:opacity-60"
                  >
                    Actualizar
                  </button>
                </div>

                <AdminPeriodSelector
                  preset={preset}
                  today={todayLocal()}
                  error={rangeError}
                  disabled={loading}
                  onPreset={choosePreset}
                  onRange={chooseRange}
                />

                {error && (
                  <div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-error-red">
                    <p>{error}</p>
                    <button type="button" onClick={() => void load(period)} className="bevel bg-navy-card px-4 py-1 text-slate-200">
                      Reintentar
                    </button>
                  </div>
                )}

                {loading && !metrics && <p className="text-slate-400">Cargando métricas…</p>}

                {metrics && !error && <AdminMetricsView metrics={metrics} section={section} />}
              </>
            )}

            {/* Oculta y no desmontada: cambiar de sección no borra la clave ni lo que se está editando. */}
            <div hidden={section !== 'estrategias'}>
              <AdminStrategies />
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

const reconciled = ({ reconciliation }: AdminMetrics) => reconciliation.cards.ok && reconciliation.credits.ok;

function AdminMetricsView({ metrics, section }: { metrics: AdminMetrics; section: MetricsSection }) {
  const { users, cards, rarity, packs, market, activity, reconciliation, credits: creditTotals } = metrics;

  const views: Record<MetricsSection, ReactNode> = {
    resumen: (
      <Section title="Resumen">
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <AdminStatCard label="Usuarios registrados" value={n(users.registered)} />
          <AdminStatCard label="Cartas en circulación" value={n(cards.inCirculation)} hint={`de ${n(cards.issued)} emitidas`} />
          <AdminStatCard label="Cartas en sobres" value={n(cards.inPacks)} />
          <AdminStatCard label="Pool de sobres restantes" value={n(packs.remaining)} />
          <AdminStatCard
            label="Precio de venta promedio"
            value={market.averagePrice === null ? 'Sin ventas' : credits(market.averagePrice)}
            inPeriod
          />
        </dl>
      </Section>
    ),
    actividad: (
      <Section title="Actividad">
        <dl className={STATS_GRID}>
          <AdminStatCard label="Usuarios nuevos" value={n(users.new)} inPeriod />
          <AdminStatCard label="Usuarios activos" value={n(users.active)} hint="Abrieron sobres, compraron o vendieron" inPeriod />
          <AdminStatCard label="Sobres abiertos" value={n(packs.opened)} inPeriod />
          <AdminStatCard label="Ventas concretadas" value={n(market.sales)} inPeriod />
        </dl>
        <AdminActivityChart unit={activity.unit} buckets={activity.buckets} />
      </Section>
    ),
    cartas: (
      <Section title="Cartas y sobres">
        <dl className={STATS_GRID}>
          <AdminStatCard label="Reservadas" value={n(cards.reserved)} hint="Su jugador todavía no es elegible" />
          <AdminStatCard label="En venta de la plataforma" value={n(cards.platformSale)} />
          <AdminStatCard label="A la venta en el Market" value={n(cards.listed)} hint="Siguen siendo de su dueño" />
          <AdminStatCard label="Cartas emitidas" value={n(cards.issued)} />
        </dl>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <AdminBarChart
            title="Sobres sin abrir por tipo"
            valueLabel="Sin abrir"
            empty="No quedan sobres sin abrir."
            data={packs.byType.map(({ type, remaining, soldOut }) => ({
              label: soldOut ? `${PACK_LABELS[type]} (agotado)` : PACK_LABELS[type],
              value: remaining,
              color: RARITY_COLORS[type],
            }))}
          />
          <AdminBarChart
            title="Sobres abiertos por tipo"
            valueLabel="Abiertos"
            empty="No se abrieron sobres en este período."
            data={packs.byType.map(({ type, opened }) => ({ label: PACK_LABELS[type], value: opened, color: RARITY_COLORS[type] }))}
          />
          <AdminBarChart
            title="Cartas en circulación por rareza"
            valueLabel="Cartas"
            empty="Todavía no hay cartas en circulación."
            data={(['common', 'rare', 'epic', 'legendary'] as const).map((key) => ({
              label: PACK_LABELS[key],
              value: rarity[key],
              color: RARITY_COLORS[key],
            }))}
          />
        </div>
      </Section>
    ),
    mercado: (
      <Section title="Mercado">
        <dl className={STATS_GRID}>
          <AdminStatCard label="Volumen de ventas" value={credits(market.volume)} inPeriod />
          <AdminStatCard
            label="Venta más alta"
            value={market.topSale ? credits(market.topSale.price) : 'Sin ventas'}
            hint={market.topSale?.playerName}
            inPeriod
          />
        </dl>
        {market.topPlayers.length > 0 && (
          <AdminBarChart
            title="Jugadores más vendidos"
            valueLabel="Ventas"
            empty=""
            data={market.topPlayers.map(({ playerName, sales }) => ({ label: playerName, value: sales }))}
          />
        )}
      </Section>
    ),
    economia: (
      <Section title="Economía">
        <dl className={STATS_GRID}>
          <AdminStatCard label="Créditos en circulación" value={n(creditTotals.inCirculation)} />
          <AdminStatCard label="Créditos emitidos" value={n(creditTotals.issued)} inPeriod />
          <AdminStatCard label="Cobrados por la plataforma" value={n(creditTotals.collected)} inPeriod />
        </dl>
        <AdminReconciliation reconciliation={reconciliation} />
      </Section>
    ),
  };

  return views[section];
}
