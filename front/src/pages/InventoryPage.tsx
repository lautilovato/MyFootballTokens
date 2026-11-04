import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AppHeader } from '../components/AppHeader';
import { ConfirmModal } from '../components/confirm-modal/ConfirmModal';
import { ListingControls } from '../components/ListingControls';
import { PlayerCard } from '../components/player-card/PlayerCard';
import { PlayerDetailPanel } from '../components/PlayerDetailPanel';
import { PriceHistoryModal } from '../components/PriceHistoryModal';
import { useCredits } from '../app/useCredits';
import {
  getInventory,
  type InventoryItem,
  type InventoryPage as InventoryPageData,
  type InventoryToken,
} from '../services/inventory.service';
import { marketErrorMessage, publishListing, withdrawListing } from '../services/market.service';
import { extractApiErrorCode } from '../services/packs.service';
import { toInventoryCard } from '../services/pack.mapper';
import { useAuth } from '../services/useAuth';
import { usePlayerDetail } from './usePlayerDetail';
import { usePriceHistory } from './usePriceHistory';

export const INVENTORY_PAGE_SIZE = 12;

/** Una carta del inventario, con el jugador al que pertenece. */
interface OwnedCard {
  item: InventoryItem;
  token: InventoryToken;
}

/** Una publicación o un retiro esperando confirmación (FR-037). */
interface PendingAction extends OwnedCard {
  kind: 'publish' | 'withdraw';
}

const describeDetailError = () => 'No se pudo cargar el detalle del jugador.';

/**
 * Pantalla de inventario (08-sobres US6, 09-mercado US1): las cartas que el usuario posee hoy, en
 * el orden que las devuelve el backend (reputación descendente, FR-063), con la cotización
 * vigente de cada jugador. Cada carta se puede poner a la venta o retirar (09 FR-036, FR-037), y
 * al tocarla se abre el mismo detalle que en el Market, con la venta en lugar de la compra
 * (14-detalle-inventario).
 */
export default function InventoryPage() {
  const { user, logout } = useAuth();
  const { balance } = useCredits();
  const [page, setPage] = useState(1);
  const [data, setData] = useState<InventoryPageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [selectedTokenId, setSelectedTokenId] = useState<string | null>(null);

  // Se busca en cada render: al recargar, la carta abierta muestra su estado de venta real.
  const selected =
    data?.data.flatMap((item) => item.tokens.map((token) => ({ item, token }))).find(({ token }) => token.id === selectedTokenId) ?? null;
  const { detail, loading: detailLoading, error: detailError, quoteLabel } = usePlayerDetail(
    selected?.item.player.id ?? null,
    describeDetailError,
  );
  const priceHistory = usePriceHistory();

  const load = useCallback(async (target: number) => {
    setLoading(true);
    setError(null);
    try {
      setData(await getInventory(target, INVENTORY_PAGE_SIZE));
    } catch {
      setError('No se pudo cargar tu inventario. Intentá de nuevo en unos segundos.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setSelectedTokenId(null);
    void load(page);
  }, [load, page]);

  /** Confirmada la acción: publica o retira y recarga el inventario con los valores reales. */
  const confirm = useCallback(async () => {
    if (!pending) return;
    const action = pending;
    setPending(null);
    setBusy(true);
    setActionError(null);
    try {
      if (action.kind === 'publish') await publishListing(action.token.id);
      else await withdrawListing(action.token.listingId!);
    } catch (err) {
      setActionError(marketErrorMessage(extractApiErrorCode(err)));
    } finally {
      setBusy(false);
      await load(page);
    }
  }, [pending, load, page]);

  const totalPages = data?.meta.totalPages ?? 0;
  const totalCards = data?.data.reduce((sum, item) => sum + item.count, 0) ?? 0;

  const listingControls = ({ item, token }: OwnedCard, inPanel?: boolean) => (
    <ListingControls
      listed={token.listingId !== null}
      price={item.player.marketValue}
      disabled={busy || loading}
      inPanel={inPanel}
      onPublish={() => setPending({ kind: 'publish', item, token })}
      onWithdraw={() => setPending({ kind: 'withdraw', item, token })}
    />
  );

  return (
    <main className="min-h-screen bg-navy-deep text-slate-200">
      <AppHeader username={user?.username} balance={balance} onLogout={logout} isAdmin={user?.role === 'admin'} />

      <div className="mx-auto max-w-6xl p-6">
        <section>
          <h1 className="title-display mb-6 text-3xl text-slate-100">Mis cartas</h1>

          {actionError && (
            <p role="alert" className="mb-4 text-center text-sm text-error-red">
              {actionError}
            </p>
          )}

          {loading && !data && <p className="py-12 text-center text-slate-400">Cargando tus cartas…</p>}

          {!loading && error && (
            <div className="py-12 text-center">
              <p className="text-error-red">{error}</p>
              <button onClick={() => void load(page)} className="bevel mt-3 bg-navy-card px-4 py-2 text-sm">
                Reintentar
              </button>
            </div>
          )}

          {!error && data && data.meta.total === 0 && (
            <div className="py-12 text-center">
              <p className="title-display text-slate-300">Todavía no tenés cartas</p>
              <p className="mt-1 text-sm text-slate-500">Abrí sobres para conseguir tus primeras cartas.</p>
              <Link to="/packs" className="bevel mt-4 inline-block bg-neon-blue/20 px-5 py-2 text-neon-blue">
                Ir a sobres
              </Link>
            </div>
          )}

          {!error && data && data.meta.total > 0 && (
            <>
              <p className="mb-4 text-xs text-slate-500">
                {totalCards} cartas de {data.meta.total} jugadores · página {data.meta.page} de {totalPages}
              </p>
              {/* Una carta por token, con su número de serie en la propia carta (FR-063). */}
              <ul className="grid list-none grid-cols-[repeat(auto-fill,minmax(14rem,1fr))] gap-8 p-0">
                {data.data.flatMap((item) =>
                  item.tokens.map((token) => (
                    <li key={token.id} className="flex justify-center">
                      <div
                        data-selected={token.id === selectedTokenId ? 'true' : undefined}
                        className="w-56 rounded-xl data-[selected=true]:outline data-[selected=true]:outline-2 data-[selected=true]:outline-neon-blue"
                      >
                        <PlayerCard player={toInventoryCard(item.player, token.serial)} onClick={() => setSelectedTokenId(token.id)} />
                        {listingControls({ item, token })}
                      </div>
                    </li>
                  )),
                )}
              </ul>

              <nav className="mt-8 flex items-center justify-center gap-4" aria-label="Paginación">
                <button
                  onClick={() => setPage((p) => p - 1)}
                  disabled={page <= 1}
                  className="bevel bg-navy-card px-4 py-2 text-sm disabled:opacity-40"
                >
                  Anterior
                </button>
                <span className="text-sm text-slate-400">
                  {page} / {totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => p + 1)}
                  disabled={page >= totalPages}
                  className="bevel bg-navy-card px-4 py-2 text-sm disabled:opacity-40"
                >
                  Siguiente
                </button>
              </nav>
            </>
          )}
        </section>

        {selected && (
          <PlayerDetailPanel
            player={detail}
            loading={detailLoading}
            error={detailError}
            onClose={() => setSelectedTokenId(null)}
            priceHistoryView={
              detail ? { quoteLabel, onOpen: () => priceHistory.openFor(detail.id, detail.name) } : null
            }
          >
            <section className="rounded border border-white/10 p-3" aria-label="Venta de la carta">
              <h3 className="title-display text-xs text-slate-300">Tu carta #{selected.token.serial}</h3>
              {listingControls(selected, true)}
            </section>
          </PlayerDetailPanel>
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
        open={pending !== null}
        title={pending?.kind === 'withdraw' ? 'Retirar de la venta' : 'Poner a la venta'}
        description={pending ? describeAction(pending) : undefined}
        confirmLabel={pending?.kind === 'withdraw' ? 'Retirar' : 'Poner a la venta'}
        onConfirm={() => void confirm()}
        onCancel={() => setPending(null)}
      />
    </main>
  );
}

function describeAction({ kind, item, token }: PendingAction): string {
  const card = `${item.player.name} #${token.serial}`;
  if (kind === 'withdraw') return `${card} deja de estar a la venta y sigue en tu inventario.`;
  const price = item.player.marketValue.toLocaleString('es-AR');
  return `${card} se va a vender a ${price} créditos, su precio actual. El precio sigue a la cotización del jugador: si cambia, cambia también el de tu carta.`;
}
