import { useState, type ReactNode } from 'react';
import {
  POSITIONS,
  RARITIES,
  type League,
  type PlayerFilters,
  type Position,
  type Rarity,
} from '../services/players.service';

interface MarketFiltersProps {
  leagues: League[];
  filters: PlayerFilters;
  onChange: (next: PlayerFilters) => void;
}

const RARITY_LABELS: Record<Rarity, string> = {
  legendary: 'Legendary',
  epic: 'Epic',
  rare: 'Rare',
  common: 'Common',
};

/** Alterna la presencia de un valor en un filtro de selección múltiple. */
function toggle<T>(values: T[] | undefined, value: T): T[] | undefined {
  const current = values ?? [];
  const next = current.includes(value)
    ? current.filter((v) => v !== value)
    : [...current, value];
  return next.length > 0 ? next : undefined;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <section className="border-b border-white/10 py-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="title-display flex w-full items-center justify-between text-sm text-slate-200"
      >
        {title}
        <span aria-hidden="true">{open ? '▲' : '▼'}</span>
      </button>
      {open && <div className="mt-3">{children}</div>}
    </section>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`bevel px-3 py-1 text-xs transition-colors ${
        active
          ? 'bg-neon-blue text-navy-deep'
          : 'bg-navy-card text-slate-300 hover:text-slate-100'
      }`}
    >
      {children}
    </button>
  );
}

/**
 * Panel de filtros del mercado (FR-021). No habla con la red: recibe las ligas ya cargadas y
 * emite el filtro completo hacia arriba, que es quien lo sincroniza con la URL (research #10).
 */
export function MarketFilters({ leagues, filters, onChange }: MarketFiltersProps) {
  const patch = (partial: Partial<PlayerFilters>) => onChange({ ...filters, ...partial });

  const numberOrUndefined = (raw: string): number | undefined =>
    raw.trim() === '' ? undefined : Number(raw);

  return (
    <aside className="w-full shrink-0 md:w-64" aria-label="Filtros de mercado">
      <h2 className="title-display mb-2 text-lg text-slate-100">Market Filters</h2>

      <label className="block">
        <span className="sr-only">Buscar jugador por nombre</span>
        <input
          type="search"
          value={filters.search ?? ''}
          onChange={(e) => patch({ search: e.target.value || undefined })}
          placeholder="Buscar jugador…"
          className="bevel w-full bg-navy-card px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500"
        />
      </label>

      <Section title="Leagues">
        <div className="flex flex-col gap-2">
          {leagues.length === 0 && <p className="text-xs text-slate-500">Sin ligas cargadas</p>}
          {leagues.map((league) => (
            <label key={league.id} className="flex items-center gap-2 text-sm text-slate-300">
              <input
                type="checkbox"
                checked={filters.league?.includes(league.name) ?? false}
                onChange={() => patch({ league: toggle(filters.league, league.name) })}
              />
              {league.name}
            </label>
          ))}
        </div>
      </Section>

      <Section title="Positions">
        <div className="flex flex-wrap gap-2">
          {POSITIONS.map((position: Position) => (
            <Chip
              key={position}
              active={filters.position?.includes(position) ?? false}
              onClick={() => patch({ position: toggle(filters.position, position) })}
            >
              {position}
            </Chip>
          ))}
        </div>
      </Section>

      <Section title="Rarity">
        <div className="flex flex-wrap gap-2">
          {RARITIES.map((rarity) => (
            <Chip
              key={rarity}
              active={filters.rarity?.includes(rarity) ?? false}
              onClick={() => patch({ rarity: toggle(filters.rarity, rarity) })}
            >
              {RARITY_LABELS[rarity]}
            </Chip>
          ))}
        </div>
      </Section>

      <Section title="Price range">
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={0}
            value={filters.minValue ?? ''}
            onChange={(e) => patch({ minValue: numberOrUndefined(e.target.value) })}
            aria-label="Valor mínimo"
            placeholder="Mín"
            className="bevel w-full bg-navy-card px-2 py-1 text-sm text-slate-100"
          />
          <span className="text-slate-500">–</span>
          <input
            type="number"
            min={0}
            value={filters.maxValue ?? ''}
            onChange={(e) => patch({ maxValue: numberOrUndefined(e.target.value) })}
            aria-label="Valor máximo"
            placeholder="Máx"
            className="bevel w-full bg-navy-card px-2 py-1 text-sm text-slate-100"
          />
        </div>
      </Section>

      <Section title="Stats range (OVR)">
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={0}
            max={99}
            value={filters.minOvr ?? ''}
            onChange={(e) => patch({ minOvr: numberOrUndefined(e.target.value) })}
            aria-label="OVR mínimo"
            placeholder="70"
            className="bevel w-full bg-navy-card px-2 py-1 text-sm text-slate-100"
          />
          <span className="text-slate-500">–</span>
          <input
            type="number"
            min={0}
            max={99}
            value={filters.maxOvr ?? ''}
            onChange={(e) => patch({ maxOvr: numberOrUndefined(e.target.value) })}
            aria-label="OVR máximo"
            placeholder="99"
            className="bevel w-full bg-navy-card px-2 py-1 text-sm text-slate-100"
          />
        </div>
      </Section>
    </aside>
  );
}
