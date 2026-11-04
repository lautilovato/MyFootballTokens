import { createContext, useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { getBalance } from '../services/credits.service';
import { useAuth } from '../services/useAuth';

export interface CreditsContextValue {
  /** Nulo mientras no se conoce (sin sesión, cargando o si falló la consulta). */
  balance: number | null;
  /** Vuelve a consultar el saldo al backend. */
  refresh: () => Promise<void>;
  /** Fija el saldo con un valor que ya informó el backend, por ejemplo tras una apertura. */
  setBalance: (balance: number) => void;
}

export const CreditsContext = createContext<CreditsContextValue | null>(null);

/**
 * Saldo del usuario compartido por el encabezado y las pantallas (08-sobres FR-053). Es un
 * provider global, así que vive en `app/` (constitución §7), y usa la Context API nativa (§2).
 */
export function CreditsProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  const [balance, setBalance] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    try {
      setBalance(await getBalance());
    } catch {
      // El 401 lo maneja el interceptor; ante otro error el encabezado muestra el saldo vacío.
      setBalance(null);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) void refresh();
    else setBalance(null);
  }, [isAuthenticated, refresh]);

  const value = useMemo(() => ({ balance, refresh, setBalance }), [balance, refresh]);
  return <CreditsContext.Provider value={value}>{children}</CreditsContext.Provider>;
}
