import { Migration } from '@mikro-orm/migrations';

/**
 * Soporte de base para la home de mercado (06-home):
 *
 * 1. `unaccent`, para que la búsqueda por nombre ignore los acentos (FR-006). Los nombres
 *    del catálogo vienen acentuados desde Football-Data.org ("Nicolás", "Müller"), así que
 *    sin esto la búsqueda falla en los casos más obvios.
 * 2. Índices que sostienen los filtros nuevos: el funcional sobre el nombre normalizado y
 *    el compuesto `(season, rating)`, que es el que usa el filtrado por OVR y por rareza
 *    (research #1 — ambos se traducen a rangos sobre `rating`).
 *
 * `unaccent` está declarada STABLE por PostgreSQL, no IMMUTABLE, y un índice funcional exige
 * IMMUTABLE. Por eso se envuelve en una función propia marcada IMMUTABLE — el patrón estándar
 * para poder indexarla. El `search_path` vacío y el nombre calificado del diccionario evitan
 * que la inmutabilidad declarada dependa del search_path de quien consulte.
 */
export class Migration20260920203500 extends Migration {

  override name = 'Migration20260920203500';

  override async up(): Promise<void> {
    this.addSql(`create extension if not exists "unaccent";`);

    this.addSql(`
      create or replace function public.immutable_unaccent(text)
      returns text
      language sql
      immutable
      parallel safe
      strict
      set search_path = ''
      as $$ select public.unaccent('public.unaccent'::regdictionary, $1) $$;
    `);

    this.addSql(`
      create index if not exists "player_full_name_unaccent_index"
      on "player" (public.immutable_unaccent("full_name"));
    `);

    this.addSql(`
      create index if not exists "player_season_stats_season_rating_index"
      on "player_season_stats" ("season", "rating");
    `);
  }

  override async down(): Promise<void> {
    this.addSql(`drop index if exists "player_season_stats_season_rating_index";`);
    this.addSql(`drop index if exists "player_full_name_unaccent_index";`);
    this.addSql(`drop function if exists public.immutable_unaccent(text);`);
    // La extensión NO se elimina: pudo haber sido creada por otro motivo en este mismo esquema.
  }

}
