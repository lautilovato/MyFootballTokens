import { Migration } from '@mikro-orm/migrations';

export class Migration20260916153815 extends Migration {

  override name = 'Migration20260916153815';

  override up(): void | Promise<void> {
    this.addSql(`create table "player_season_stats" ("id" uuid not null, "player_id" uuid not null, "season" varchar(255) not null, "goals" int not null, "assists" int not null, "shots_per_game" numeric(4,2) not null, "key_passes" numeric(4,2) not null, "dribbles" numeric(4,2) not null, "tackles" numeric(4,2) not null, "rating" numeric(4,2) not null, "last_refreshed_at" timestamptz not null, "created_at" timestamptz not null, "updated_at" timestamptz null, primary key ("id"));`);
    this.addSql(`alter table "player_season_stats" add constraint "player_season_stats_player_id_season_unique" unique ("player_id", "season");`);

    this.addSql(`create table "player_match_stats" ("id" uuid not null, "player_id" uuid not null, "who_scored_match_id" varchar(255) not null, "match_date" date not null, "season" varchar(255) not null, "goals" int not null, "assists" int not null, "shots" int not null, "key_passes" int not null, "dribbles" int not null, "tackles" int not null, "rating" numeric(4,2) not null, "created_at" timestamptz not null, primary key ("id"));`);
    this.addSql(`alter table "player_match_stats" add constraint "player_match_stats_player_id_who_scored_match_id_unique" unique ("player_id", "who_scored_match_id");`);

    this.addSql(`create table "who_scored_unmatched_player" ("id" uuid not null, "who_scored_external_id" varchar(255) not null, "who_scored_name" varchar(255) not null, "team_id" int not null, "best_candidate_similarity" numeric(4,3) null, "created_at" timestamptz not null, primary key ("id"));`);
    this.addSql(`alter table "who_scored_unmatched_player" add constraint "who_scored_unmatched_player_who_scored_external_i_cf447_unique" unique ("who_scored_external_id", "team_id");`);

    this.addSql(`alter table "team" add "external_who_scored_id" varchar(255) null;`);
    this.addSql(`alter table "team" add constraint "team_external_who_scored_id_unique" unique ("external_who_scored_id");`);

    this.addSql(`alter table "player" add "height" int null;`);
    this.addSql(`alter table "player" add constraint "player_external_who_scored_id_unique" unique ("external_who_scored_id");`);

    this.addSql(`alter table "player_season_stats" add constraint "player_season_stats_player_id_foreign" foreign key ("player_id") references "player" ("id");`);

    this.addSql(`alter table "player_match_stats" add constraint "player_match_stats_player_id_foreign" foreign key ("player_id") references "player" ("id");`);

    this.addSql(`alter table "who_scored_unmatched_player" add constraint "who_scored_unmatched_player_team_id_foreign" foreign key ("team_id") references "team" ("id");`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "player_season_stats" cascade;`);
    this.addSql(`drop table if exists "player_match_stats" cascade;`);
    this.addSql(`drop table if exists "who_scored_unmatched_player" cascade;`);

    this.addSql(`alter table "player" drop constraint "player_external_who_scored_id_unique";`);
    this.addSql(`alter table "player" drop column "height";`);

    this.addSql(`alter table "team" drop constraint "team_external_who_scored_id_unique";`);
    this.addSql(`alter table "team" drop column "external_who_scored_id";`);
  }

}
