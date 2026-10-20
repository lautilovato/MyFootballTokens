import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';

/**
 * Persistencia del saldo y de sus movimientos (08-sobres FR-001 a FR-007).
 *
 * Usa el `EntityManager` inyectado, que dentro de un `em.transactional` resuelve la transacción
 * en curso (TransactionContext de MikroORM): así la entrega inicial se suma a la transacción del
 * registro sin recibir un parámetro extra (research #3).
 */
@Injectable()
export class CreditsRepository {
  constructor(private readonly em: EntityManager) {}

  /** Corre `work` en una transacción; si ya hay una en curso, se suma a ella. */
  async inTransaction<T>(work: () => Promise<T>): Promise<T> {
    return this.em.transactional(() => work());
  }

  /**
   * Acredita la entrega inicial si el usuario todavía no la recibió (FR-002). Devuelve `false`
   * si ya la tenía, sin tocar el saldo.
   *
   * Usa `on conflict do nothing` contra el índice único parcial y no captura la excepción de
   * unicidad: un error dentro de la transacción la abortaría, y con ella el registro.
   */
  async insertInitialGrant(userId: string, amount: number, correlationId: string): Promise<boolean> {
    const [user] = await this.em.execute<{ credits: number }[]>(
      'select "credits" from "user" where "id" = ? for update',
      [userId],
    );
    if (!user) throw new Error(`user ${userId} not found`);
    const before = Number(user.credits);

    const inserted = await this.em.execute<{ id: string }[]>(
      `insert into "credit_movement"
         ("id", "user_id", "type", "amount", "balance_before", "balance_after",
          "reference_type", "reference_id", "correlation_id", "created_at")
       values (?, ?, 'entrega_inicial', ?, ?, ?, null, null, ?, now())
       on conflict ("user_id") where "type" = 'entrega_inicial' do nothing
       returning "id"`,
      [randomUUID(), userId, amount, before, before + amount, correlationId],
    );
    if (inserted.length === 0) return false;

    await this.em.execute('update "user" set "credits" = "credits" + ? where "id" = ?', [amount, userId]);
    return true;
  }

  /** Usuarios sin entrega inicial, de a tandas (regularización de FR-002). */
  async findUsersWithoutInitialGrant(limit: number): Promise<string[]> {
    const rows = await this.em.execute<{ id: string }[]>(
      `select u."id"
         from "user" u
        where not exists (
          select 1 from "credit_movement" m
           where m."user_id" = u."id" and m."type" = 'entrega_inicial'
        )
        order by u."created_at", u."id"
        limit ?`,
      [limit],
    );
    return rows.map((row) => row.id);
  }

  async getBalance(userId: string): Promise<number | null> {
    const [row] = await this.em.execute<{ credits: number }[]>(
      'select "credits" from "user" where "id" = ?',
      [userId],
    );
    return row ? Number(row.credits) : null;
  }
}
