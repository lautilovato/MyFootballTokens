import { kindsFor } from './history-filter';
import type { HistoryType } from './history-filter';

describe('kindsFor', () => {
  it('"all" incluye sobres, compras y ventas', () => {
    expect(kindsFor('all')).toEqual(['sobre', 'compra', 'venta']);
  });

  it('"acquired" incluye sobres y compras', () => {
    expect(kindsFor('acquired')).toEqual(['sobre', 'compra']);
  });

  it('"sold" incluye solo ventas', () => {
    expect(kindsFor('sold')).toEqual(['venta']);
  });

  it('un valor desconocido lanza error', () => {
    expect(() => kindsFor('todo' as HistoryType)).toThrow('filtro de historial desconocido');
  });
});
