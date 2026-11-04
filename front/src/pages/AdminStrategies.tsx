import { useCallback, useEffect, useState } from 'react';
import { ConfirmModal } from '../components/confirm-modal/ConfirmModal';
import { Input } from '../components/Input';
import {
  activateStrategy,
  createStrategyVersion,
  listStrategies,
  recalculateQuotes,
  STRATEGY_METRICS,
  strategyErrorMessage,
  type StrategyConfig,
  type StrategyMetric,
  type ValuationStrategy,
} from '../services/valuation-strategies.service';
import { NUMBER_FIELDS, parseDraft, toDraft, type NumberField, type ProfileKey, type StrategyDraft } from './strategy-draft';

const METRIC_LABELS: Record<StrategyMetric, string> = {
  goals: 'Goles',
  assists: 'Asistencias',
  shots: 'Tiros',
  keyPasses: 'Pases clave',
  dribbles: 'Regates',
  tackles: 'Entradas',
  rating: 'Rating',
  absence: 'Ausencias',
  worldReputation: 'Reputación mundial',
};

const PROFILE_LABELS: Record<ProfileKey, string> = {
  general: 'General',
  GK: 'Arqueros',
  DF: 'Defensores',
  MF: 'Mediocampistas',
  FW: 'Delanteros',
};

const NUMBER_LABELS: Record<NumberField, string> = {
  baseValue: 'Precio con score 0',
  scaleFactor: 'Factor de escala',
  minPrice: 'Precio mínimo',
  defaultReputation: 'Reputación por defecto',
};

type PendingAction =
  | { kind: 'activate'; strategy: ValuationStrategy }
  | { kind: 'recalculate'; strategy: ValuationStrategy }
  | { kind: 'save'; strategy: ValuationStrategy; config: StrategyConfig };

const CONFIRM_TEXT: Record<PendingAction['kind'], { title: string; label: string }> = {
  activate: { title: 'Activar estrategia', label: 'Activar' },
  recalculate: { title: 'Recalcular cotizaciones', label: 'Recalcular' },
  save: { title: 'Guardar versión', label: 'Guardar' },
};

function describe(action: PendingAction): string {
  const { name, currentVersion } = action.strategy;
  if (action.kind === 'activate') return `${name} pasa a ser la estrategia activa. Los precios del mercado no cambian hasta recalcular.`;
  if (action.kind === 'recalculate') return `Cotiza a todos los jugadores con ${name}. Cambian los precios del mercado.`;
  return `Se crea la versión ${currentVersion.version + 1} de ${name}. Las versiones anteriores no se modifican, y los precios no cambian hasta recalcular.`;
}

/** Mensaje al terminar: cada acción dice qué falta para que se vea en los precios. */
function describeSuccess(action: PendingAction): string {
  const { name, currentVersion } = action.strategy;
  if (action.kind === 'activate') return `${name} es la estrategia activa.`;
  if (action.kind === 'recalculate') return `Cotizaciones recalculadas con ${name}.`;
  return `Se creó la versión ${currentVersion.version + 1} de ${name}.${action.strategy.active ? ' Recalculá para aplicarla.' : ''}`;
}

/**
 * Configuración de estrategias del panel (16-config-estrategia). Ver no pide nada más que la sesión
 * de administrador; cambiar algo pide además la clave administrativa, que vive solo en el estado de
 * esta pantalla: no se guarda ni forma parte del código del front.
 */
export function AdminStrategies() {
  const [strategies, setStrategies] = useState<ValuationStrategy[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [editing, setEditing] = useState<{ strategy: ValuationStrategy; draft: StrategyDraft; profile: ProfileKey } | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      setStrategies(await listStrategies());
    } catch {
      setLoadError('No se pudieron cargar las estrategias.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const hasKey = apiKey.trim() !== '';
  const blocked = !hasKey || busy;

  const edit = (strategy: ValuationStrategy) => {
    setFormError(null);
    setResult(null);
    setEditing({ strategy, draft: toDraft(strategy.currentVersion), profile: 'general' });
  };

  const save = () => {
    if (!editing) return;
    const parsed = parseDraft(editing.draft);
    if ('error' in parsed) {
      setFormError(parsed.error);
      return;
    }
    setFormError(null);
    setPending({ kind: 'save', strategy: editing.strategy, config: parsed.config });
  };

  const confirm = async () => {
    if (!pending) return;
    const action = pending;
    setPending(null);
    setBusy(true);
    setResult(null);
    try {
      const { key } = action.strategy;
      if (action.kind === 'activate') await activateStrategy(key, apiKey);
      else if (action.kind === 'recalculate') await recalculateQuotes(key, apiKey);
      else await createStrategyVersion(key, action.config, apiKey);

      if (action.kind === 'save') setEditing(null);
      setResult({ ok: true, text: describeSuccess(action) });
      await load();
    } catch (error) {
      setResult({ ok: false, text: strategyErrorMessage(error) });
    } finally {
      setBusy(false);
    }
  };

  const setWeight = (metric: StrategyMetric, value: string) =>
    setEditing((current) => {
      if (!current) return current;
      const { draft, profile } = current;
      const profiles = { ...draft.profiles, [profile]: { ...draft.profiles[profile], [metric]: value } };
      return { ...current, draft: { ...draft, profiles } };
    });

  const setNumber = (field: NumberField, value: string) =>
    setEditing((current) => current && { ...current, draft: { ...current.draft, [field]: value } });

  return (
    <section className="flex flex-col gap-3" aria-label="Estrategias de cotización">
      <h2 className="title-display text-lg text-slate-200">Estrategias de cotización</h2>

      <div className="max-w-md">
        <Input
          label="Clave administrativa"
          name="admin-api-key"
          type="password"
          autoComplete="off"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
        />
        <p className="mt-1 text-xs text-slate-500">Hace falta para hacer cambios. No se guarda: se borra al salir de esta pantalla.</p>
      </div>

      {result && (
        <p role={result.ok ? 'status' : 'alert'} className={`text-sm ${result.ok ? 'text-neon-green' : 'text-error-red'}`}>
          {result.text}
        </p>
      )}

      {loadError && (
        <div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-error-red">
          <p>{loadError}</p>
          <button type="button" onClick={() => void load()} className="bevel bg-navy-card px-4 py-1 text-slate-200">
            Reintentar
          </button>
        </div>
      )}

      {!loadError && !strategies && <p className="text-slate-400">Cargando estrategias…</p>}

      {strategies && (
        <ul className="grid list-none grid-cols-1 gap-3 p-0 lg:grid-cols-2">
          {strategies.map((strategy) => (
            <li key={strategy.key} className="flex flex-col gap-2 rounded border border-white/10 bg-navy-card/60 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="title-display text-slate-100">{strategy.name}</h3>
                <span className="text-xs text-slate-400">Versión {strategy.currentVersion.version}</span>
                {strategy.active && <span className="rounded bg-neon-green/15 px-2 py-0.5 text-xs text-neon-green">Activa</span>}
              </div>
              <p className="text-sm text-slate-400">{strategy.description}</p>
              <div className="mt-auto flex flex-wrap gap-2 pt-1">
                <button type="button" onClick={() => edit(strategy)} className="bevel bg-navy-card px-4 py-1 text-sm text-slate-200">
                  Configurar
                </button>
                {strategy.active ? (
                  // Recalcular con otra estrategia cambiaría los precios sin que sea la activa.
                  <button
                    type="button"
                    disabled={blocked}
                    onClick={() => setPending({ kind: 'recalculate', strategy })}
                    className="bevel bg-neon-blue/20 px-4 py-1 text-sm text-neon-blue disabled:opacity-40"
                  >
                    Recalcular
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={blocked}
                    onClick={() => setPending({ kind: 'activate', strategy })}
                    className="bevel bg-neon-blue/20 px-4 py-1 text-sm text-neon-blue disabled:opacity-40"
                  >
                    Activar
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <form
          aria-label={`Configurar ${editing.strategy.name}`}
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
          className="flex flex-col gap-4 rounded border border-white/10 bg-navy-card/60 p-4"
        >
          <h3 className="title-display text-slate-100">Configurar {editing.strategy.name}</h3>

          <div>
            <div role="tablist" aria-label="Perfil de pesos" className="flex flex-wrap gap-2">
              {(Object.keys(PROFILE_LABELS) as ProfileKey[]).map((key) => (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={editing.profile === key}
                  onClick={() => setEditing({ ...editing, profile: key })}
                  className={`bevel px-4 py-1 text-sm ${
                    editing.profile === key ? 'bg-neon-blue/20 text-neon-blue' : 'bg-navy-card text-slate-200'
                  }`}
                >
                  {PROFILE_LABELS[key]}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-slate-500">
              {editing.profile === 'general'
                ? 'Se usan para las posiciones sin pesos propios.'
                : 'Reemplazan a los generales para esta posición. Vacíos, se usan los generales.'}{' '}
              Van de -1 a 1, y al menos uno tiene que ser positivo.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            {STRATEGY_METRICS.map((metric) => (
              <Input
                key={`${editing.profile}-${metric}`}
                label={METRIC_LABELS[metric]}
                name={`weight-${metric}`}
                type="number"
                step="any"
                min={-1}
                max={1}
                value={editing.draft.profiles[editing.profile][metric] ?? ''}
                onChange={(e) => setWeight(metric, e.target.value)}
              />
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3 border-t border-white/10 pt-4 md:grid-cols-4">
            {NUMBER_FIELDS.map((field) => (
              <Input
                key={field}
                label={NUMBER_LABELS[field]}
                name={field}
                type="number"
                step={1}
                value={editing.draft[field]}
                onChange={(e) => setNumber(field, e.target.value)}
              />
            ))}
          </div>

          {formError && (
            <p role="alert" className="text-sm text-error-red">
              {formError}
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={blocked} className="bevel bg-neon-blue/20 px-4 py-1 text-sm text-neon-blue disabled:opacity-40">
              Guardar versión {editing.strategy.currentVersion.version + 1}
            </button>
            <button type="button" onClick={() => setEditing(null)} className="bevel bg-navy-card px-4 py-1 text-sm text-slate-200">
              Cancelar
            </button>
            {!hasKey && <p className="self-center text-xs text-slate-500">Escribí la clave administrativa para guardar.</p>}
          </div>
        </form>
      )}

      <ConfirmModal
        open={pending !== null}
        title={pending ? CONFIRM_TEXT[pending.kind].title : ''}
        description={pending ? describe(pending) : undefined}
        confirmLabel={pending ? CONFIRM_TEXT[pending.kind].label : undefined}
        onConfirm={() => void confirm()}
        onCancel={() => setPending(null)}
      />
    </section>
  );
}
