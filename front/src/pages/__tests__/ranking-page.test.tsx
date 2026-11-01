import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import RankingPage from '../RankingPage';
import type { ApiPlayerCard } from '../../services/players.service';
import { getPlayerRanking, type PlayerRanking, type RankingEntry } from '../../services/ranking.service';

vi.mock('../../services/ranking.service', () => ({ getPlayerRanking: vi.fn() }));
vi.mock('../../services/useAuth', () => ({ useAuth: () => ({ user: { username: 'ana', role: 'user' }, logout: vi.fn() }) }));
vi.mock('../../app/useCredits', () => ({ useCredits: () => ({ balance: 1800 }) }));

const fetchRanking = vi.mocked(getPlayerRanking);

function entry(rank: number, name: string, marketValue: number, inCirculation: number): RankingEntry {
  const player: ApiPlayerCard = {
    id: `p-${rank}`,
    name,
    position: 'FW',
    ovr: 90,
    rarity: 'legendary',
    club: { name: 'E2E FC', crestUrl: null },
    nationality: { name: 'Argentina', code: 'ar' },
    imageUrl: null,
    goals: 1,
    assists: 0,
    marketValue,
    changePct: 0,
    supply: { minted: 100, total: 100 },
    forSaleCount: 0, firstListedSerial: null,
    priceHistory: [],
  };
  return { rank, inCirculation, player };
}

function ranking(data: RankingEntry[], calculatedAt: string | null = '2026-10-31T12:00:00.000Z'): PlayerRanking {
  return { strategy: { key: 'performance', name: 'Performance', version: 2 }, calculatedAt, data };
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  );
  fetchRanking.mockReset();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

async function render() {
  await act(async () =>
    root.render(
      <MemoryRouter initialEntries={['/ranking']}>
        <RankingPage />
      </MemoryRouter>,
    ),
  );
}

const button = (label: string) => [...container.querySelectorAll('button')].find((b) => b.textContent === label);

/** 13-ranking — top de jugadores y cartas en circulación. */
describe('RankingPage', () => {
  it('muestra el top en orden, con su puesto (FR-001)', async () => {
    fetchRanking.mockResolvedValue(ranking([entry(1, 'Ana Alta', 9000, 3), entry(2, 'Beto Bajo', 5000, 0)]));
    await render();

    const places = [...container.querySelectorAll('ol > li')].map((li) => li.textContent);
    expect(places).toHaveLength(2);
    expect(places[0]).toMatch(/Ana Alta.*1/);
    expect(places[1]).toMatch(/Beto Bajo.*2/);
  });

  it('los tres primeros van al podio y el resto en filas, sin perder el puesto (FR-008)', async () => {
    fetchRanking.mockResolvedValue(
      ranking([
        entry(1, 'Ana Alta', 9000, 3),
        entry(2, 'Beto Bajo', 5000, 0),
        entry(3, 'Caro Cruz', 4000, 1),
        entry(4, 'Dani Diaz', 3000, 0),
        entry(5, 'Eva Rey', 2500, 0),
      ]),
    );
    await render();

    const podium = container.querySelector('ol[aria-label="Podio"]')!;
    expect(podium.querySelectorAll('li')).toHaveLength(3);
    expect(podium.querySelectorAll('[role="article"]')).toHaveLength(3);
    expect(podium.querySelector('li')!.textContent).toContain('9.000 créditos');

    const rest = container.querySelector('ol[aria-label="Resto del top"]')!;
    expect(rest.getAttribute('start')).toBe('4');
    expect(rest.querySelectorAll('[role="article"]')).toHaveLength(0);
    expect([...rest.querySelectorAll('li')].map((li) => li.textContent)).toEqual([
      '4DDani DiazE2E FCOVR 903.000 créditos',
      '5EEva ReyE2E FCOVR 902.500 créditos',
    ]);
  });

  it('con tres jugadores o menos no muestra las filas (FR-008)', async () => {
    fetchRanking.mockResolvedValue(ranking([entry(1, 'Ana Alta', 9000, 3)]));
    await render();

    expect(container.querySelector('ol[aria-label="Podio"]')).not.toBeNull();
    expect(container.querySelector('ol[aria-label="Resto del top"]')).toBeNull();
  });

  it('debajo del top muestra cuántas cartas de cada jugador circulan, aun con cero (FR-005)', async () => {
    fetchRanking.mockResolvedValue(ranking([entry(1, 'Ana Alta', 9000, 3), entry(2, 'Beto Bajo', 5000, 0)]));
    await render();

    const section = container.querySelector('section[aria-labelledby="ranking-circulation-title"]')!;
    const rows = [...section.querySelectorAll('li')].map((li) => li.textContent);
    expect(rows).toEqual(['1Ana Alta3 de 100', '2Beto Bajo0 de 100']);

    const top = container.querySelector('ol')!;
    expect(top.compareDocumentPosition(section) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('sin cotizaciones de la estrategia activa muestra un estado vacío (FR-007)', async () => {
    fetchRanking.mockResolvedValue(ranking([], null));
    await render();

    expect(container.textContent).toContain('Todavía no hay ranking');
    expect(container.querySelector('ol')).toBeNull();
    expect(container.querySelector('section')).toBeNull();
  });

  it('si falla la carga, permite reintentar', async () => {
    fetchRanking.mockRejectedValueOnce(new Error('boom'));
    await render();
    expect(container.textContent).toContain('No se pudo cargar el ranking');

    fetchRanking.mockResolvedValue(ranking([entry(1, 'Ana Alta', 9000, 3)]));
    await act(async () => button('Reintentar')!.click());

    expect(container.textContent).not.toContain('No se pudo cargar el ranking');
    expect(container.querySelectorAll('ol > li')).toHaveLength(1);
  });
});
