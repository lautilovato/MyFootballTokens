import { Migration } from '@mikro-orm/migrations';

/**
 * Créditos, sobres e inventario (08-sobres, data-model.md):
 *
 * - `user.credits` con CHECK de saldo no negativo (FR-004).
 * - Tablas `credit_movement`, `token`, `token_event`, `pack_batch`, `pack`, `pack_opening` y
 *   `pack_opening_card`, con los CHECK de enums y de consistencia de saldos.
 * - Índice único parcial `credit_movement_user_initial_unique`: a lo sumo una entrega inicial
 *   por usuario (FR-002, research #3).
 * - Triggers que rechazan UPDATE y DELETE en los registros financieros (FR-040, research #4).
 *   `TRUNCATE` no los dispara: los tests e2e limpian con él.
 * - Índice sobre `player.world_reputation`, que pasa a ser el OVR (FR-067).
 *
 * Los índices funcionales y parciales de migraciones anteriores no están declarados en las
 * entidades, así que el generador propone borrarlos: esas líneas no se incluyen a propósito.
 */
export class Migration20261013191200 extends Migration {

  override name = 'Migration20261013191200';

  override up(): void | Promise<void> {
    this.addSql(`alter table "user" add "credits" int not null default 0;`);
    this.addSql(`alter table "user" add constraint "user_credits_check" check ("credits" >= 0);`);

    this.addSql(`create table "pack_batch" ("id" uuid not null, "number" serial, "token_count" int not null, "params" jsonb not null, "composition" jsonb not null, "correlation_id" varchar(255) not null, "created_at" timestamptz not null, primary key ("id"));`);
    this.addSql(`alter table "pack_batch" add constraint "pack_batch_number_unique" unique ("number");`);
    this.addSql(`alter table "pack_batch" add constraint "pack_batch_token_count_check" check ("token_count" > 0 and "token_count" % 100 = 0);`);

    this.addSql(`create table "pack" ("id" uuid not null, "batch_id" uuid not null, "type" text not null, "card_count" smallint not null, "status" text not null, "opened_at" timestamptz null, "created_at" timestamptz not null, primary key ("id"));`);
    this.addSql(`alter table "pack" add constraint "pack_batch_id_foreign" foreign key ("batch_id") references "pack_batch" ("id");`);
    this.addSql(`alter table "pack" add constraint "pack_type_check" check ("type" in ('common', 'rare', 'epic', 'legendary'));`);
    this.addSql(`alter table "pack" add constraint "pack_status_check" check ("status" in ('sin_abrir', 'abierto'));`);
    this.addSql(`alter table "pack" add constraint "pack_card_count_check" check ("card_count" > 0);`);
    this.addSql(`alter table "pack" add constraint "pack_opened_at_check" check (("status" = 'abierto') = ("opened_at" is not null));`);
    // Sorteo y conteo de stock (research #8).
    this.addSql(`create index "pack_unopened_type_index" on "pack" ("type", "id") where "status" = 'sin_abrir';`);
    this.addSql(`create index "pack_batch_id_index" on "pack" ("batch_id");`);

    this.addSql(`create table "token" ("id" uuid not null, "player_id" uuid not null, "serial" smallint not null, "status" text not null, "owner_id" uuid null, "pack_id" uuid null, "created_at" timestamptz not null, "updated_at" timestamptz null, primary key ("id"));`);
    this.addSql(`alter table "token" add constraint "token_player_id_serial_unique" unique ("player_id", "serial");`);
    this.addSql(`alter table "token" add constraint "token_player_id_foreign" foreign key ("player_id") references "player" ("id");`);
    this.addSql(`alter table "token" add constraint "token_owner_id_foreign" foreign key ("owner_id") references "user" ("id");`);
    this.addSql(`alter table "token" add constraint "token_pack_id_foreign" foreign key ("pack_id") references "pack" ("id");`);
    this.addSql(`alter table "token" add constraint "token_status_check" check ("status" in ('reservado', 'en_sobre', 'de_usuario', 'en_venta_plataforma'));`);
    this.addSql(`alter table "token" add constraint "token_serial_check" check ("serial" between 1 and 100);`);
    // Un token tiene dueño de usuario si y solo si está en poder de un usuario (constitución §5).
    this.addSql(`alter table "token" add constraint "token_owner_check" check (("status" = 'de_usuario') = ("owner_id" is not null));`);
    this.addSql(`create index "token_owned_index" on "token" ("owner_id", "player_id") where "status" = 'de_usuario';`);
    this.addSql(`create index "token_pack_id_index" on "token" ("pack_id");`);
    this.addSql(`create index "token_reserved_player_index" on "token" ("player_id") where "status" = 'reservado';`);

    this.addSql(`create table "token_event" ("id" uuid not null, "token_id" uuid not null, "type" text not null, "from_status" text null, "to_status" text not null, "from_owner_id" uuid null, "to_owner_id" uuid null, "quote_price" int null, "rarity" varchar(255) null, "reference_type" varchar(255) null, "reference_id" uuid null, "correlation_id" varchar(255) not null, "created_at" timestamptz not null, primary key ("id"));`);
    this.addSql(`alter table "token_event" add constraint "token_event_token_id_foreign" foreign key ("token_id") references "token" ("id");`);
    this.addSql(`alter table "token_event" add constraint "token_event_type_check" check ("type" in ('emision', 'asignacion_a_sobre', 'entrega_en_sobre', 'devolucion_a_plataforma', 'puesta_en_venta'));`);
    this.addSql(`alter table "token_event" add constraint "token_event_from_status_check" check ("from_status" in ('reservado', 'en_sobre', 'de_usuario', 'en_venta_plataforma'));`);
    this.addSql(`alter table "token_event" add constraint "token_event_to_status_check" check ("to_status" in ('reservado', 'en_sobre', 'de_usuario', 'en_venta_plataforma'));`);
    this.addSql(`create index "token_event_token_id_created_at_index" on "token_event" ("token_id", "created_at");`);
    this.addSql(`create index "token_event_to_owner_id_index" on "token_event" ("to_owner_id") where "to_owner_id" is not null;`);

    this.addSql(`create table "credit_movement" ("id" uuid not null, "user_id" uuid not null, "type" text not null, "amount" int not null, "balance_before" int not null, "balance_after" int not null, "reference_type" varchar(255) null, "reference_id" uuid null, "correlation_id" varchar(255) not null, "created_at" timestamptz not null, primary key ("id"));`);
    this.addSql(`alter table "credit_movement" add constraint "credit_movement_user_id_foreign" foreign key ("user_id") references "user" ("id");`);
    this.addSql(`alter table "credit_movement" add constraint "credit_movement_type_check" check ("type" in ('entrega_inicial', 'compra_sobre'));`);
    this.addSql(`alter table "credit_movement" add constraint "credit_movement_amount_check" check ("amount" <> 0);`);
    this.addSql(`alter table "credit_movement" add constraint "credit_movement_balance_check" check ("balance_before" >= 0 and "balance_after" >= 0 and "balance_after" = "balance_before" + "amount");`);
    this.addSql(`create unique index "credit_movement_user_initial_unique" on "credit_movement" ("user_id") where "type" = 'entrega_inicial';`);
    this.addSql(`create index "credit_movement_user_id_created_at_index" on "credit_movement" ("user_id", "created_at");`);

    this.addSql(`create table "pack_opening" ("id" uuid not null, "user_id" uuid not null, "pack_id" uuid not null, "pack_type" text not null, "price" int not null, "card_count" smallint not null, "balance_before" int not null, "balance_after" int not null, "params" jsonb not null, "credit_movement_id" uuid not null, "correlation_id" varchar(255) not null, "created_at" timestamptz not null, primary key ("id"));`);
    this.addSql(`alter table "pack_opening" add constraint "pack_opening_pack_id_unique" unique ("pack_id");`);
    this.addSql(`alter table "pack_opening" add constraint "pack_opening_user_id_foreign" foreign key ("user_id") references "user" ("id");`);
    this.addSql(`alter table "pack_opening" add constraint "pack_opening_pack_id_foreign" foreign key ("pack_id") references "pack" ("id");`);
    this.addSql(`alter table "pack_opening" add constraint "pack_opening_credit_movement_id_foreign" foreign key ("credit_movement_id") references "credit_movement" ("id");`);
    this.addSql(`alter table "pack_opening" add constraint "pack_opening_pack_type_check" check ("pack_type" in ('common', 'rare', 'epic', 'legendary'));`);
    this.addSql(`alter table "pack_opening" add constraint "pack_opening_balance_check" check ("price" > 0 and "balance_after" >= 0 and "balance_after" = "balance_before" - "price");`);
    this.addSql(`create index "pack_opening_user_id_created_at_index" on "pack_opening" ("user_id", "created_at" desc);`);

    this.addSql(`create table "pack_opening_card" ("id" uuid not null, "opening_id" uuid not null, "token_id" uuid not null, "player_id" uuid not null, "serial" smallint not null, "rarity" varchar(255) not null, "quote_price" int not null, primary key ("id"));`);
    this.addSql(`alter table "pack_opening_card" add constraint "pack_opening_card_opening_id_token_id_unique" unique ("opening_id", "token_id");`);
    this.addSql(`alter table "pack_opening_card" add constraint "pack_opening_card_opening_id_foreign" foreign key ("opening_id") references "pack_opening" ("id");`);
    this.addSql(`alter table "pack_opening_card" add constraint "pack_opening_card_token_id_foreign" foreign key ("token_id") references "token" ("id");`);
    this.addSql(`alter table "pack_opening_card" add constraint "pack_opening_card_player_id_foreign" foreign key ("player_id") references "player" ("id");`);

    // Inmutabilidad (FR-040, research #4): una sola función y un trigger por tabla.
    this.addSql(`create function "forbid_mutation"() returns trigger language plpgsql as $$
begin
  raise exception '% es inmutable: no admite %', TG_TABLE_NAME, TG_OP;
end;
$$;`);
    for (const table of ['credit_movement', 'token_event', 'pack_opening', 'pack_opening_card']) {
      this.addSql(`create trigger "${table}_immutable" before update or delete on "${table}" for each row execute function "forbid_mutation"();`);
    }

    // El OVR es la reputación (FR-067): los filtros de la home comparan contra esta columna.
    this.addSql(`create index "player_world_reputation_index" on "player" ("world_reputation");`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop index if exists "player_world_reputation_index";`);

    this.addSql(`drop table if exists "pack_opening_card" cascade;`);
    this.addSql(`drop table if exists "pack_opening" cascade;`);
    this.addSql(`drop table if exists "credit_movement" cascade;`);
    this.addSql(`drop table if exists "token_event" cascade;`);
    this.addSql(`drop table if exists "token" cascade;`);
    this.addSql(`drop table if exists "pack" cascade;`);
    this.addSql(`drop table if exists "pack_batch" cascade;`);
    this.addSql(`drop function if exists "forbid_mutation"();`);

    this.addSql(`alter table "user" drop constraint if exists "user_credits_check";`);
    this.addSql(`alter table "user" drop column "credits";`);
  }

}
