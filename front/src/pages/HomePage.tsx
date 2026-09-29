import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { MarketFilters } from '../components/MarketFilters';
import { PlayerDetailPanel } from '../components/PlayerDetailPanel';
import { PlayerGrid } from '../components/PlayerGrid';
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
import { SELECTED_PARAM, filtersFromParams, nextFilters, paramsFromFilters } from './home-filters';

/**
 * Home de mercado (06-home). Orquesta: no implementa lógica de negocio ni habla con la red
 * por su cuenta — todo el tráfico pasa por `services/` (constitución §7).
 *
 * El estado de filtros, página y jugador seleccionado vive en la URL (research #10).
 */
export default function HomePage() {
  const { user, logout } = useAuth();
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
  }, [filtersKey]);

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
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-6 py-4">
        <h1 className="title-display text-2xl text-neon-blue">MyFootballTokens</h1>
        <div className="flex items-center gap-4 text-sm">
          <span className="text-slate-400">{user?.username}</span>
          <button onClick={logout} className="bevel bg-navy-card px-4 py-1 text-slate-200">
            Cerrar sesion
          </button>
        </div>
      </header>

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

          {!loading && !error && page?.data.length === 0 && (
            <div className="py-12 text-center">
              <p className="title-display text-slate-300">Sin resultados</p>
              <p className="mt-1 text-sm text-slate-500">
                Ningún jugador cumple con los filtros aplicados. Probá quitando alguno.
              </p>
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
          />
        )}
      </div>
    </main>
  );
}

function describeError(err: unknown): string {
  const status = (err as { response?: { status?: number } })?.response?.status;
  if (status === 400) return 'Alguno de los filtros no es válido. Revisá los rangos.';
  return 'No se pudo cargar el mercado. Intentá de nuevo en unos segundos.';
}
