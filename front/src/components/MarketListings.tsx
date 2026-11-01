import { Link } from 'react-router-dom';
import type { PlayerListing } from '../services/market.service';

export interface MarketListingsProps {
  /** Precio de cada carta = cotización vigente del jugador; nulo si no tiene cotización. */
  price: number | null;
  listings: PlayerListing[];
  page: number;
  totalPages: number;
  /** Saldo del usuario; nulo mientras se carga. */
  balance: number | null;
  loading: boolean;
  error: string | null;
  /** Hay una compra en curso: no se puede iniciar otra (FR-039). */
  busy: boolean;
  /** Resultado de la última compra, con acceso al inventario si fue exitosa (FR-041, FR-042). */
  message: { kind: 'success' | 'error'; text: string } | null;
  onBuy: (listing: PlayerListing) => void;
  onPage: (page: number) => void;
}

/**
 * Bloque de compra del panel de detalle (09-mercado FR-038 a FR-042): las cartas a la venta del
 * jugador, de la más antigua a la más nueva, con «Comprar» en las ajenas y «Tuya» en las propias.
 * No tiene selector de cantidad: cada compra es de una carta. Presentacional: la página confirma
 * y llama al servicio.
 */
export function MarketListings({
  price,
  listings,
  page,
  totalPages,
  balance,
  loading,
  error,
  busy,
  message,
  onBuy,
  onPage,
}: MarketListingsProps) {
  const cantAfford = price !== null && balance !== null && balance < price;

  return (
    <section className="rounded border border-white/10 p-3" aria-label="Compra de cartas">
      <div className="mb-2 flex items-baseline justify-between">
        <h3 className="title-display text-xs text-slate-300">Cartas a la venta</h3>
        {price !== null && <span className="text-xs text-gold-bright">{price.toLocaleString('es-AR')} créditos c/u</span>}
      </div>

      {message && (
        <div role={message.kind === 'error' ? 'alert' : 'status'} className="mb-2 text-xs">
          <p className={message.kind === 'error' ? 'text-error-red' : 'text-neon-green'}>{message.text}</p>
          {message.kind === 'success' && (
            <Link to="/inventory" className="text-neon-blue underline">
              Ir a mis cartas
            </Link>
          )}
        </div>
      )}

      {loading && <p className="text-xs text-slate-400">Cargando cartas a la venta…</p>}
      {!loading && error && <p className="text-xs text-error-red">{error}</p>}

      {!loading && !error && listings.length === 0 && (
        <p className="text-xs text-slate-500">No hay cartas de este jugador a la venta.</p>
      )}

      {!loading && !error && listings.length > 0 && (
        <>
          {cantAfford && <p className="mb-2 text-xs text-slate-400">Tu saldo no alcanza para comprar una carta.</p>}
          <ul className="space-y-1">
            {listings.map((listing) => (
              <li key={listing.listingId} className="flex items-center justify-between text-sm">
                <span className="text-slate-200">#{listing.serial}</span>
                {listing.mine ? (
                  <span className="text-xs uppercase tracking-wide text-slate-500">Tuya</span>
                ) : (
                  <button
                    type="button"
                    onClick={() => onBuy(listing)}
                    disabled={busy || cantAfford || price === null}
                    className="bevel bg-neon-blue/20 px-3 py-1 text-xs text-neon-blue disabled:opacity-40"
                  >
                    Comprar
                  </button>
                )}
              </li>
            ))}
          </ul>
          {totalPages > 1 && (
            <nav className="mt-2 flex items-center justify-between text-xs" aria-label="Páginas de cartas a la venta">
              <button type="button" onClick={() => onPage(page - 1)} disabled={page <= 1} className="disabled:opacity-40">
                Anterior
              </button>
              <span className="text-slate-400">
                {page} / {totalPages}
              </span>
              <button
                type="button"
                onClick={() => onPage(page + 1)}
                disabled={page >= totalPages}
                className="disabled:opacity-40"
              >
                Siguiente
              </button>
            </nav>
          )}
        </>
      )}
    </section>
  );
}
