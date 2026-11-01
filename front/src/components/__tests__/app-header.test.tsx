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

function render(balance: number | null, onLogout = vi.fn(), path = '/market', isAdmin = false) {
  act(() =>
    root.render(
      <MemoryRouter initialEntries={[path]}>
        <AppHeader username="ana" balance={balance} onLogout={onLogout} isAdmin={isAdmin} />
      </MemoryRouter>,
    ),
  );
  return onLogout;
}

const trigger = () => container.querySelector('button[aria-expanded]') as HTMLButtonElement;
const logout = () => [...container.querySelectorAll('button')].find((b) => b.textContent === 'Cerrar sesión');
const hrefs = () => [...container.querySelectorAll('a')].map((a) => a.getAttribute('href'));
const menuItems = () => [...container.querySelectorAll('header [id] a, header [id] button')].map((e) => e.textContent);

/** 08-sobres T054 — encabezado con accesos y saldo (FR-052, FR-053). */
describe('AppHeader', () => {
  it('el logo vuelve al menú y hay un acceso a Mercado (12-menu-principal FR-004)', () => {
    render(2000);
    const links = [...container.querySelectorAll('a')].map((a) => [a.textContent, a.getAttribute('href')]);
    expect(links).toContainEqual(['MyFootballTokens', '/']);
    expect(links).toContainEqual(['Mercado', '/market']);
  });

  it('la barra solo tiene los accesos a Mercado y Sobres', () => {
    render(2000);
    const links = [...container.querySelectorAll('nav a')].map((a) => [a.textContent, a.getAttribute('href')]);
    expect(links).toEqual([
      ['Mercado', '/market'],
      ['Sobres', '/packs'],
    ]);
  });

  it('solo un administrador ve el acceso al panel (11-admin-panel FR-012)', () => {
    render(0, vi.fn(), '/packs', true);
    expect(container.querySelector('a[href="/admin"]')?.textContent).toBe('Admin');

    render(0);
    expect(container.querySelector('a[href="/admin"]')).toBeNull();
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

  it('muestra la moneda al lado del saldo (12-menu-principal FR-009)', () => {
    render(1800);
    expect(container.querySelector('[aria-label="Saldo"] svg')?.getAttribute('aria-hidden')).toBe('true');
  });

  describe('en la home (12-menu-principal FR-008)', () => {
    it('no muestra los accesos a las secciones', () => {
      render(2000, vi.fn(), '/');
      expect(container.querySelector('nav')).toBeNull();
      expect(container.querySelector('a[href="/packs"]')).toBeNull();
    });

    it('sigue mostrando el logo, el saldo y el usuario', () => {
      render(2000, vi.fn(), '/');
      expect(container.querySelector('a[href="/"]')?.textContent).toBe('MyFootballTokens');
      expect(container.querySelector('[aria-label="Saldo"]')?.textContent).toBe('2.000 créditos');
      expect(trigger().textContent).toBe('ana');
    });

    it('a un administrador el menú del usuario le ofrece el panel', () => {
      render(0, vi.fn(), '/', true);
      act(() => trigger().click());
      expect(menuItems()).toEqual(['Mis cartas', 'Mis operaciones', 'Admin', 'Cerrar sesión']);
    });
  });

  describe('menú del usuario (12-menu-principal FR-010)', () => {
    it('el cierre de sesión no está a la vista', () => {
      render(0);
      expect(logout()).toBeUndefined();
      expect(trigger().getAttribute('aria-expanded')).toBe('false');
    });

    it('cierra la sesión desde el menú', () => {
      const onLogout = render(0);
      act(() => trigger().click());
      expect(trigger().getAttribute('aria-expanded')).toBe('true');
      act(() => logout()!.click());
      expect(onLogout).toHaveBeenCalledTimes(1);
    });

    it('ofrece Mis cartas, Mis operaciones y Cerrar sesión', () => {
      render(0);
      act(() => trigger().click());
      expect(menuItems()).toEqual(['Mis cartas', 'Mis operaciones', 'Cerrar sesión']);
      expect(hrefs()).toContain('/inventory');
      expect(hrefs()).toContain('/profile');
    });

    it('a un administrador no le repite el panel que ya está en la barra', () => {
      render(0, vi.fn(), '/packs', true);
      act(() => trigger().click());
      expect(menuItems()).not.toContain('Admin');
      expect(container.querySelector('nav a[href="/admin"]')).not.toBeNull();
    });

    it('se cierra con Escape y devuelve el foco', () => {
      render(0);
      act(() => trigger().click());
      act(() => {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      });
      expect(logout()).toBeUndefined();
      expect(document.activeElement).toBe(trigger());
    });

    it('se cierra con un clic afuera, pero no con uno adentro', () => {
      render(0);
      act(() => trigger().click());
      act(() => {
        logout()!.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
      });
      expect(logout()).toBeDefined();
      act(() => {
        document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
      });
      expect(logout()).toBeUndefined();
    });

    it('se cierra al elegir un acceso', () => {
      render(0, vi.fn(), '/');
      act(() => trigger().click());
      const inventory = [...container.querySelectorAll('a')].find((a) => a.textContent === 'Mis cartas')!;
      act(() => inventory.click());
      expect(logout()).toBeUndefined();
    });
  });
});
