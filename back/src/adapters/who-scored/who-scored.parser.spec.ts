import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { WhoScoredParser } from './who-scored.parser';

// spec.md §9: parser probado contra fixtures locales, nunca contra el sitio real en tests.
const FIXTURES_DIR = join(process.cwd(), 'test/fixtures/who-scored');

function loadFixture(name: string): string {
  return readFileSync(join(FIXTURES_DIR, name), 'utf8');
}

describe('WhoScoredParser', () => {
  const parser = new WhoScoredParser();

  describe('plantel de equipo (squad)', () => {
    it('parsea la sub-pestaña Summary con Player/CM/Goals/SpG/Rating', () => {
      const rows = parser.parseStatsGrid(loadFixture('squad-summary.html'));

      expect(rows).toHaveLength(3);
      expect(rows[0]).toMatchObject({
        href: '/players/367185/show/bukayo-saka',
        label: 'Bukayo Saka',
        values: expect.objectContaining({ CM: '178', Goals: '3', SpG: '3.3', Rating: '7.60' }),
      });
    });

    it('parsea la sub-pestaña Offensive con KeyP/Drb (dribbles completados)', () => {
      const rows = parser.parseStatsGrid(loadFixture('squad-offensive.html'));

      expect(rows[0].values.KeyP).toBe('1.8');
      expect(rows[0].values.Drb).toBe('2.3');
    });

    it('parsea la sub-pestaña Defensive con Tackles (Drb acá es una métrica distinta)', () => {
      const rows = parser.parseStatsGrid(loadFixture('squad-defensive.html'));

      expect(rows[0].values.Tackles).toBe('1.3');
      // "Drb" en Defensive = driblado en contra, no dribbles completados (data-model.md).
      expect(rows[0].values.Drb).toBe('0.5');
    });

    it('devuelve [] si la tabla no está presente en el HTML', () => {
      expect(parser.parseStatsGrid('<html><body>sin tabla</body></html>')).toEqual([]);
    });
  });

  describe('partido a partido de un jugador (match log)', () => {
    it('parsea la sub-pestaña Summary con Opponent/Date/Shots/Rating', () => {
      const rows = parser.parseStatsGrid(loadFixture('match-summary.html'));

      expect(rows).toHaveLength(2);
      expect(rows[0]).toMatchObject({
        href: '/matches/2007643/show/international-fifa-world-cup-2026-france-england',
        label: 'France (A)',
        values: expect.objectContaining({ Date: '19-07-2026', Shots: '5', Rating: '9.46' }),
      });
    });

    it('parsea la sub-pestaña Defensive con Tackles', () => {
      const rows = parser.parseStatsGrid(loadFixture('match-defensive.html'));

      expect(rows[0].values.Tackles).toBe('2');
    });
  });

  describe('tabla de posiciones de una liga (standings)', () => {
    it('descarta las 3 filas de encabezado y extrae nombre+href de las filas de datos', () => {
      const rows = parser.parseStandingsGrid(loadFixture('standings.html'));

      expect(rows).toEqual([
        { href: '/teams/65/show/spain-barcelona', label: 'Barcelona' },
        { href: '/teams/52/show/spain-real-madrid', label: 'Real Madrid' },
        { href: '/teams/59/show/spain-villarreal', label: 'Villarreal' },
      ]);
    });

    it('devuelve [] si la tabla no está presente en el HTML', () => {
      expect(parser.parseStandingsGrid('<html><body>sin tabla</body></html>')).toEqual([]);
    });
  });
});
