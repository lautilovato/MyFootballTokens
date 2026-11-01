import type { RankingEntry } from '../services/ranking.service';

interface RankingListProps {
  /** Los puestos que siguen al podio. */
  entries: RankingEntry[];
}

/** Resto del top en filas, para leer de un vistazo puesto, jugador y precio (13-ranking FR-008). */
export function RankingList({ entries }: RankingListProps) {
  return (
    <ol aria-label="Resto del top" start={entries[0].rank} className="mx-auto max-w-4xl list-none space-y-2 p-0">
      {entries.map(({ rank, player }) => (
        <li key={player.id} className="bevel flex items-center gap-3 bg-navy-card px-5 py-3 sm:gap-4">
          <span className="title-display w-7 shrink-0 text-center text-xl text-slate-400">{rank}</span>
          {player.imageUrl ? (
            <img src={player.imageUrl} alt="" className="size-11 shrink-0 rounded-full bg-navy object-cover object-top" />
          ) : (
            <span aria-hidden="true" className="title-display grid size-11 shrink-0 place-items-center rounded-full bg-navy text-slate-500">
              {player.name[0]}
            </span>
          )}
          <span className="min-w-0 flex-1">
            <span className="block truncate font-semibold text-slate-100">{player.name}</span>
            <span className="block truncate text-xs text-slate-400">{player.club.name}</span>
          </span>
          {player.ovr !== null && <span className="hidden shrink-0 text-xs text-slate-400 sm:block">OVR {player.ovr}</span>}
          <span className="shrink-0 text-right text-sm font-semibold text-gold-bright sm:w-32">
            {player.marketValue.toLocaleString('es-AR')} <span className="hidden font-normal sm:inline">créditos</span>
          </span>
        </li>
      ))}
    </ol>
  );
}
