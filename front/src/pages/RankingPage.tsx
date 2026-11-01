import { useCallback, useEffect, useState } from 'react';
import { useCredits } from '../app/useCredits';
import { AppHeader } from '../components/AppHeader';
import { RankingCirculation } from '../components/RankingCirculation';
import { RankingList } from '../components/RankingList';
import { RankingPodium } from '../components/RankingPodium';
import { getPlayerRanking, type PlayerRanking } from '../services/ranking.service';
import { useAuth } from '../services/useAuth';

const PODIUM_SIZE = 3;

/**
 * Pantalla de Ranking (13-ranking): los jugadores más caros según la estrategia activa y, debajo,
 * cuántas cartas de cada uno están en circulación.
 */
export default function RankingPage() {
  const { user, logout } = useAuth();
  const { balance } = useCredits();
  const [ranking, setRanking] = useState<PlayerRanking | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRanking(await getPlayerRanking());
    } catch {
      setError('No se pudo cargar el ranking. Intentá de nuevo en unos segundos.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <main className="min-h-screen bg-navy-deep text-slate-200">
      <AppHeader username={user?.username} balance={balance} onLogout={logout} isAdmin={user?.role === 'admin'} />

      <div className="mx-auto max-w-6xl p-6">
        <h1 className="title-display mb-6 text-3xl text-slate-100">Ranking</h1>

        {loading && !ranking && <p className="py-12 text-center text-slate-400">Cargando el ranking…</p>}

        {!loading && error && (
          <div className="py-12 text-center">
            <p className="text-error-red">{error}</p>
            <button onClick={() => void load()} className="bevel mt-3 bg-navy-card px-4 py-2 text-sm">
              Reintentar
            </button>
          </div>
        )}

        {!error && ranking?.data.length === 0 && (
          <div className="py-12 text-center">
            <p className="title-display text-slate-300">Todavía no hay ranking</p>
            <p className="mt-1 text-sm text-slate-500">Aparece apenas se calculen las cotizaciones con la estrategia activa.</p>
          </div>
        )}

        {!error && ranking && ranking.data.length > 0 && (
          <div className="space-y-8">
            <RankingPodium entries={ranking.data.slice(0, PODIUM_SIZE)} />
            {ranking.data.length > PODIUM_SIZE && <RankingList entries={ranking.data.slice(PODIUM_SIZE)} />}

            <RankingCirculation
              rows={ranking.data.map(({ rank, inCirculation, player }) => ({
                rank,
                name: player.name,
                inCirculation,
                total: player.supply.total,
              }))}
            />
          </div>
        )}
      </div>
    </main>
  );
}
