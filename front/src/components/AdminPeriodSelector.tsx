import { useState } from 'react';
import type { FormEvent } from 'react';
import { ADMIN_PRESETS, type AdminPreset } from '../pages/admin-period';

interface AdminPeriodSelectorProps {
  /** Nulo cuando se está viendo un rango propio. */
  preset: AdminPreset | null;
  /** El tope de los selectores: no se pueden elegir fechas futuras (FR-039). */
  today: string;
  error: string | null;
  disabled?: boolean;
  onPreset: (preset: AdminPreset) => void;
  onRange: (from: string, to: string) => void;
}

/** Selector de período del panel (11-admin-panel FR-036): atajos y un rango «desde–hasta». */
export function AdminPeriodSelector({ preset, today, error, disabled = false, onPreset, onRange }: AdminPeriodSelectorProps) {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const submit = (event: FormEvent) => {
    event.preventDefault();
    onRange(from, to);
  };

  const fieldClass = 'bevel bg-navy-card px-3 py-1 text-sm text-slate-100 [color-scheme:dark]';

  return (
    <section aria-label="Período" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-4">
        <div role="group" aria-label="Atajos de período" className="flex flex-wrap gap-2">
          {ADMIN_PRESETS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              aria-pressed={preset === key}
              disabled={disabled}
              onClick={() => onPreset(key)}
              className={`bevel px-4 py-1 text-sm disabled:opacity-60 ${
                preset === key ? 'bg-neon-blue/20 text-neon-blue' : 'bg-navy-card text-slate-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <form onSubmit={submit} className="flex flex-wrap items-center gap-2 text-sm text-slate-400">
          <label className="flex items-center gap-2">
            Desde
            <input type="date" value={from} max={today} onChange={(e) => setFrom(e.target.value)} className={fieldClass} />
          </label>
          <label className="flex items-center gap-2">
            Hasta
            <input type="date" value={to} max={today} onChange={(e) => setTo(e.target.value)} className={fieldClass} />
          </label>
          <button type="submit" disabled={disabled} className="bevel bg-navy-card px-4 py-1 text-slate-200 disabled:opacity-60">
            Aplicar
          </button>
        </form>
      </div>

      {error && (
        <p role="alert" className="text-sm text-error-red">
          {error}
        </p>
      )}
    </section>
  );
}
