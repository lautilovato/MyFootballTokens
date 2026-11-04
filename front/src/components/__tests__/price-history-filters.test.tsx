import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PriceHistoryModal } from '../PriceHistoryModal';
import { endOfLocalDay, startOfLocalDay, todayLocal } from '../../pages/date-filter';
import { usePriceHistory } from '../../pages/usePriceHistory';
import { fetchAllQuotes, fetchQuoteAt, type ApiQuote, type QuoteAt } from '../../services/quotes.service';

vi.mock('../../services/quotes.service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/quotes.service')>()),
  fetchAllQuotes: vi.fn(),
  fetchQuoteAt: vi.fn(),
}));

const allQuotes = vi.mocked(fetchAllQuotes);
const quoteAt = vi.mocked(fetchQuoteAt);

const DAY = 24 * 60 * 60 * 1000;
const performance1 = { key: 'performance', name: 'Performance', version: 1 };
const prestige2 = { key: 'prestige', name: 'Prestigio', version: 2 };

/** Mediodía UTC de hace `n` días: cae el mismo día calendario en cualquier zona razonable. */
const daysAgo = (n: number) => new Date(Math.floor(Date.now() / DAY) * DAY - n * DAY + DAY / 2);
const dayOf = (n: number) => todayLocal(daysAgo(n));

function quote(price: number, n: number, strategy = performance1): ApiQuote {
  return {
    price,
    score: 0.5,
    rawScore: 0.5,
    calculatedAt: daysAgo(n).toISOString(),
    origin: 'AUTOMATIC',
    season: '2025-2026',
    strategy,
    positionProfile: 'GENERAL',
    usedDefaultReputation: false,
    missingMatchesPlayed: false,
  };
}

/** Cotizaciones semanales: hace 40, 33, 26, 19 y 12 días. */
const SERIES = [quote(1000, 40), quote(1100, 33), quote(1200, 26, prestige2), quote(1300, 19, prestige2), quote(1400, 12, prestige2)];

/** Hace lo que haría el servidor: la última cotización calculada hasta el instante, inclusive. */
function fakeServer(at: string): QuoteAt {
  const found = [...SERIES].reverse().find((q) => new Date(q.calculatedAt).getTime() <= new Date(at).getTime());
  return found ? { quoted: true, quote: found, firstQuotedAt: null } : { quoted: false, quote: null, firstQuotedAt: SERIES[0].calculatedAt };
}

function Harness({ highlightAt }: { highlightAt?: string }) {
  const ph = usePriceHistory();
  return (
    <>
      <button onClick={() => ph.openFor('p1', 'Mario Mercado', highlightAt)}>abrir</button>
      <PriceHistoryModal
        open={ph.state.open}
        playerName={ph.state.playerName}
        quotes={ph.state.quotes}
        loading={ph.state.loading}
        error={ph.state.error}
        selectedIndex={ph.state.selectedIndex}
        highlightIndex={ph.state.highlightIndex}
        onSelect={ph.select}
        onRetry={ph.retry}
        onClose={ph.close}
        filters={ph.filters}
      />
    </>
  );
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubEnv('TZ', 'America/Argentina/Buenos_Aires');
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.removeAttribute('open');
  };
  allQuotes.mockReset().mockResolvedValue(SERIES);
  quoteAt.mockReset().mockImplementation(async (_player, at) => fakeServer(at));
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllEnvs();
});

async function open(highlightAt?: string) {
  await act(async () => {
    root.render(<Harness highlightAt={highlightAt} />);
  });
  await act(async () => (container.querySelector('button') as HTMLButtonElement).click());
}

const dialog = () => container.querySelector('dialog') as HTMLDialogElement;
const text = () => dialog().textContent ?? '';
const button = (label: string) => [...dialog().querySelectorAll('button')].find((b) => b.textContent === label) as HTMLButtonElement;
const input = (label: string) =>
  [...dialog().querySelectorAll('label')].find((l) => l.textContent?.startsWith(label))!.querySelector('input') as HTMLInputElement;
const rows = () => dialog().querySelectorAll('tbody tr');

function type(field: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  act(() => {
    setter.call(field, value);
    field.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

async function searchDay(day: string) {
  type(input('Ver cotización del día'), day);
  await act(async () => button('Buscar').click());
}

function applyRange(from: string, to: string) {
  type(input('Desde'), from);
  type(input('Hasta'), to);
  act(() => button('Aplicar').click());
}

/** 10-historial-operaciones US3 — filtro de fechas del modal (FR-027 a FR-033). */
describe('PriceHistoryModal — filtro de fechas', () => {
  describe('buscar la cotización de un día', () => {
    it('un día entre dos cotizaciones muestra la anterior, con su estrategia y cuándo se calculó (US3-1, US3-2)', async () => {
      await open();
      await searchDay(dayOf(22));

      expect(quoteAt).toHaveBeenCalledWith('p1', endOfLocalDay(dayOf(22)));
      const detail = dialog().querySelector('section[aria-label^="Cotización vigente el"]')!.textContent ?? '';
      expect(detail).toContain('1.200 créditos');
      expect(detail).toContain('Prestigio v2');
      expect(text()).toContain('no una calculada ese día');
      expect(text()).toContain('se calculó el');
    });

    it('resalta en el gráfico la cotización encontrada y la deja elegida', async () => {
      await open();
      expect(dialog().querySelectorAll('[data-testid="highlight"]')).toHaveLength(0);

      await searchDay(dayOf(22));

      expect(dialog().querySelectorAll('[data-testid="highlight"]')).toHaveLength(1);
      expect(dialog().querySelector('tbody button[aria-current="true"]')?.textContent).toContain(
        new Date(SERIES[2].calculatedAt).toLocaleString('es-AR'),
      );
    });

    it('un día en que sí se calculó una cotización lo dice', async () => {
      await open();
      await searchDay(dayOf(26));
      expect(text()).toContain('1.200 créditos');
      expect(text()).toContain('Se calculó ese mismo día');
    });

    it('un día anterior a la primera cotización avisa cuándo se calculó la primera y no muestra ningún precio (US3-3)', async () => {
      await open();
      await searchDay(dayOf(60));

      expect(text()).toContain(`No había cotización al ${dayOf(60).split('-').reverse().join('/')}`);
      expect(text()).toContain('La primera se calculó el');
      expect(dialog().querySelector('section[aria-label^="Cotización vigente el"]')).toBeNull();
    });

    it('el selector no deja elegir días futuros: su máximo es hoy (US3-4)', async () => {
      await open();
      expect(input('Ver cotización del día').max).toBe(todayLocal());
      expect(input('Desde').max).toBe(todayLocal());
      expect(input('Hasta').max).toBe(todayLocal());
    });

    it('un día futuro enviado igualmente se rechaza sin consultar al servidor ni mostrar un precio (US3-4, SC-010)', async () => {
      await open();
      await searchDay('2999-01-01');

      expect(quoteAt).not.toHaveBeenCalled();
      expect(dialog().querySelector('[role="alert"]')?.textContent).toContain('No se pueden elegir fechas futuras');
      expect(dialog().querySelector('section[aria-label^="Cotización vigente el"]')).toBeNull();
    });

    it('cambiar de día actualiza el resultado sin cerrar el modal (US3-9)', async () => {
      await open();
      await searchDay(dayOf(22));
      expect(text()).toContain('1.200 créditos');

      await searchDay(dayOf(35));
      expect(dialog().hasAttribute('open')).toBe(true);
      expect(dialog().querySelector('section[aria-label^="Cotización vigente el"]')!.textContent).toContain('1.000 créditos');
    });

    it('la cotización del día es siempre una del historial: nunca un valor inventado (US3-10, FR-029)', async () => {
      await open();
      await searchDay(dayOf(15));
      const prices = SERIES.map((q) => `${q.price.toLocaleString('es-AR')} créditos`);
      const shown = dialog().querySelector('section[aria-label^="Cotización vigente el"] dd')!.textContent ?? '';
      expect(prices).toContain(shown);
    });

    it('«Quitar búsqueda» limpia el resultado y el resaltado', async () => {
      await open();
      await searchDay(dayOf(22));
      act(() => button('Quitar búsqueda').click());

      expect(dialog().querySelector('section[aria-label^="Cotización vigente el"]')).toBeNull();
      expect(dialog().querySelectorAll('[data-testid="highlight"]')).toHaveLength(0);
    });

    it('si falla la búsqueda muestra un mensaje', async () => {
      await open();
      quoteAt.mockRejectedValueOnce(new Error('caído'));
      await searchDay(dayOf(22));
      expect(dialog().querySelector('[role="alert"]')?.textContent).toContain('No se pudo buscar la cotización');
    });
  });

  describe('rango desde–hasta', () => {
    it('deja solo las cotizaciones del rango, inclusive, en el gráfico y en la lista (US3-5)', async () => {
      await open();
      expect(rows()).toHaveLength(5);

      applyRange(dayOf(33), dayOf(19));

      expect(rows()).toHaveLength(3);
      expect(text()).toContain('Mostrando 3 de 5 cotizaciones');
      expect(quoteAt).not.toHaveBeenCalled();
    });

    it('un rango sin cotizaciones lo informa y muestra la vigente al comienzo (US3-6, FR-032)', async () => {
      await open();
      applyRange(dayOf(24), dayOf(21));

      expect(text()).toContain('No hay cotizaciones en ese rango');
      expect(quoteAt).toHaveBeenCalledWith('p1', startOfLocalDay(dayOf(24)));
      await act(async () => {});
      expect(text()).toContain('La vigente al comienzo era de 1.200 créditos (Prestigio v2)');
      expect(dialog().querySelector('svg[role="slider"]')).toBeNull();
    });

    it('un rango anterior a la primera cotización dice que todavía no había', async () => {
      await open();
      applyRange(dayOf(60), dayOf(50));
      await act(async () => {});
      expect(text()).toContain('No hay cotizaciones en ese rango');
      expect(text()).toContain('todavía no tenía cotización al comienzo del rango');
    });

    it('un rango invertido muestra el mensaje y no cambia lo que se veía ni consulta (US3-7)', async () => {
      await open();
      applyRange(dayOf(19), dayOf(33));

      expect(dialog().querySelector('[role="alert"]')?.textContent).toContain('«desde» no puede ser posterior a «hasta»');
      expect(rows()).toHaveLength(5);
      expect(quoteAt).not.toHaveBeenCalled();
    });

    it('«Limpiar» vuelve al gráfico completo y borra los mensajes (US3-8)', async () => {
      await open();
      applyRange(dayOf(33), dayOf(19));
      expect(rows()).toHaveLength(3);

      act(() => button('Limpiar').click());

      expect(rows()).toHaveLength(5);
      expect(input('Desde').value).toBe('');
      expect(input('Hasta').value).toBe('');
      expect(text()).not.toContain('Mostrando');
    });

    it('la cotización elegida queda dentro del rango, o pasa a la última visible', async () => {
      await open();
      // Por defecto queda elegida la última (hace 12 días): fuera del rango que se aplica.
      applyRange(dayOf(40), dayOf(26));
      expect(dialog().querySelector('tbody button[aria-current="true"]')?.textContent).toContain(
        new Date(SERIES[2].calculatedAt).toLocaleString('es-AR'),
      );
    });

    it('buscar un día cuya cotización queda fuera del rango quita el rango para poder verla', async () => {
      await open();
      applyRange(dayOf(40), dayOf(33));
      expect(rows()).toHaveLength(2);

      await searchDay(dayOf(15));

      expect(rows()).toHaveLength(5);
      expect(dialog().querySelectorAll('[data-testid="highlight"]')).toHaveLength(1);
    });
  });

  describe('resaltar la cotización de una operación (US4-4)', () => {
    it('al abrir con un instante, resalta y elige la cotización vigente en él', async () => {
      const operationAt = daysAgo(20).toISOString();
      await open(operationAt);

      expect(quoteAt).toHaveBeenCalledWith('p1', operationAt);
      expect(dialog().querySelectorAll('[data-testid="highlight"]')).toHaveLength(1);
      expect(dialog().querySelector('tbody button[aria-current="true"]')?.textContent).toContain(
        new Date(SERIES[2].calculatedAt).toLocaleString('es-AR'),
      );
      expect(dialog().querySelector('section[aria-label="Cotización elegida"]')!.textContent).toContain('Prestigio v2');
    });

    it('si no había cotización en ese instante, abre sin resaltar', async () => {
      await open(daysAgo(60).toISOString());
      expect(dialog().querySelectorAll('[data-testid="highlight"]')).toHaveLength(0);
      expect(rows()).toHaveLength(5);
    });

    it('si falla la búsqueda del instante, abre igual sin resaltar', async () => {
      quoteAt.mockRejectedValue(new Error('caído'));
      await open(daysAgo(20).toISOString());
      expect(rows()).toHaveLength(5);
      expect(dialog().querySelectorAll('[data-testid="highlight"]')).toHaveLength(0);
      expect(dialog().querySelector('[role="alert"]')).toBeNull();
    });

    it('sin instante no consulta nada más', async () => {
      await open();
      expect(quoteAt).not.toHaveBeenCalled();
    });
  });
});
