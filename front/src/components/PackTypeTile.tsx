import { Pack } from './pack/Pack';
import type { PackData } from './pack/types';

export interface PackOdds {
  common: number;
  rare: number;
  epic: number;
  legendary: number;
}

interface PackTypeTileProps {
  pack: PackData;
  price: number;
  /** Composición de los sobres sin abrir; nula si el tipo está agotado. */
  probabilities: PackOdds | null;
  remaining: number;
  /** Motivo por el que no se puede abrir («Agotado», «Saldo insuficiente»); nulo si se puede. */
  disabledReason: string | null;
  onOpenRequest: () => Promise<boolean>;
  onOpened: () => void;
}

const RARITY_LABELS: [keyof PackOdds, string][] = [
  ['common', 'Common'],
  ['rare', 'Rare'],
  ['epic', 'Epic'],
  ['legendary', 'Legendary'],
];

function percent(value: number): string {
  const pct = value * 100;
  return `${pct >= 10 || pct === 0 ? pct.toFixed(0) : pct.toFixed(1)} %`;
}

/**
 * Un tipo de sobre de la pantalla de sobres (08-sobres FR-054, FR-055): el sobre animado, su
 * precio, las probabilidades por rareza y cuántos quedan. Presentacional: no accede a la red.
 */
export function PackTypeTile({
  pack,
  price,
  probabilities,
  remaining,
  disabledReason,
  onOpenRequest,
  onOpened,
}: PackTypeTileProps) {
  return (
    <article className="flex flex-col items-center gap-3" aria-label={`Sobre ${pack.name}`}>
      <div className={`w-48 ${disabledReason ? 'opacity-50 grayscale' : ''}`}>
        <Pack pack={pack} openable={disabledReason === null} onOpenRequest={onOpenRequest} onOpened={onOpened} />
      </div>
      <p className="title-display text-lg text-gold-bright">{price.toLocaleString('es-AR')} créditos</p>
      <p className="text-xs text-slate-400">
        {pack.cardCount} cartas · {remaining.toLocaleString('es-AR')} sin abrir
      </p>
      {probabilities ? (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs" aria-label="Probabilidades por rareza">
          {RARITY_LABELS.map(([key, label]) => (
            <div key={key} className="contents">
              <dt className="text-slate-400">{label}</dt>
              <dd className="text-right text-slate-200">{percent(probabilities[key])}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {disabledReason ? (
        <p role="status" className="text-sm font-semibold text-error-red">
          {disabledReason}
        </p>
      ) : null}
    </article>
  );
}
