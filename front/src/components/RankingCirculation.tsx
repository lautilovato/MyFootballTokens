interface RankingCirculationRow {
  rank: number;
  name: string;
  inCirculation: number;
  /** Cartas emitidas del jugador. */
  total: number;
}

interface RankingCirculationProps {
  rows: RankingCirculationRow[];
}

/** Cuántas cartas de cada jugador del top están en circulación (13-ranking FR-005). */
export function RankingCirculation({ rows }: RankingCirculationProps) {
  return (
    <section aria-labelledby="ranking-circulation-title" className="bevel mx-auto max-w-4xl bg-navy-card p-6">
      <h2 id="ranking-circulation-title" className="title-display text-xl text-slate-100">
        Cartas en circulación
      </h2>
      <p className="mt-1 text-xs text-slate-500">Las que ya salieron de los sobres y están en poder de usuarios.</p>

      <ul className="mt-4 space-y-3">
        {rows.map(({ rank, name, inCirculation, total }) => (
          <li key={rank} className="grid grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 text-sm sm:grid-cols-[2rem_minmax(0,14rem)_minmax(0,1fr)_5.5rem]">
            <span className="text-slate-500">{rank}</span>
            <span className="truncate text-slate-200">{name}</span>
            <span className="text-right font-semibold text-gold-bright sm:col-start-4 sm:row-start-1">
              {inCirculation} de {total}
            </span>
            <span
              aria-hidden="true"
              className="col-span-full h-1.5 overflow-hidden rounded-full bg-white/10 sm:col-span-1 sm:col-start-3 sm:row-start-1"
            >
              <span className="block h-full rounded-full bg-neon-blue" style={{ width: `${(inCirculation / total) * 100}%` }} />
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
