import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppHeader } from '../AppHeader';

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

function render(balance: number | null, onLogout = vi.fn(), path = '/') {
  act(() =>
    root.render(
      <MemoryRouter initialEntries={[path]}>
        <AppHeader username="ana" balance={balance} onLogout={onLogout} />
      </MemoryRouter>,
    ),
  );
  return onLogout;
}

/** 08-sobres T054 — encabezado con accesos y saldo (FR-052, FR-053). */
describe('AppHeader', () => {
  it('muestra los accesos a Sobres e Inventario', () => {
    render(2000);
    const links = [...container.querySelectorAll('a')].map((a) => [a.textContent, a.getAttribute('href')]);
    expect(links).toContainEqual(['Sobres', '/packs']);
    expect(links).toContainEqual(['Mis cartas', '/inventory']);
  });

  it('muestra el saldo y el usuario', () => {
    render(1800);
    expect(container.querySelector('[aria-label="Saldo"]')?.textContent).toBe('1.800 créditos');
    expect(container.textContent).toContain('ana');
  });

  it('sin saldo conocido muestra un guion', () => {
    render(null);
    expect(container.querySelector('[aria-label="Saldo"]')?.textContent).toBe('—');
  });

  it('marca la sección activa', () => {
    render(0, vi.fn(), '/packs');
    const active = [...container.querySelectorAll('a')].find((a) => a.getAttribute('aria-current') === 'page');
    expect(active?.textContent).toBe('Sobres');
  });

  it('cierra la sesión', () => {
    const onLogout = render(0);
    const button = [...container.querySelectorAll('button')].find((b) => b.textContent === 'Cerrar sesion')!;
    act(() => button.click());
    expect(onLogout).toHaveBeenCalledTimes(1);
  });
});
