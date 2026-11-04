import { Migration } from '@mikro-orm/migrations';

/**
 * 07-cotizacion: estrategias de valuación versionadas, corridas de recálculo, cotizaciones
 * inmutables y la reputación mundial del jugador (data-model.md).
 *
 * Además de lo que genera MikroORM, se agregan a mano las restricciones que las entidades no
 * pueden declarar:
 * - `valuation_strategy_one_active`: índice único parcial → nunca dos estrategias activas (FR-013).
 * - `quote_run_one_running`: índice único parcial → nunca dos corridas en curso (FR-031,
 *   research #2).
 * - CHECK de rango de `player.world_reputation` (0–100, FR-023).
 * - Índices de lectura de `player_quote` (cotización actual, historial y espejo de base_value).
 * - Seed de `performance` (activa) y `prestige` en versión 1, con los pesos de data-model.md
 *   «Valores sembrados». FW no tiene perfil propio: usa los generales (research #7).
 *
 * Los índices funcionales de Migration20260920203500 no están declarados en las entidades, así
 * que el generador propone borrarlos: esas líneas se quitaron a mano a propósito.
 */
const PERFORMANCE_WEIGHTS = {
  general: {
    goals: 0.25, assists: 0.15, shots: 0.1, keyPasses: 0.1, dribbles: 0.1, tackles: 0.1,
    rating: 0.2, absence: -0.1,
  },
  byPosition: {
    MF: {
      goals: 0.1, assists: 0.2, shots: 0.05, keyPasses: 0.2, dribbles: 0.15, tackles: 0.1,
      rating: 0.2, absence: -0.1,
    },
    DF: {
      goals: 0.05, assists: 0.05, keyPasses: 0.1, dribbles: 0.05, tackles: 0.4, rating: 0.35,
      absence: -0.1,
    },
    GK: { keyPasses: 0.05, tackles: 0.05, rating: 0.9, absence: -0.1 },
  },
};

const PRESTIGE_WEIGHTS = {
  general: {
    worldReputation: 0.6, rating: 0.15, goals: 0.08, assists: 0.05, keyPasses: 0.04,
    dribbles: 0.04, tackles: 0.04, absence: -0.05,
  },
  byPosition: {
    MF: {
      worldReputation: 0.6, rating: 0.15, goals: 0.04, assists: 0.07, keyPasses: 0.08,
      dribbles: 0.04, tackles: 0.02, absence: -0.05,
    },
    DF: {
      worldReputation: 0.6, rating: 0.2, goals: 0.02, assists: 0.02, keyPasses: 0.03,
      tackles: 0.13, absence: -0.05,
    },
    GK: { worldReputation: 0.6, rating: 0.4, absence: -0.05 },
  },
};

const PERFORMANCE_ID = '7a1d2b9e-3f40-4c55-9a61-0c0f6e4d1a01';
const PRESTIGE_ID = '7a1d2b9e-3f40-4c55-9a61-0c0f6e4d1a02';

export class Migration20261003235404 extends Migration {

  override name = 'Migration20261003235404';

  override up(): void | Promise<void> {
    this.addSql(`create table "valuation_strategy" ("id" uuid not null, "key" varchar(255) not null, "name" varchar(255) not null, "description" text not null, "active" boolean not null, "current_version" int not null, "created_at" timestamptz not null, primary key ("id"));`);
    this.addSql(`alter table "valuation_strategy" add constraint "valuation_strategy_key_unique" unique ("key");`);
    this.addSql(`create unique index "valuation_strategy_one_active" on "valuation_strategy" ((true)) where "active";`);

    this.addSql(`create table "valuation_strategy_version" ("id" uuid not null, "strategy_id" uuid not null, "version" int not null, "weights" jsonb not null, "base_value" int not null, "scale_factor" int not null, "min_price" int not null, "default_reputation" smallint not null, "created_at" timestamptz not null, primary key ("id"));`);
    this.addSql(`alter table "valuation_strategy_version" add constraint "valuation_strategy_version_strategy_id_version_unique" unique ("strategy_id", "version");`);

    this.addSql(`create table "quote_run" ("id" uuid not null, "trigger" text not null, "strategy_version_id" uuid null, "status" text not null, "season" varchar(255) null, "started_at" timestamptz not null, "finished_at" timestamptz null, "quoted_count" int not null default 0, "skipped_count" int not null default 0, "failure_reason" text null, "normalization_bounds" jsonb null, "correlation_id" varchar(255) not null, primary key ("id"));`);
    this.addSql(`create unique index "quote_run_one_running" on "quote_run" ((true)) where "status" = 'RUNNING';`);
    this.addSql(`create index "quote_run_started_at_index" on "quote_run" ("started_at" desc);`);

    this.addSql(`create table "player_quote" ("id" uuid not null, "player_id" uuid not null, "run_id" uuid not null, "strategy_version_id" uuid not null, "origin" text not null, "season" varchar(255) not null, "score" numeric(5,4) not null, "raw_score" numeric(8,4) not null, "price" int not null, "position_profile" text not null, "positive_weight_sum" numeric(6,4) not null, "breakdown" jsonb not null, "used_default_reputation" boolean not null, "missing_matches_played" boolean not null, "calculated_at" timestamptz not null, primary key ("id"));`);
    this.addSql(`create index "player_quote_player_id_calculated_at_index" on "player_quote" ("player_id", "calculated_at" desc);`);
    this.addSql(`create index "player_quote_run_id_index" on "player_quote" ("run_id");`);

    this.addSql(`alter table "player" add "world_reputation" smallint null;`);
    this.addSql(`alter table "player" add constraint "player_world_reputation_check" check ("world_reputation" between 0 and 100);`);

    this.addSql(`alter table "valuation_strategy_version" add constraint "valuation_strategy_version_strategy_id_foreign" foreign key ("strategy_id") references "valuation_strategy" ("id");`);

    this.addSql(`alter table "quote_run" add constraint "quote_run_strategy_version_id_foreign" foreign key ("strategy_version_id") references "valuation_strategy_version" ("id") on delete set null;`);
    this.addSql(`alter table "quote_run" add constraint "quote_run_trigger_check" check ("trigger" in ('AUTOMATIC', 'MANUAL'));`);
    this.addSql(`alter table "quote_run" add constraint "quote_run_status_check" check ("status" in ('RUNNING', 'COMPLETED', 'FAILED', 'SKIPPED'));`);

    this.addSql(`alter table "player_quote" add constraint "player_quote_player_id_foreign" foreign key ("player_id") references "player" ("id");`);
    this.addSql(`alter table "player_quote" add constraint "player_quote_run_id_foreign" foreign key ("run_id") references "quote_run" ("id");`);
    this.addSql(`alter table "player_quote" add constraint "player_quote_strategy_version_id_foreign" foreign key ("strategy_version_id") references "valuation_strategy_version" ("id");`);
    this.addSql(`alter table "player_quote" add constraint "player_quote_origin_check" check ("origin" in ('AUTOMATIC', 'MANUAL'));`);
    this.addSql(`alter table "player_quote" add constraint "player_quote_position_profile_check" check ("position_profile" in ('GENERAL', 'GK', 'DF', 'MF', 'FW'));`);

    // --- Seed (data-model.md «Valores sembrados») ---
    this.addSql(`insert into "valuation_strategy" ("id", "key", "name", "description", "active", "current_version", "created_at") values
      ('${PERFORMANCE_ID}', 'performance', 'Performance', 'Prioriza el rendimiento de la temporada: goles, asistencias, rating y aporte por posición. Penaliza la ausencia.', true, 1, now()),
      ('${PRESTIGE_ID}', 'prestige', 'Prestigio', 'Prioriza la calidad general y el renombre del jugador (reputación mundial) por sobre los números recientes.', false, 1, now());`);
    this.addSql(`insert into "valuation_strategy_version" ("id", "strategy_id", "version", "weights", "base_value", "scale_factor", "min_price", "default_reputation", "created_at") values
      (gen_random_uuid(), '${PERFORMANCE_ID}', 1, '${JSON.stringify(PERFORMANCE_WEIGHTS)}'::jsonb, 100, 900, 10, 20, now()),
      (gen_random_uuid(), '${PRESTIGE_ID}', 1, '${JSON.stringify(PRESTIGE_WEIGHTS)}'::jsonb, 100, 900, 10, 20, now());`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "player_quote" cascade;`);
    this.addSql(`drop table if exists "quote_run" cascade;`);
    this.addSql(`drop table if exists "valuation_strategy_version" cascade;`);
    this.addSql(`drop table if exists "valuation_strategy" cascade;`);

    this.addSql(`alter table "player" drop constraint "player_world_reputation_check";`);
    this.addSql(`alter table "player" drop column "world_reputation";`);
  }

}
