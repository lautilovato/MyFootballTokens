import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminStrategies } from '../AdminStrategies';
import {
  activateStrategy,
  createStrategyVersion,
  listStrategies,
  recalculateQuotes,
  type ValuationStrategy,
} from '../../services/valuation-strategies.service';

vi.mock('../../services/valuation-strategies.service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/valuation-strategies.service')>()),
  listStrategies: vi.fn(),
  createStrategyVersion: vi.fn(),
  activateStrategy: vi.fn(),
  recalculateQuotes: vi.fn(),
}));
/** jsdom no implementa `<dialog>.showModal()`: el doble muestra el contenido si está abierto. */
vi.mock('../../components/confirm-modal/ConfirmModal', () => ({
  ConfirmModal: (props: { open: boolean; title: string; description?: string; onConfirm: () => void; onCancel: () => void }) =>
    props.open ? (
      <div role="dialog">
        <p>{props.title}</p>
        <p>{props.description}</p>
        <button onClick={props.onConfirm}>confirmar</button>
        <button onClick={props.onCancel}>cancelar</button>
      </div>
    ) : null,
}));

const list = vi.mocked(listStrategies);
const createVersion = vi.mocked(createStrategyVersion);
const activate = vi.mocked(activateStrategy);
const recalculate = vi.mocked(recalculateQuotes);

function strategy(key: string, name: string, active: boolean): ValuationStrategy {
  return {
    key,
    name,
    description: `Descripción de ${name}`,
    active,
    currentVersion: {
      version: 2,
      createdAt: '2026-10-13T00:00:00.000Z',
      weights: { general: { goals: 0.5 }, byPosition: { GK: { rating: 0.9 } } },
      baseValue: 100,
      scaleFactor: 900,
      minPrice: 10,
      defaultReputation: 20,
    },
  };
}

const STRATEGIES = [strategy('performance', 'Performance', true), strategy('prestige', 'Prestigio', false)];

let container: HTMLDivElement;
let root: Root;

beforeEach(async () => {
  for (const mock of [list, createVersion, activate, recalculate]) mock.mockReset();
  list.mockResolvedValue(STRATEGIES);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root.render(<AdminStrategies />));
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const button = (text: string) => [...container.querySelectorAll('button')].find((b) => b.textContent === text)!;
const click = (text: string) => act(async () => button(text).click());

function type(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  act(() => {
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

const typeKey = (value = 'la-clave') => type(container.querySelector<HTMLInputElement>('input[name="admin-api-key"]')!, value);
const submit = () =>
  act(async () => container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));

/** 16-config-estrategia — estrategias en el panel de administración. */
describe('AdminStrategies', () => {
  it('muestra las estrategias y cuál está activa, sin pedir la clave para verlas (FR-001)', () => {
    const items = [...container.querySelectorAll('li')].map((li) => li.textContent);
    expect(items[0]).toContain('Performance');
    expect(items[0]).toContain('Activa');
    expect(items[0]).toContain('Versión 2');
    expect(items[1]).toContain('Prestigio');
    expect(items[1]).not.toMatch(/Activa(?!r)/);
  });

  it('sin clave no deja hacer cambios (FR-002)', () => {
    expect(button('Activar').disabled).toBe(true);
    expect(button('Recalcular').disabled).toBe(true);
    typeKey();
    expect(button('Activar').disabled).toBe(false);
  });

  it('la clave se escribe en un campo oculto y no se guarda en el navegador (FR-002)', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    typeKey();
    expect(container.querySelector('input[name="admin-api-key"]')!.getAttribute('type')).toBe('password');
    expect(setItem).not.toHaveBeenCalled();
    setItem.mockRestore();
  });

  it('activar pide confirmación, usa la clave y recarga las estrategias (FR-004)', async () => {
    activate.mockResolvedValue();
    typeKey();
    await click('Activar');
    expect(container.querySelector('[role="dialog"]')?.textContent).toContain('no cambian hasta recalcular');
    expect(activate).not.toHaveBeenCalled();

    await click('confirmar');
    expect(activate).toHaveBeenCalledWith('prestige', 'la-clave');
    expect(list).toHaveBeenCalledTimes(2);
    expect(container.querySelector('[role="status"]')?.textContent).toBe('Prestigio es la estrategia activa.');
  });

  it('recalcular solo se ofrece en la estrategia activa (FR-006)', async () => {
    const items = [...container.querySelectorAll('li')];
    expect(items[0].textContent).toContain('Recalcular');
    expect(items[1].textContent).not.toContain('Recalcular');

    recalculate.mockResolvedValue();
    typeKey();
    await click('Recalcular');
    await click('confirmar');
    expect(recalculate).toHaveBeenCalledWith('performance', 'la-clave');
  });

  it('configurar parte de la versión vigente y guarda una nueva, con los pesos por posición (FR-005)', async () => {
    createVersion.mockResolvedValue(STRATEGIES[0].currentVersion);
    typeKey();
    await act(async () => [...container.querySelectorAll('button')].filter((b) => b.textContent === 'Configurar')[0].click());

    const goals = () => container.querySelector<HTMLInputElement>('input[name="weight-goals"]')!;
    expect(goals().value).toBe('0.5');
    type(goals(), '0.7');

    await click('Arqueros');
    const rating = container.querySelector<HTMLInputElement>('input[name="weight-rating"]')!;
    expect(rating.value).toBe('0.9');
    type(rating, '0.8');

    await submit();
    await click('confirmar');

    expect(createVersion).toHaveBeenCalledWith(
      'performance',
      { weights: { general: { goals: 0.7 }, byPosition: { GK: { rating: 0.8 } } }, baseValue: 100, scaleFactor: 900, minPrice: 10, defaultReputation: 20 },
      'la-clave',
    );
    expect(container.querySelector('form')).toBeNull();
    expect(container.querySelector('[role="status"]')?.textContent).toContain('Recalculá para aplicarla');
  });

  it('una clave incorrecta se informa, y el formulario sigue abierto con lo escrito', async () => {
    createVersion.mockRejectedValue({ response: { status: 401, data: { message: 'Unauthorized' } } });
    typeKey('mal');
    await act(async () => [...container.querySelectorAll('button')].filter((b) => b.textContent === 'Configurar')[0].click());
    await submit();
    await click('confirmar');

    expect(container.querySelector('[role="alert"]')?.textContent).toBe('La clave administrativa es incorrecta.');
    expect(container.querySelector('form')).not.toBeNull();
  });

  it('muestra los motivos con los que el backend rechaza una configuración', async () => {
    createVersion.mockRejectedValue({ response: { status: 400, data: { message: ['weights.general: debe tener al menos un peso positivo'] } } });
    typeKey();
    await act(async () => [...container.querySelectorAll('button')].filter((b) => b.textContent === 'Configurar')[0].click());
    await submit();
    await click('confirmar');

    expect(container.querySelector('[role="alert"]')?.textContent).toContain('al menos un peso positivo');
  });

  it('si falla la carga permite reintentar', async () => {
    act(() => root.unmount());
    list.mockRejectedValueOnce(new Error('caído'));
    root = createRoot(container);
    await act(async () => root.render(<AdminStrategies />));
    expect(container.textContent).toContain('No se pudieron cargar las estrategias.');

    await click('Reintentar');
    expect(container.textContent).toContain('Performance');
  });
});
