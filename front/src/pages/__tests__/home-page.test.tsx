import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import HomePage from '../HomePage';

vi.mock('../../services/useAuth', () => ({
  useAuth: () => ({ user: { username: 'ana', role: 'user' }, logout: vi.fn() }),
}));
vi.mock('../../app/useCredits', () => ({ useCredits: () => ({ balance: 1800 }) }));

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() =>
    root.render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>,
    ),
  );
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const menu = () => container.querySelector('nav[aria-label="Menú principal"]')!;

/** 12-menu-principal — menú con las cuatro secciones. */
describe('HomePage', () => {
  it('muestra las cuatro secciones, con Mercado primero (FR-003)', () => {
    const titles = [...menu().children].map((tile) => tile.querySelector('.title-display')?.textContent);
    expect(titles).toEqual(['Mercado', 'Sobres', 'Ranking', 'Mi perfil']);
  });

  it('Mercado, Sobres y Mi perfil llevan a su pantalla (FR-004)', () => {
    const links = [...menu().querySelectorAll('a')].map((a) => a.getAttribute('href'));
    expect(links).toEqual(['/market', '/packs', '/profile']);
  });

  it('Ranking se ve como próximamente y no se puede abrir (FR-005)', () => {
    const ranking = menu().querySelector('[aria-disabled="true"]')!;
    expect(ranking.textContent).toContain('Ranking');
    expect(ranking.textContent).toContain('Próximamente');
    expect(ranking.querySelector('a')).toBeNull();
  });

  it('mantiene el encabezado con el saldo', () => {
    expect(container.querySelector('[aria-label="Saldo"]')?.textContent).toBe('1.800 créditos');
  });
});
