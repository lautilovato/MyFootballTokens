import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AdminRoute } from '../components/AdminRoute';
import { ProtectedRoute } from '../components/ProtectedRoute';
import HomePage from '../pages/HomePage';
import MarketPage from '../pages/MarketPage';
import InventoryPage from '../pages/InventoryPage';
import LoginPage from '../pages/LoginPage';
import PacksPage from '../pages/PacksPage';
import ProfilePage from '../pages/ProfilePage';
import RegisterPage from '../pages/RegisterPage';
import { AuthProvider } from '../services/AuthProvider';
import { CreditsProvider } from './CreditsProvider';

/** Aparte del resto: los gráficos pesan y solo los usa quien entra al panel. */
const AdminPage = lazy(() => import('../pages/AdminPage'));

/**
 * Arranque, providers y rutas publicas vs protegidas.
 * AuthProvider va ADENTRO del Router: afuera no puede redirigir y fallan
 * FR-020 y FR-022. CreditsProvider va adentro de AuthProvider porque carga el
 * saldo cuando hay sesion (08-sobres FR-053).
 */
export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <CreditsProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <HomePage />
                </ProtectedRoute>
              }
            />
            {/* 12-menu-principal FR-002: el mercado deja de ser la entrada. */}
            <Route
              path="/market"
              element={
                <ProtectedRoute>
                  <MarketPage />
                </ProtectedRoute>
              }
            />
            {/* 08-sobres FR-052: solo con sesion. */}
            <Route
              path="/packs"
              element={
                <ProtectedRoute>
                  <PacksPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/inventory"
              element={
                <ProtectedRoute>
                  <InventoryPage />
                </ProtectedRoute>
              }
            />
            {/* 10-historial-operaciones FR-001: solo con sesion. */}
            <Route
              path="/profile"
              element={
                <ProtectedRoute>
                  <ProfilePage />
                </ProtectedRoute>
              }
            />
            {/* 11-admin-panel FR-013: solo cuentas administradoras. */}
            <Route
              path="/admin"
              element={
                <AdminRoute>
                  <Suspense fallback={null}>
                    <AdminPage />
                  </Suspense>
                </AdminRoute>
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </CreditsProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
