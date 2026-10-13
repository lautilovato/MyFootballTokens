import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { WhoScoredAdapter } from './who-scored.adapter';
import { WhoScoredClient } from './who-scored.client';
import { WhoScoredParser } from './who-scored.parser';

// spec.md §9: se prueba contra fixtures locales, nunca contra el sitio real.
const FIXTURES_DIR = join(process.cwd(), 'test/fixtures/who-scored');

function loadFixture(name: string): string {
  return readFileSync(join(FIXTURES_DIR, name), 'utf8');
}

/** Reemplaza el fetch headless: devuelve las pestañas del plantel tal como las capturaría. */
function adapterWithSquadTabs(summaryHtml: string): WhoScoredAdapter {
  const client = {
    fetchStatsTabs: async () =>
      new Map([
        ['Summary', summaryHtml],
        ['Offensive', loadFixture('squad-offensive.html')],
        ['Defensive', loadFixture('squad-defensive.html')],
      ]),
  } as unknown as WhoScoredClient;
  return new WhoScoredAdapter(client, new WhoScoredParser());
}

describe('WhoScoredAdapter.getSquadStats — partidos jugados', () => {
  it('toma la columna Apps como partidos jugados', async () => {
    const stats = await adapterWithSquadTabs(loadFixture('squad-summary.html')).getSquadStats('13');

    expect(stats.map((s) => s.matchesPlayed)).toEqual([4, 4, 1]);
  });

  it('suma titularidades e ingresos desde el banco ("25(3)" son 28 partidos)', async () => {
    const summary = loadFixture('squad-summary.html').replace('<td>4</td><td>338</td>', '<td>25(3)</td><td>338</td>');

    const [saka] = await adapterWithSquadTabs(summary).getSquadStats('13');

    expect(saka.matchesPlayed).toBe(28);
  });

  it('un valor vacío o "-" cuenta como cero partidos', async () => {
    const summary = loadFixture('squad-summary.html').replace('<td>4</td><td>338</td>', '<td>-</td><td>338</td>');

    const [saka] = await adapterWithSquadTabs(summary).getSquadStats('13');

    expect(saka.matchesPlayed).toBe(0);
  });
});
