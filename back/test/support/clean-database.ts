import type { EntityManager } from '@mikro-orm/postgresql';

/**
 * Vacía las tablas de 08-sobres (créditos, tokens y sobres) y de 09-mercado (publicaciones y
 * compras). Va primero en la limpieza de cada e2e porque sus FK apuntan a `player` y a `user`.
 *
 * Usa `TRUNCATE` y no `DELETE`: los registros financieros tienen triggers que rechazan UPDATE y
 * DELETE (08 FR-040, 09 FR-030), y `TRUNCATE` no los dispara. Tampoco dispara el de `listing`,
 * que solo admite cerrar una publicación.
 */
export async function cleanPacksData(em: EntityManager): Promise<void> {
  await em.execute(
    'truncate table "token_purchase", "listing", "pack_opening_card", "pack_opening", "credit_movement", "token_event", "token", "pack", "pack_batch" cascade',
  );
}
