import { PlayerCard } from './player-card/PlayerCard';
import { toPlayerCardData } from '../services/player-card.mapper';
import type { ApiPlayerCard } from '../services/players.service';

interface PlayerGridProps {
  players: ApiPlayerCard[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

/**
 * Grilla de cartas. Usa el componente `PlayerCard` existente tal cual (FR-020): acá solo se
 * lo posiciona y se le pasa el jugador ya mapeado.
 */
export function PlayerGrid({ players, selectedId, onSelect }: PlayerGridProps) {
  return (
    <ul
      className="grid list-none grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-5 p-0"
      aria-label="Jugadores del mercado"
    >
      {players.map((player) => (
        <li
          key={player.id}
          data-selected={player.id === selectedId ? 'true' : undefined}
          className="rounded-xl transition-transform data-[selected=true]:scale-[1.02] data-[selected=true]:outline data-[selected=true]:outline-2 data-[selected=true]:outline-neon-blue"
        >
          <PlayerCard player={toPlayerCardData(player)} onClick={() => onSelect(player.id)} />
        </li>
      ))}
    </ul>
  );
}
