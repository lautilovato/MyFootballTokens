import { Migration } from '@mikro-orm/migrations';

export class Migration20260827190315 extends Migration {

  override name = 'Migration20260827190315';

  override up(): void | Promise<void> {
    this.addSql(`create table "league" ("id" serial primary key, "name" varchar(255) not null, "country" varchar(255) not null);`);
    this.addSql(`alter table "league" add constraint "league_name_unique" unique ("name");`);

    this.addSql(`create table "team" ("id" serial primary key, "name" varchar(255) not null, "league_id" int not null);`);

    this.addSql(`create table "player" ("id" serial primary key, "full_name" varchar(255) not null, "position" text not null, "external_who_scored_id" varchar(255) null, "external_football_data_id" varchar(255) null, "team_id" int not null, "created_at" timestamptz not null, "updated_at" timestamptz null);`);
    this.addSql(`alter table "player" add constraint "player_position_check" check ("position" in ('GK', 'DF', 'MF', 'FW'));`);

    this.addSql(`alter table "team" add constraint "team_league_id_foreign" foreign key ("league_id") references "league" ("id");`);

    this.addSql(`alter table "player" add constraint "player_team_id_foreign" foreign key ("team_id") references "team" ("id");`);
  }

}
