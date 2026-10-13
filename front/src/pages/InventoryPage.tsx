import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AppHeader } from '../components/AppHeader';
import { PlayerCard } from '../components/player-card/PlayerCard';
import { useCredits } from '../app/useCredits';
import { getInventory, type InventoryPage as InventoryPageData } from '../services/inventory.service';
import { toInventoryCard } from '../services/pack.mapper';
import { useAuth } from '../services/useAuth';

export const INVENTORY_PAGE_SIZE = 12;

/**
 * Pantalla de inventario (08-sobres US6): las cartas que el usuario posee hoy, en el orden que
 * las devuelve el backend (reputación descendente, FR-063), con la cotización vigente de cada
 * jugador. No ofrece ninguna acción sobre las cartas (FR-066).
 */
export default function InventoryPage() {
  const { user, logout } = useAuth();
  const { balance } = useCredits();
  const [page, setPage] = useState(1);
  const [data, setData] = useState<InventoryPageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
    void load(page);
  }, [load, page]);

  const totalPages = data?.meta.totalPages ?? 0;
  const totalCards = data?.data.reduce((sum, item) => sum + item.count, 0) ?? 0;

  return (
    <main className="min-h-screen bg-navy-deep text-slate-200">
      <AppHeader username={user?.username} balance={balance} onLogout={logout} />

      <div className="mx-auto max-w-6xl p-6">
        <h1 className="title-display mb-6 text-3xl text-slate-100">Mis cartas</h1>

        {loading && <p className="py-12 text-center text-slate-400">Cargando tus cartas…</p>}

        {!loading && error && (
          <div className="py-12 text-center">
            <p className="text-error-red">{error}</p>
            <button onClick={() => void load(page)} className="bevel mt-3 bg-navy-card px-4 py-2 text-sm">
              Reintentar
            </button>
          </div>
        )}

        {!loading && !error && data && data.meta.total === 0 && (
          <div className="py-12 text-center">
            <p className="title-display text-slate-300">Todavía no tenés cartas</p>
            <p className="mt-1 text-sm text-slate-500">Abrí sobres para conseguir tus primeras cartas.</p>
            <Link to="/packs" className="bevel mt-4 inline-block bg-neon-blue/20 px-5 py-2 text-neon-blue">
              Ir a sobres
            </Link>
          </div>
        )}

        {!loading && !error && data && data.meta.total > 0 && (
          <>
            <p className="mb-4 text-xs text-slate-500">
              {totalCards} cartas de {data.meta.total} jugadores · página {data.meta.page} de {totalPages}
            </p>
            {/* Una carta por token, con su número de serie en la propia carta (FR-063). */}
            <ul className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4">
              {data.data.flatMap((item) =>
                item.tokens.map((token) => (
                  <li key={token.id} className="flex justify-center">
                    <div className="w-56">
                      <PlayerCard player={toInventoryCard(item.player, token.serial)} />
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
      </div>
    </main>
  );
}
