interface ListingControlsProps {
  /** El token tiene una publicación activa. */
  listed: boolean;
  /** Precio actual de la carta = cotización vigente del jugador. */
  price: number;
  /** Bloquea los botones mientras hay una operación en curso. */
  disabled: boolean;
  /** Va en el panel de detalle: dice «Vender» y se ve como el «Comprar» del Market. */
  inPanel?: boolean;
  onPublish: () => void;
  onWithdraw: () => void;
}

/**
 * Controles de venta de una carta del inventario (09-mercado FR-036): la marca «A la venta» y el
 * botón para publicarla o retirarla. Presentacional: la página confirma y llama al servicio.
 */
export function ListingControls({ listed, price, disabled, inPanel = false, onPublish, onWithdraw }: ListingControlsProps) {
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
        className={`bevel px-3 py-1 disabled:opacity-40 ${inPanel ? 'bg-neon-blue/20 text-neon-blue' : 'bg-navy-card text-slate-200'}`}
      >
        {listed ? 'Retirar' : inPanel ? 'Vender' : 'Poner a la venta'}
      </button>
    </div>
  );
}
