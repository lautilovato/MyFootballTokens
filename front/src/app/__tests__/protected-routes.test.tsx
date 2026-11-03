import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App';
import { clearSession } from '../../services/session-storage';

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  clearSession();
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  );
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  window.history.replaceState(null, '', '/');
});

/** 08-sobres US5-11, US6-7, FR-052 — sin sesión, las pantallas nuevas llevan al login. */
describe('rutas protegidas', () => {
  it.each(['/packs', '/inventory', '/ranking'])('%s sin sesión redirige a /login', async (path) => {
    window.history.replaceState(null, '', path);
    await act(async () => root.render(<App />));
    expect(window.location.pathname).toBe('/login');
  });
});
