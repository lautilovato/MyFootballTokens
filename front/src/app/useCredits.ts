import { useContext } from 'react';
import { CreditsContext } from './CreditsProvider';
import type { CreditsContextValue } from './CreditsProvider';

/** Las pantallas consumen el saldo por acá, nunca tocando el Context directo. */
export function useCredits(): CreditsContextValue {
  const ctx = useContext(CreditsContext);
  if (!ctx) throw new Error('useCredits debe usarse dentro de <CreditsProvider>');
  return ctx;
}
