import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminRoute } from '../AdminRoute';
import { useAuth } from '../../services/useAuth';
import type { AuthContextValue } from '../../services/AuthProvider';

vi.mock('../../services/useAuth', () => ({ useAuth: vi.fn() }));

const auth = vi.mocked(useAuth);

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function render(session: Partial<AuthContextValue>) {
  auth.mockReturnValue({ user: null, isAuthenticated: false, isLoading: false, ...session } as AuthContextValue);
  act(() =>
    root.render(
      <MemoryRouter initialEntries={['/admin']}>
        <Routes>
          <Route path="/" element={<p>Home</p>} />
          <Route path="/login" element={<p>Login</p>} />
          <Route
            path="/admin"
            element={
              <AdminRoute>
                <p>Panel</p>
              </AdminRoute>
            }
          />
        </Routes>
      </MemoryRouter>,
    ),
  );
}

const account = (role?: 'user' | 'admin') => ({ id: '1', email: 'a@b.test', username: 'a', role });

/** 11-admin-panel — acceso a la ruta del panel (FR-013). */
describe('AdminRoute', () => {
  it('deja pasar a un administrador', () => {
    render({ isAuthenticated: true, user: account('admin') });
    expect(container.textContent).toBe('Panel');
  });

  it('lleva a un usuario común a la home', () => {
    render({ isAuthenticated: true, user: account('user') });
    expect(container.textContent).toBe('Home');
  });

  it('una sesión guardada sin rol cuenta como usuario común', () => {
    render({ isAuthenticated: true, user: account() });
    expect(container.textContent).toBe('Home');
  });

  it('lleva a iniciar sesión a quien no tiene sesión', () => {
    render({});
    expect(container.textContent).toBe('Login');
  });

  it('espera a rehidratar la sesión antes de decidir', () => {
    render({ isLoading: true });
    expect(container.textContent).toBe('');
  });
});
