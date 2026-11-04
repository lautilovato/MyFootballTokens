import type { AdminMetrics } from '../services/admin.service';

interface AdminReconciliationProps {
  reconciliation: AdminMetrics['reconciliation'];
}

const n = (value: number) => value.toLocaleString('es-AR');

function Check({ title, ok, detail }: { title: string; ok: boolean; detail: string }) {
  return (
    <div role={ok ? undefined : 'alert'} className={`bevel flex-1 bg-navy-card p-4 ${ok ? '' : 'ring-1 ring-error-red'}`}>
      <p className={`title-display text-sm ${ok ? 'text-neon-green' : 'text-error-red'}`}>
        {title}: {ok ? 'cierra' : 'no cierra'}
      </p>
      <p className="mt-1 text-xs text-slate-400">{detail}</p>
    </div>
  );
}

/** Comprueba que cartas y créditos cierran, sobre toda la historia. Solo avisa (11-admin-panel FR-025). */
export function AdminReconciliation({ reconciliation: { cards, credits } }: AdminReconciliationProps) {
  const cardsDetail = cards.ok
    ? 'Los estados suman las cartas emitidas y cada jugador tiene 100.'
    : `Diferencia de ${n(cards.difference)} cartas. Jugadores sin 100 tokens: ${n(cards.affectedPlayers)}.`;
  const creditsDetail = credits.ok
    ? 'Lo emitido menos lo cobrado coincide con los saldos.'
    : `Se esperaban ${n(credits.expected)} créditos y hay ${n(credits.actual)}: diferencia de ${n(credits.difference)}.`;

  return (
    <div className="flex flex-col gap-3 sm:flex-row">
      <Check title="Cartas" ok={cards.ok} detail={cardsDetail} />
      <Check title="Créditos" ok={credits.ok} detail={creditsDetail} />
    </div>
  );
}
