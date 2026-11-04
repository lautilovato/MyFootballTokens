import { Migration } from '@mikro-orm/migrations';

/**
 * Mercado de tokens (09-mercado, data-model.md):
 *
 * - Tabla `listing` (publicación) con el índice único parcial `listing_token_active_unique`: a lo
 *   sumo una publicación activa por token (FR-004). `listing_player_active_index` sirve al Market,
 *   al conteo `forSaleCount` y a la lista del detalle (research #8).
 * - Tabla `token_purchase` (compra) con `listing_id` único: una publicación se vende una sola vez
 *   (SC-003). Sus CHECK fijan que el vendedor recibe exactamente lo que paga el comprador (FR-018).
 * - CHECK ampliados en `credit_movement.type` y `token_event.type` (FR-020, FR-023).
 * - Inmutabilidad (FR-030): `token_purchase` usa `forbid_mutation()` de 08; `listing` solo admite
 *   su cierre, con el trigger `listing_close_only` (research #3). `TRUNCATE` no los dispara.
 *
 * Generada con `migration:create` para actualizar `.snapshot.json`. El generador también propone
 * borrar los índices, CHECK y triggers de migraciones anteriores que no están declarados en las
 * entidades: esas líneas no se incluyen a propósito, igual que en `Migration20261013191200`.
 */
export class Migration20261020120000 extends Migration {

  override name = 'Migration20261020120000';

  override up(): void | Promise<void> {
    this.addSql(`create table "listing" ("id" uuid not null, "token_id" uuid not null, "player_id" uuid not null, "seller_id" uuid null, "status" text not null, "created_at" timestamptz not null, "correlation_id" varchar(255) not null, "closed_at" timestamptz null, "closed_correlation_id" varchar(255) null, primary key ("id"));`);
    this.addSql(`alter table "listing" add constraint "listing_token_id_foreign" foreign key ("token_id") references "token" ("id");`);
    this.addSql(`alter table "listing" add constraint "listing_player_id_foreign" foreign key ("player_id") references "player" ("id");`);
    this.addSql(`alter table "listing" add constraint "listing_seller_id_foreign" foreign key ("seller_id") references "user" ("id");`);
    this.addSql(`alter table "listing" add constraint "listing_status_check" check ("status" in ('activa', 'vendida', 'retirada'));`);
    this.addSql(`alter table "listing" add constraint "listing_closed_check" check ((("status" = 'activa') = ("closed_at" is null)) and (("closed_at" is null) = ("closed_correlation_id" is null)));`);
    this.addSql(`create unique index "listing_token_active_unique" on "listing" ("token_id") where "status" = 'activa';`);
    this.addSql(`create index "listing_player_active_index" on "listing" ("player_id", "created_at", "id") where "status" = 'activa';`);
    this.addSql(`create index "listing_seller_index" on "listing" ("seller_id") where "seller_id" is not null;`);

    this.addSql(`create table "token_purchase" ("id" uuid not null, "listing_id" uuid not null, "token_id" uuid not null, "player_id" uuid not null, "buyer_id" uuid not null, "seller_id" uuid null, "accepted_price" int not null, "price" int not null, "rarity" varchar(255) not null, "buyer_balance_before" int not null, "buyer_balance_after" int not null, "seller_balance_before" int null, "seller_balance_after" int null, "buyer_movement_id" uuid not null, "seller_movement_id" uuid null, "correlation_id" varchar(255) not null, "created_at" timestamptz not null, primary key ("id"));`);
    this.addSql(`alter table "token_purchase" add constraint "token_purchase_listing_id_unique" unique ("listing_id");`);
    this.addSql(`alter table "token_purchase" add constraint "token_purchase_listing_id_foreign" foreign key ("listing_id") references "listing" ("id");`);
    this.addSql(`alter table "token_purchase" add constraint "token_purchase_token_id_foreign" foreign key ("token_id") references "token" ("id");`);
    this.addSql(`alter table "token_purchase" add constraint "token_purchase_player_id_foreign" foreign key ("player_id") references "player" ("id");`);
    this.addSql(`alter table "token_purchase" add constraint "token_purchase_buyer_id_foreign" foreign key ("buyer_id") references "user" ("id");`);
    this.addSql(`alter table "token_purchase" add constraint "token_purchase_seller_id_foreign" foreign key ("seller_id") references "user" ("id");`);
    this.addSql(`alter table "token_purchase" add constraint "token_purchase_buyer_movement_id_foreign" foreign key ("buyer_movement_id") references "credit_movement" ("id");`);
    this.addSql(`alter table "token_purchase" add constraint "token_purchase_seller_movement_id_foreign" foreign key ("seller_movement_id") references "credit_movement" ("id");`);
    this.addSql(`alter table "token_purchase" add constraint "token_purchase_price_check" check ("price" > 0 and "price" <= "accepted_price");`);
    this.addSql(`alter table "token_purchase" add constraint "token_purchase_buyer_balance_check" check ("buyer_balance_after" >= 0 and "buyer_balance_after" = "buyer_balance_before" - "price");`);
    // Sin comisión (FR-018): o vende la plataforma (todo el lado del vendedor nulo), o el vendedor
    // recibe exactamente el precio.
    this.addSql(`alter table "token_purchase" add constraint "token_purchase_seller_check" check (
      ("seller_id" is null and "seller_balance_before" is null and "seller_balance_after" is null and "seller_movement_id" is null)
      or ("seller_id" is not null and "seller_balance_before" is not null and "seller_balance_after" is not null
          and "seller_movement_id" is not null and "seller_balance_after" = "seller_balance_before" + "price")
    );`);
    this.addSql(`alter table "token_purchase" add constraint "token_purchase_not_self_check" check ("seller_id" is null or "seller_id" <> "buyer_id");`);
    this.addSql(`create index "token_purchase_buyer_id_created_at_index" on "token_purchase" ("buyer_id", "created_at" desc);`);
    this.addSql(`create index "token_purchase_seller_id_created_at_index" on "token_purchase" ("seller_id", "created_at" desc) where "seller_id" is not null;`);

    this.addSql(`alter table "credit_movement" drop constraint "credit_movement_type_check";`);
    this.addSql(`alter table "credit_movement" add constraint "credit_movement_type_check" check ("type" in ('entrega_inicial', 'compra_sobre', 'compra_token', 'venta_token'));`);
    this.addSql(`alter table "token_event" drop constraint "token_event_type_check";`);
    this.addSql(`alter table "token_event" add constraint "token_event_type_check" check ("type" in ('emision', 'asignacion_a_sobre', 'entrega_en_sobre', 'devolucion_a_plataforma', 'puesta_en_venta', 'retiro_de_venta', 'venta'));`);

    this.addSql(`create trigger "token_purchase_immutable" before update or delete on "token_purchase" for each row execute function "forbid_mutation"();`);

    // La publicación solo se cierra (FR-030, research #3): de `activa` a `vendida` o `retirada`,
    // cargando la fecha y la trazabilidad del cierre. Cualquier otro cambio y todo DELETE fallan.
    this.addSql(`create function "listing_close_only"() returns trigger language plpgsql as $$
begin
  if TG_OP = 'DELETE' then
    raise exception 'listing es inmutable: no admite DELETE';
  end if;
  if OLD."status" <> 'activa' or NEW."status" not in ('vendida', 'retirada')
     or NEW."id" <> OLD."id" or NEW."token_id" <> OLD."token_id" or NEW."player_id" <> OLD."player_id"
     or NEW."seller_id" is distinct from OLD."seller_id" or NEW."created_at" <> OLD."created_at"
     or NEW."correlation_id" <> OLD."correlation_id" then
    raise exception 'listing solo admite pasar de activa a vendida o retirada';
  end if;
  return NEW;
end;
$$;`);
    this.addSql(`create trigger "listing_close_only" before update or delete on "listing" for each row execute function "listing_close_only"();`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "token_purchase" cascade;`);
    this.addSql(`drop table if exists "listing" cascade;`);
    this.addSql(`drop function if exists "listing_close_only"();`);

    this.addSql(`alter table "token_event" drop constraint "token_event_type_check";`);
    this.addSql(`alter table "token_event" add constraint "token_event_type_check" check ("type" in ('emision', 'asignacion_a_sobre', 'entrega_en_sobre', 'devolucion_a_plataforma', 'puesta_en_venta'));`);
    this.addSql(`alter table "credit_movement" drop constraint "credit_movement_type_check";`);
    this.addSql(`alter table "credit_movement" add constraint "credit_movement_type_check" check ("type" in ('entrega_inicial', 'compra_sobre'));`);
  }

}
