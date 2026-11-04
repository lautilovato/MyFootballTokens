import { Migration } from '@mikro-orm/migrations';

/**
 * Historial de operaciones (10-historial-operaciones, data-model.md, research #1):
 *
 * - `token_purchase.quote_id`: la cotización del jugador vigente cuando se fijó el precio de la
 *   compra. Con ella, la estrategia y la versión de cada compra y venta salen de su propio
 *   registro, sin depender de cuándo se recalculó (el precio nuevo rige al commitear el
 *   recálculo, y `calculated_at` se toma al empezarlo).
 * - Relleno de las compras existentes: la cotización del mismo jugador con `calculated_at <=
 *   created_at`, prefiriendo la que tiene el precio cobrado y, entre ellas, la más reciente. Las
 *   compras posteriores la completan en `purchase()`.
 * - `token_purchase` es inmutable por trigger (09-mercado FR-030). Solo para el relleno, el
 *   trigger se desactiva y se vuelve a activar dentro de la misma transacción de la migración
 *   (`ALTER TABLE ... DISABLE TRIGGER` exige ser dueño de la tabla, y la migración lo es). El
 *   relleno no cambia ningún valor financiero. Si algo falla, la transacción se revierte entera
 *   y el trigger queda como estaba.
 *
 * Generada con `migration:create` para actualizar `.snapshot.json`. El generador también propone
 * borrar los índices, CHECK y triggers de migraciones anteriores que no están declarados en las
 * entidades, y agregar `on delete set null` a las FK: esas líneas no se incluyen a propósito,
 * igual que en `Migration20261013191200` y `Migration20261020120000`.
 */
export class Migration20261026120000 extends Migration {

  override name = 'Migration20261026120000';

  override up(): void | Promise<void> {
    this.addSql(`alter table "token_purchase" add column "quote_id" uuid null;`);
    this.addSql(`alter table "token_purchase" add constraint "token_purchase_quote_id_foreign" foreign key ("quote_id") references "player_quote" ("id");`);

    this.addSql(`alter table "token_purchase" disable trigger "token_purchase_immutable";`);
    this.addSql(`update "token_purchase" tp set "quote_id" = (
  select q."id"
    from "player_quote" q
   where q."player_id" = tp."player_id" and q."calculated_at" <= tp."created_at"
   order by (q."price" = tp."price") desc, q."calculated_at" desc
   limit 1
);`);
    this.addSql(`alter table "token_purchase" enable trigger "token_purchase_immutable";`);
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table "token_purchase" drop constraint "token_purchase_quote_id_foreign";`);
    this.addSql(`alter table "token_purchase" drop column "quote_id";`);
  }

}
