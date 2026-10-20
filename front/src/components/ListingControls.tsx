interface ListingControlsProps {
  /** El token tiene una publicación activa. */
  listed: boolean;
  /** Precio actual de la carta = cotización vigente del jugador. */
  price: number;
  /** Bloquea los botones mientras hay una operación en curso. */
  disabled: boolean;
  onPublish: () => void;
  onWithdraw: () => void;
}

/**
 * Controles de venta de una carta del inventario (09-mercado FR-036): la marca «A la venta» y el
 * botón para publicarla o retirarla. Presentacional: la página confirma y llama al servicio.
 */
export function ListingControls({ listed, price, disabled, onPublish, onWithdraw }: ListingControlsProps) {
  return (
    <div className="mt-2 flex items-center justify-between gap-2 text-xs">
      {listed ? (
        <span className="rounded bg-gold/20 px-2 py-0.5 uppercase tracking-wide text-gold-bright">A la venta</span>
      ) : (
        <span className="text-slate-500">{price.toLocaleString('es-AR')} créditos</span>
      )}
      <button
        type="button"
        onClick={listed ? onWithdraw : onPublish}
        disabled={disabled}
        className="bevel bg-navy-card px-3 py-1 text-slate-200 disabled:opacity-40"
      >
        {listed ? 'Retirar' : 'Poner a la venta'}
      </button>
    </div>
  );
}
