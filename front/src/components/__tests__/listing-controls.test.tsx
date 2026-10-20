import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ListingControls } from '../ListingControls';

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

function render(props: Partial<Parameters<typeof ListingControls>[0]> = {}) {
  const handlers = { onPublish: vi.fn(), onWithdraw: vi.fn() };
  act(() => {
    root.render(<ListingControls listed={false} price={300} disabled={false} {...handlers} {...props} />);
  });
  return handlers;
}

const button = () => container.querySelector('button')!;

/** 09-mercado — controles de venta de una carta del inventario (FR-036). */
describe('ListingControls', () => {
  it('sin publicación ofrece ponerla a la venta y muestra el precio actual', () => {
    const { onPublish, onWithdraw } = render();
    expect(button().textContent).toBe('Poner a la venta');
    expect(container.textContent).toContain('300 créditos');
    expect(container.textContent).not.toContain('A la venta');

    act(() => button().click());
    expect(onPublish).toHaveBeenCalledTimes(1);
    expect(onWithdraw).not.toHaveBeenCalled();
  });

  it('con publicación muestra la marca «A la venta» y ofrece retirarla', () => {
    const { onPublish, onWithdraw } = render({ listed: true });
    expect(container.textContent).toContain('A la venta');
    expect(button().textContent).toBe('Retirar');

    act(() => button().click());
    expect(onWithdraw).toHaveBeenCalledTimes(1);
    expect(onPublish).not.toHaveBeenCalled();
  });

  it('deshabilitado no permite operar', () => {
    render({ disabled: true });
    expect(button().disabled).toBe(true);
  });
});
