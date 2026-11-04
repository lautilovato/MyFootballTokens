import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MarketListings, type MarketListingsProps } from '../MarketListings';
import type { PlayerListing } from '../../services/market.service';

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

const listing = (serial: number, mine = false): PlayerListing => ({
  listingId: `l${serial}`,
  tokenId: `t${serial}`,
  serial,
  mine,
  listedAt: '2026-10-20T12:00:00.000Z',
});

function render(props: Partial<MarketListingsProps> = {}) {
  const handlers = { onBuy: vi.fn(), onPage: vi.fn() };
  act(() => {
    root.render(
      <MemoryRouter>
        <MarketListings
          price={300}
          listings={[listing(7), listing(12, true)]}
          page={1}
          totalPages={1}
          balance={2000}
          loading={false}
          error={null}
          busy={false}
          message={null}
          {...handlers}
          {...props}
        />
      </MemoryRouter>,
    );
  });
  return handlers;
}

const buyButtons = () => [...container.querySelectorAll('button')].filter((b) => b.textContent === 'Comprar');

/** 09-mercado — bloque de compra del panel de detalle (FR-038 a FR-041). */
describe('MarketListings', () => {
  it('lista las cartas con su número de serie: las ajenas se compran y las propias dicen «Tuya»', () => {
    const { onBuy } = render();
    expect(container.textContent).toContain('#7');
    expect(container.textContent).toContain('#12');
    expect(container.textContent).toContain('Tuya');
    expect(buyButtons()).toHaveLength(1);

    act(() => buyButtons()[0].click());
    expect(onBuy).toHaveBeenCalledWith(listing(7));
  });

  it('no tiene selector de cantidad (FR-038)', () => {
    render();
    expect(container.querySelector('input')).toBeNull();
  });

  it('sin publicaciones lo indica y no permite comprar (FR-040)', () => {
    render({ listings: [] });
    expect(container.textContent).toContain('No hay cartas de este jugador a la venta');
    expect(buyButtons()).toHaveLength(0);
  });

  it('con saldo menor que el precio, el botón queda deshabilitado con el motivo (FR-040)', () => {
    render({ balance: 299 });
    expect(container.textContent).toContain('Tu saldo no alcanza');
    expect(buyButtons()[0].disabled).toBe(true);
  });

  it('con una compra en curso no se puede iniciar otra (FR-039)', () => {
    render({ busy: true });
    expect(buyButtons()[0].disabled).toBe(true);
  });

  it('tras una compra exitosa ofrece ir al inventario (FR-041)', () => {
    render({ message: { kind: 'success', text: 'Compraste la carta #7.' } });
    const link = [...container.querySelectorAll('a')].find((a) => a.textContent === 'Ir a mis cartas');
    expect(link?.getAttribute('href')).toBe('/inventory');
  });
});
