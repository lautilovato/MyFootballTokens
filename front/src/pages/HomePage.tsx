import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useCredits } from '../app/useCredits';
import { AppHeader } from '../components/AppHeader';
import { ConfirmModal } from '../components/confirm-modal/ConfirmModal';
import type { MarketListingsProps } from '../components/MarketListings';
import { MarketFilters } from '../components/MarketFilters';
import { PlayerDetailPanel } from '../components/PlayerDetailPanel';
import { PlayerGrid } from '../components/PlayerGrid';
import { PriceHistoryModal } from '../components/PriceHistoryModal';
import {
  fetchPlayerListings,
  marketErrorMessage,
  purchaseListing,
  type PlayerListing,
  type PlayerListingsPage,
} from '../services/market.service';
import { extractApiErrorCode } from '../services/packs.service';
import { strategyLabel } from '../services/quote.mapper';
import { fetchCurrentQuote } from '../services/quotes.service';
import { useAuth } from '../services/useAuth';
import {
  fetchLeagues,
  fetchPlayerDetail,
  fetchPlayers,
  type ApiPlayerDetail,
  type League,
  type PlayerFilters,
  type PlayersPage,
} from '../services/players.service';
import {
  SELECTED_PARAM,
  filtersFromParams,
  hasActiveFilters,
  nextFilters,
  paramsFromFilters,
} from './home-filters';
import { usePriceHistory } from './usePriceHistory';

/** Cartas a la venta por página en el panel de detalle (09-mercado FR-027). */
export const LISTINGS_PAGE_SIZE = 10;

/**
 * Home de mercado (06-home). Orquesta: no implementa lógica de negocio ni habla con la red
 * por su cuenta — todo el tráfico pasa por `services/` (constitución §7).
 *
 * El estado de filtros, página y jugador seleccionado vive en la URL (research #10). La compra
 * de una carta (09-mercado US2) se confirma acá y, al terminar, se refrescan el saldo, las cartas
 * a la venta del detalle y el listado del Market (FR-041).
 */
export default function HomePage() {
  const { user, logout } = useAuth();
  const { balance, refresh: refreshBalance } = useCredits();
  const [searchParams, setSearchParams] = useSearchParams();

  const filters = useMemo(() => filtersFromParams(searchParams), [searchParams]);
  const selectedId = searchParams.get(SELECTED_PARAM);

  const [page, setPage] = useState<PlayersPage | null>(null);
  const [leagues, setLeagues] = useState<League[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [detail, setDetail] = useState<ApiPlayerDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const [listings, setListings] = useState<PlayerListingsPage | null>(null);
  const [listingsPage, setListingsPage] = useState(1);
  const [listingsLoading, setListingsLoading] = useState(false);
  const [listingsError, setListingsError] = useState<string | null>(null);
  const [pendingBuy, setPendingBuy] = useState<PlayerListing | null>(null);
  const [buying, setBuying] = useState(false);
  const [buyMessage, setBuyMessage] = useState<MarketListingsProps['message']>(null);
  // Estrategia de la cotización vigente del jugador abierto (10-historial-operaciones FR-020).
  const [quoteLabel, setQuoteLabel] = useState<string | null>(null);
  const priceHistory = usePriceHistory();
  // Se incrementan para volver a pedir el listado del Market y las cartas a la venta (FR-041).
  const [marketVersion, setMarketVersion] = useState(0);
  const [listingsVersion, setListingsVersion] = useState(0);

  // Clave estable del conjunto de filtros: evita relanzar la búsqueda cuando lo único que
  // cambió en la URL es el jugador abierto en el panel.
  const filtersKey = useMemo(() => paramsFromFilters(filters).toString(), [filters]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchPlayers(filters)
      .then((result) => {
        if (!cancelled) setPage(result);
      })
      .catch((err: unknown) => {
        // El 401 lo maneja el interceptor de Axios: acá solo llegan los demás.
        if (!cancelled) setError(describeError(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtersKey, marketVersion]);

  useEffect(() => {
    fetchLeagues()
      .then(setLeagues)
      .catch(() => setLeagues([])); // El panel se muestra igual, sin la sección de ligas.
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      setDetailError(null);
      return;
    }

    let cancelled = false;
    setDetailLoading(true);
    setDetailError(null);

    fetchPlayerDetail(selectedId)
      .then((result) => {
        if (!cancelled) setDetail(result);
      })
      .catch((err: unknown) => {
        if (!cancelled) setDetailError(describeError(err));
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  // La línea «Cotizado con …» del panel es opcional: si el pedido falla, el panel sigue igual.
  useEffect(() => {
    setQuoteLabel(null);
    if (!selectedId) return;

    let cancelled = false;
    fetchCurrentQuote(selectedId)
      .then((quote) => {
        if (!cancelled) setQuoteLabel(quote ? strategyLabel(quote.strategy) : null);
      })
      .catch(() => {
        if (!cancelled) setQuoteLabel(null);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  // Al cambiar de jugador, la lista de cartas a la venta vuelve a su primera página.
  useEffect(() => {
    setListingsPage(1);
    setBuyMessage(null);
  }, [selectedId]);

  useEffect(() => {
    if (!selectedId) {
      setListings(null);
      return;
    }

    let cancelled = false;
    setListingsLoading(true);
    setListingsError(null);

    fetchPlayerListings(selectedId, listingsPage, LISTINGS_PAGE_SIZE)
      .then((result) => {
        if (!cancelled) setListings(result);
      })
      .catch(() => {
        if (!cancelled) setListingsError('No se pudieron cargar las cartas a la venta.');
      })
      .finally(() => {
        if (!cancelled) setListingsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedId, listingsPage, listingsVersion]);

  /**
   * Confirmada la compra (FR-039): se compra al precio que vio el usuario. Pase lo que pase se
   * vuelven a pedir el saldo y las cartas a la venta, y tras un éxito también el Market (FR-041,
   * FR-042).
   */
  const confirmBuy = useCallback(async () => {
    if (!pendingBuy || listings?.price == null) return;
    const listing = pendingBuy;
    const price = listings.price;
    setPendingBuy(null);
    setBuying(true);
    setBuyMessage(null);
    try {
      const bought = await purchaseListing(listing.listingId, price);
      setBuyMessage({
        kind: 'success',
        text: `Compraste la carta #${bought.serial} por ${bought.price.toLocaleString('es-AR')} créditos.`,
      });
      setMarketVersion((v) => v + 1);
    } catch (err) {
      setBuyMessage({ kind: 'error', text: marketErrorMessage(extractApiErrorCode(err)) });
    } finally {
      setBuying(false);
      setListingsVersion((v) => v + 1);
      await refreshBalance();
    }
  }, [pendingBuy, listings, refreshBalance]);

  const applyFilters = useCallback(
    (incoming: PlayerFilters) => {
      // Cambiar un filtro vuelve a la página 1; cambiar de página no (US2 §7).
      setSearchParams(paramsFromFilters(nextFilters(filters, incoming), selectedId));
    },
    [filters, selectedId, setSearchParams],
  );

  const goToPage = useCallback(
    (nextPage: number) => {
      setSearchParams(paramsFromFilters({ ...filters, page: nextPage }, selectedId));
    },
    [filters, selectedId, setSearchParams],
  );

  // Abrir y cerrar el panel solo toca el parámetro del jugador: los filtros y la página
  // quedan donde estaban, que es lo que pide FR-022.
  const selectPlayer = useCallback(
    (id: string) => setSearchParams(paramsFromFilters(filters, id)),
    [filters, setSearchParams],
  );
  const closePanel = useCallback(
    () => setSearchParams(paramsFromFilters(filters, null)),
    [filters, setSearchParams],
  );

  const currentPage = page?.meta.page ?? filters.page ?? 1;
  const totalPages = page?.meta.totalPages ?? 0;

  return (
    <main className="min-h-screen bg-navy-deep text-slate-200">
      {/* 08-sobres FR-052, FR-053: accesos a sobres e inventario y saldo. */}
      <AppHeader username={user?.username} balance={balance} onLogout={logout} isAdmin={user?.role === 'admin'} />

      <div className="flex flex-col gap-6 p-6 md:flex-row">
        <MarketFilters leagues={leagues} filters={filters} onChange={applyFilters} />

        <section className="min-w-0 flex-1">
          {loading && <p className="py-12 text-center text-slate-400">Cargando jugadores…</p>}

          {error && !loading && (
            <div className="py-12 text-center">
              <p className="text-error-red">{error}</p>
              <button
                onClick={() => goToPage(currentPage)}
                className="bevel mt-3 bg-navy-card px-4 py-2 text-sm"
              >
                Reintentar
              </button>
            </div>
          )}

          {!loading && !error && page?.data.length === 0 && hasActiveFilters(filters) && (
            <div className="py-12 text-center">
              <p className="title-display text-slate-300">Sin resultados</p>
              <p className="mt-1 text-sm text-slate-500">
                Ningún jugador cumple con los filtros aplicados. Probá quitando alguno.
              </p>
            </div>
          )}

          {/* 08-sobres FR-070: el Market solo muestra cartas a la venta, y arranca vacío. */}
          {!loading && !error && page?.data.length === 0 && !hasActiveFilters(filters) && (
            <div className="py-12 text-center">
              <p className="title-display text-slate-300">Todavía no hay cartas a la venta</p>
              <p className="mt-1 text-sm text-slate-500">
                Las primeras cartas salen de los sobres.
              </p>
              <Link to="/packs" className="bevel mt-4 inline-block bg-neon-blue/20 px-5 py-2 text-neon-blue">
                Ir a sobres
              </Link>
            </div>
          )}

          {!loading && !error && page && page.data.length > 0 && (
            <>
              <p className="mb-4 text-xs text-slate-500">
                {page.meta.total} jugadores · página {currentPage} de {totalPages}
              </p>

              <PlayerGrid players={page.data} selectedId={selectedId} onSelect={selectPlayer} />

              <nav className="mt-6 flex items-center justify-center gap-4" aria-label="Paginación">
                <button
                  onClick={() => goToPage(currentPage - 1)}
                  disabled={currentPage <= 1}
                  className="bevel bg-navy-card px-4 py-2 text-sm disabled:opacity-40"
                >
                  Anterior
                </button>
                <span className="text-sm text-slate-400">
                  {currentPage} / {totalPages}
                </span>
                <button
                  onClick={() => goToPage(currentPage + 1)}
                  disabled={currentPage >= totalPages}
                  className="bevel bg-navy-card px-4 py-2 text-sm disabled:opacity-40"
                >
                  Siguiente
                </button>
              </nav>
            </>
          )}
        </section>

        {selectedId && (
          <PlayerDetailPanel
            player={detail}
            loading={detailLoading}
            error={detailError}
            onClose={closePanel}
            priceHistoryView={
              detail ? { quoteLabel, onOpen: () => priceHistory.openFor(detail.id, detail.name) } : null
            }
            market={{
              price: listings?.price ?? null,
              listings: listings?.data ?? [],
              page: listings?.meta.page ?? listingsPage,
              totalPages: listings?.meta.totalPages ?? 0,
              balance,
              loading: listingsLoading && !listings,
              error: listingsError,
              busy: buying || pendingBuy !== null,
              message: buyMessage,
              onBuy: setPendingBuy,
              onPage: setListingsPage,
            }}
          />
        )}
      </div>

      <PriceHistoryModal
        open={priceHistory.state.open}
        playerName={priceHistory.state.playerName}
        quotes={priceHistory.state.quotes}
        loading={priceHistory.state.loading}
        error={priceHistory.state.error}
        selectedIndex={priceHistory.state.selectedIndex}
        highlightIndex={priceHistory.state.highlightIndex}
        onSelect={priceHistory.select}
        onRetry={priceHistory.retry}
        onClose={priceHistory.close}
        filters={priceHistory.filters}
      />

      <ConfirmModal
        open={pendingBuy !== null}
        title="Comprar carta"
        description={pendingBuy ? describePurchase(detail?.name, pendingBuy, listings?.price ?? null, balance) : undefined}
        confirmLabel="Comprar"
        onConfirm={() => void confirmBuy()}
        onCancel={() => setPendingBuy(null)}
      />
    </main>
  );
}

/** Confirmación de una compra: la carta, el precio y el saldo que quedaría (FR-039). */
function describePurchase(name: string | undefined, listing: PlayerListing, price: number | null, balance: number | null): string {
  const card = `${name ?? 'Carta'} #${listing.serial}`;
  if (price === null) return card;
  const after = balance === null ? '' : ` Te quedarían ${(balance - price).toLocaleString('es-AR')} créditos.`;
  return `${card} cuesta ${price.toLocaleString('es-AR')} créditos.${after}`;
}

function describeError(err: unknown): string {
  const status = (err as { response?: { status?: number } })?.response?.status;
  if (status === 400) return 'Alguno de los filtros no es válido. Revisá los rangos.';
  return 'No se pudo cargar el mercado. Intentá de nuevo en unos segundos.';
}
