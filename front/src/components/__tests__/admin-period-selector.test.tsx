import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminPeriodSelector } from '../AdminPeriodSelector';

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

function render(error: string | null = null, disabled = false) {
  const onPreset = vi.fn();
  const onRange = vi.fn();
  act(() =>
    root.render(
      <AdminPeriodSelector preset="30d" today="2026-10-31" error={error} disabled={disabled} onPreset={onPreset} onRange={onRange} />,
    ),
  );
  return { onPreset, onRange };
}

const button = (text: string) => [...container.querySelectorAll('button')].find((b) => b.textContent === text) as HTMLButtonElement;

/** 11-admin-panel — selector de período (FR-036, FR-039). */
describe('AdminPeriodSelector', () => {
  it('ofrece los cuatro atajos y marca el elegido', () => {
    render();
    const pressed = [...container.querySelectorAll('[aria-pressed="true"]')].map((b) => b.textContent);
    expect(pressed).toEqual(['30 días']);
    for (const label of ['7 días', '30 días', '90 días', 'Todo']) expect(button(label)).toBeTruthy();
  });

  it('avisa el atajo elegido', () => {
    const { onPreset } = render();
    act(() => button('7 días').click());
    expect(onPreset).toHaveBeenCalledWith('7d');
  });

  it('no deja elegir fechas futuras', () => {
    render();
    for (const input of container.querySelectorAll('input[type="date"]')) {
      expect(input.getAttribute('max')).toBe('2026-10-31');
    }
  });

  it('muestra el error del rango', () => {
    render('La fecha no es válida.');
    expect(container.querySelector('[role="alert"]')?.textContent).toBe('La fecha no es válida.');
  });

  it('no deja cambiar de período mientras carga', () => {
    render(null, true);
    expect(button('7 días').disabled).toBe(true);
    expect(button('Aplicar').disabled).toBe(true);
  });
});
