import { Navigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from '../services/useAuth';

/** Impide el acceso a rutas protegidas sin sesion (FR-020, quickstart E11). */
export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  // Sin esta espera se redirige antes de terminar de rehidratar y se expulsa
  // a alguien que si tenia sesion valida.
  if (isLoading) return null;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
}
