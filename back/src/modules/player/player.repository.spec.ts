import type { EntityManager } from '@mikro-orm/postgresql';
import { PlayerRepository } from './player.repository';

describe('PlayerRepository.findAndCount', () => {
  it('sin temporada cargada devuelve un listado vacío sin consultar la base', async () => {
    // Solo se listan jugadores con estadísticas de la temporada vigente: si no hay ninguna,
    // no hay a quién mostrar. Cualquier acceso al EntityManager haría fallar el test.
    const em = new Proxy({} as EntityManager, {
      get: (_target, property) => {
        throw new Error(`no debería consultar la base (accedió a em.${String(property)})`);
      },
    });
    const repository = new PlayerRepository(em);

    await expect(repository.findAndCount({ page: 1, limit: 20 }, null)).resolves.toEqual([[], 0]);
  });
});
