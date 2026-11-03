import { useCallback, useEffect, useRef, useState } from 'react';
import { AppHeader } from '../components/AppHeader';
import { OperationHistory } from '../components/OperationHistory';
import { PriceHistoryModal } from '../components/PriceHistoryModal';
import { useCredits } from '../app/useCredits';
import {
  getOperations,
  historyErrorMessage,
  HISTORY_PAGE_SIZE,
  type HistoryFilter,
  type OperationsPage,
} from '../services/history.service';
import { extractApiErrorCode } from '../services/packs.service';
import { useAuth } from '../services/useAuth';
import { usePriceHistory } from './usePriceHistory';

/**
 * «Mi perfil» (10-historial-operaciones FR-001, FR-002): el nombre del usuario, su saldo y el
 * historial de cartas adquiridas y vendidas. No muestra el correo ni ningún otro dato. Desde cada
 * entrada se abre el gráfico de cotizaciones del jugador, con la vigente en el instante de la
 * operación resaltada (US4-4, FR-018).
 */
export default function ProfilePage() {
  const { user, logout } = useAuth();
  const { balance } = useCredits();
  const [filter, setFilter] = useState<HistoryFilter>('all');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<OperationsPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const priceHistory = usePriceHistory();
  // Una respuesta vieja no debe pisar a la de un filtro o una página más nuevos.
  const requestId = useRef(0);

  const load = useCallback(async (targetFilter: HistoryFilter, targetPage: number) => {
    const current = ++requestId.current;
    setLoading(true);
    setError(null);
    try {
      const result = await getOperations(targetFilter, targetPage, HISTORY_PAGE_SIZE);
      if (current === requestId.current) setData(result);
    } catch (err) {
      if (current === requestId.current) setError(historyErrorMessage(extractApiErrorCode(err)));
    } finally {
      if (current === requestId.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(filter, page);
  }, [load, filter, page]);

  const changeFilter = (next: HistoryFilter) => {
    setFilter(next);
    setPage(1);
  };

  return (
    <main className="min-h-screen bg-navy-deep text-slate-200">
      <AppHeader username={user?.username} balance={balance} onLogout={logout} isAdmin={user?.role === 'admin'} />

      <div className="mx-auto max-w-6xl p-6">
        <header className="mb-8">
          <h1 className="title-display text-3xl text-slate-100">Mi perfil</h1>
          <dl className="mt-3 flex flex-wrap gap-x-8 gap-y-1 text-sm">
            <div className="flex gap-2">
              <dt className="text-slate-400">Usuario</dt>
              <dd className="text-slate-100">{user?.username}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-slate-400">Saldo</dt>
              <dd className="font-semibold text-gold-bright">
                {balance === null ? '—' : `${balance.toLocaleString('es-AR')} créditos`}
              </dd>
            </div>
          </dl>
        </header>

        <OperationHistory
          entries={data?.data ?? []}
          meta={data?.meta ?? null}
          filter={filter}
          loading={loading}
          error={error}
          onFilterChange={changeFilter}
          onPageChange={setPage}
          onRetry={() => void load(filter, page)}
          onViewPlayer={(entry) => priceHistory.openFor(entry.player.id, entry.player.name, entry.at)}
        />
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
    </main>
  );
}
