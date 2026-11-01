import { Navigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from '../services/useAuth';

/**
 * Solo para cuentas administradoras (11-admin-panel FR-013). Es una comodidad de navegación: el
 * que protege los datos es el servidor (FR-004).
 */
export function AdminRoute({ children }: { children: ReactNode }) {
  const { user, isAuthenticated, isLoading } = useAuth();
  if (isLoading) return null;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (user?.role !== 'admin') return <Navigate to="/" replace />;
  return <>{children}</>;
}
