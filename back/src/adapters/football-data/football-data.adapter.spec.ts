import { FootballDataAdapter } from './football-data.adapter';
import { FootballDataClient } from './football-data.client';

function adapterReturning(competition: { id: number; code: string; name: string }) {
  const client = {
    get: async () => ({ ...competition, area: { name: 'Spain' } }),
  } as unknown as FootballDataClient;
  return new FootballDataAdapter(client);
}

describe('FootballDataAdapter', () => {
  describe('getLeague', () => {
    it('muestra la liga española como "LaLiga" y no con el nombre de la API', async () => {
      const adapter = adapterReturning({ id: 2014, code: 'PD', name: 'Primera Division' });

      const league = await adapter.getLeague('PD');

      expect(league).toEqual({ externalId: 2014, code: 'PD', name: 'LaLiga', country: 'Spain' });
    });

    it('mantiene el nombre de la API para las ligas sin reemplazo', async () => {
      const adapter = adapterReturning({ id: 2021, code: 'PL', name: 'Premier League' });

      const league = await adapter.getLeague('PL');

      expect(league.name).toBe('Premier League');
    });
  });
});
