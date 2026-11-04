import { useEffect, useState } from 'react';
import { strategyLabel } from '../services/quote.mapper';
import { fetchCurrentQuote } from '../services/quotes.service';
import { fetchPlayerDetail, type ApiPlayerDetail } from '../services/players.service';

/**
 * Lo que necesita el panel de detalle del jugador abierto: sus datos y la estrategia de su
 * cotización vigente (10-historial-operaciones FR-020). Con `playerId` nulo no pide nada.
 */
export function usePlayerDetail(playerId: string | null, describeError: (err: unknown) => string) {
  const [detail, setDetail] = useState<ApiPlayerDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quoteLabel, setQuoteLabel] = useState<string | null>(null);

  useEffect(() => {
    if (!playerId) {
      setDetail(null);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchPlayerDetail(playerId)
      .then((result) => {
        if (!cancelled) setDetail(result);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(describeError(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [playerId, describeError]);

  // La línea «Cotizado con …» del panel es opcional: si el pedido falla, el panel sigue igual.
  useEffect(() => {
    setQuoteLabel(null);
    if (!playerId) return;

    let cancelled = false;
    fetchCurrentQuote(playerId)
      .then((quote) => {
        if (!cancelled) setQuoteLabel(quote ? strategyLabel(quote.strategy) : null);
      })
      .catch(() => {
        if (!cancelled) setQuoteLabel(null);
      });

    return () => {
      cancelled = true;
    };
  }, [playerId]);

  return { detail, loading, error, quoteLabel };
}
