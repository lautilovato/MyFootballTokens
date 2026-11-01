import { PlayerCard } from './player-card/PlayerCard';
import { toPlayerCardData } from '../services/player-card.mapper';
import type { RankingEntry } from '../services/ranking.service';

interface RankingPodiumProps {
  /** Los tres primeros del ranking, o menos si no hay más cotizados. */
  entries: RankingEntry[];
}

/** Lugar de cada puesto: en pantallas chicas el 1 va arriba; desde `sm`, al centro y más alto. */
const STEPS: Record<number, { place: string; plinth: string; number: string }> = {
  1: {
    place: 'col-span-2 mx-auto w-full max-w-72 sm:col-span-1 sm:col-start-2 sm:max-w-none',
    plinth: 'border-gold-bright from-gold/35 sm:h-40',
    number: 'text-6xl text-gold-bright',
  },
  2: {
    place: 'sm:col-start-1',
    plinth: 'border-silver from-silver/25 sm:h-32',
    number: 'text-5xl text-silver',
  },
  3: {
    place: 'sm:col-start-3',
    plinth: 'border-bronze from-bronze/30 sm:h-24',
    number: 'text-4xl text-bronze',
  },
};

/**
 * Podio de los tres jugadores más caros (13-ranking FR-008). El HTML sigue el orden del ranking;
 * la grilla es la que acomoda al 2 a la izquierda y al 3 a la derecha del 1.
 */
export function RankingPodium({ entries }: RankingPodiumProps) {
  return (
    <ol aria-label="Podio" className="mx-auto grid max-w-4xl list-none grid-cols-2 items-end gap-3 p-0 sm:grid-cols-[1fr_1.2fr_1fr] sm:gap-0">
      {entries.map(({ rank, player }) => {
        const step = STEPS[rank];
        return (
          <li key={player.id} className={`sm:row-start-1 ${step.place}`}>
            <PlayerCard player={toPlayerCardData(player)} />
            <div className={`flex flex-col items-center justify-center border-t-2 bg-linear-to-b to-navy-card py-3 ${step.plinth}`}>
              <span className={`title-display leading-none ${step.number}`}>{rank}</span>
              <span className="mt-1 text-sm font-semibold text-slate-100">{player.marketValue.toLocaleString('es-AR')} créditos</span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
