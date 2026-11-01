import { Link } from 'react-router-dom';
import { PlayerCard } from './player-card/PlayerCard';
import type { PlayerCardData } from './player-card/types';

export interface RevealedCard {
  key: string;
  card: PlayerCardData;
}

interface PackRevealProps {
  cards: RevealedCard[];
  onOpenAnother: () => void;
}

/**
 * Las cartas que salieron de un sobre (08-sobres FR-058, FR-059): exactamente las que informó
 * la apertura, y los dos caminos para seguir. El saldo ya actualizado está en el encabezado.
 */
export function PackReveal({ cards, onOpenAnother }: PackRevealProps) {
  return (
    <section aria-label="Cartas obtenidas" className="flex flex-col items-center gap-6">
      <h2 className="title-display text-2xl text-neon-blue">¡Te tocaron {cards.length} cartas!</h2>
      <ul className="flex flex-wrap justify-center gap-6">
        {cards.map(({ key, card }) => (
          <li key={key} className="w-56">
            <PlayerCard player={card} />
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap justify-center gap-3">
        <button onClick={onOpenAnother} className="bevel bg-neon-blue/20 px-5 py-2 text-neon-blue">
          Abrir otro
        </button>
        <Link to="/inventory" className="bevel bg-navy-card px-5 py-2 text-slate-200">
          Ir a mis cartas
        </Link>
      </div>
    </section>
  );
}
