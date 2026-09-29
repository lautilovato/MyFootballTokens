import { describe, expect, it } from 'vitest';
import { toPlayerCardData } from '../player-card.mapper';
import type { ApiPlayerCard } from '../players.service';

const BASE: ApiPlayerCard = {
  id: '2f1c9d2e-0b3a-4c5d-8e6f-7a8b9c0d1e2f',
  name: 'Erling Haaland',
  position: 'FW',
  ovr: 86,
  rarity: 'legendary',
  club: { name: 'Manchester City', crestUrl: null },
  nationality: { name: 'Norway', code: 'no' },
  goals: 29,
  assists: 5,
  marketValue: 8450,
  changePct: 12.5,
  supply: { minted: 100, total: 100 },
  priceHistory: Array.from({ length: 30 }, (_, i) => 8000 + i * 15),
};

/** T016 / FR-020, FR-026 — el componente de carta está congelado: todo se resuelve acá. */
describe('player-card.mapper', () => {
  it('traduce los campos que la carta necesita', () => {
    const card = toPlayerCardData(BASE);

    expect(card.name).toBe('Erling Haaland');
    expect(card.position).toBe('FW');
    expect(card.overall).toBe(86);
    expect(card.token).toEqual({ rarity: 'legendary', supply: 100, minted: 100 });
    expect(card.price.current).toBe(8450);
    expect(card.price.changePct).toBe(12.5);
    expect(card.price.history).toHaveLength(30);
  });

  it('deja el escudo sin definir cuando el club no tiene imagen (FR-026)', () => {
    const card = toPlayerCardData(BASE);
    // Sin definir, no cadena vacía: el componente dibuja su escudo con iniciales.
    expect(card.club.crestUrl).toBeUndefined();
    expect(card.club.name).toBe('Manchester City');
  });

  it('pasa el escudo cuando sí existe', () => {
    const card = toPlayerCardData({
      ...BASE,
      club: { name: 'Manchester City', crestUrl: 'https://crests.example/mc.png' },
    });
    expect(card.club.crestUrl).toBe('https://crests.example/mc.png');
  });

  it('nunca define photoUrl: no hay fotos cargadas y el componente dibuja su silueta', () => {
    expect(toPlayerCardData(BASE).photoUrl).toBeUndefined();
  });

  it('conserva los 30 puntos de la serie para que el sparkline se dibuje', () => {
    const card = toPlayerCardData(BASE);
    // El componente solo dibuja el sparkline con más de un punto.
    expect(card.price.history.length).toBeGreaterThan(1);
  });

  it('muestra guion en las métricas del jugador sin estadísticas (FR-015)', () => {
    const card = toPlayerCardData({ ...BASE, ovr: null, goals: null, assists: null, rarity: 'common' });

    expect(card.overall).toBe(0);
    expect(card.token.rarity).toBe('common');
    expect(card.stats.find((s) => s.label === 'G')?.value).toBe('—');
    expect(card.stats.find((s) => s.label === 'A')?.value).toBe('—');
    expect(card.stats.find((s) => s.label === 'OVR')?.value).toBe('—');
  });

  it('distingue un cero real de un sin dato', () => {
    const card = toPlayerCardData({ ...BASE, goals: 0, assists: 0 });
    expect(card.stats.find((s) => s.label === 'G')?.value).toBe(0);
    expect(card.stats.find((s) => s.label === 'A')?.value).toBe(0);
  });

  it('deja el código de bandera vacío si el país no está mapeado', () => {
    const card = toPlayerCardData({ ...BASE, nationality: { name: 'Wakanda', code: null } });
    expect(card.nationality.code).toBe('');
    expect(card.nationality.name).toBe('Wakanda');
  });

  it('traduce la subdivisión británica tal como la manda el backend', () => {
    const card = toPlayerCardData({ ...BASE, nationality: { name: 'England', code: 'gb-eng' } });
    expect(card.nationality.code).toBe('gb-eng');
  });

  it('mapea UNKNOWN a una posición que la carta sabe dibujar', () => {
    expect(toPlayerCardData({ ...BASE, position: 'UNKNOWN' }).position).toBe('MF');
  });
});
