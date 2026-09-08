import { Migration } from '@mikro-orm/migrations';

export class Migration20260907142636 extends Migration {

  override name = 'Migration20260907142636';

  override up(): void | Promise<void> {
    this.addSql(`alter table "league" add "external_id" int null, add "code" varchar(255) null;`);
    this.addSql(`alter table "league" add constraint "league_external_id_unique" unique ("external_id");`);
    this.addSql(`alter table "league" add constraint "league_code_unique" unique ("code");`);

    this.addSql(`alter table "team" add "external_id" int null, add "short_name" varchar(255) null, add "tla" varchar(255) null, add "crest_url" varchar(255) null;`);
    this.addSql(`alter table "team" add constraint "team_external_id_unique" unique ("external_id");`);

    this.addSql(`alter table "player" drop constraint "player_position_check";`);
    this.addSql(`alter table "player" add "date_of_birth" date null, add "nationality" varchar(255) null, add "shirt_number" int null;`);
    this.addSql(`alter table "player" add constraint "player_external_football_data_id_unique" unique ("external_football_data_id");`);
    this.addSql(`alter table "player" add constraint "player_position_check" check ("position" in ('GK', 'DF', 'MF', 'FW', 'UNKNOWN'));`);
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table "league" drop constraint "league_external_id_unique";`);
    this.addSql(`alter table "league" drop constraint "league_code_unique";`);
    this.addSql(`alter table "league" drop column "external_id", drop column "code";`);

    this.addSql(`alter table "player" drop constraint "player_external_football_data_id_unique";`);
    this.addSql(`alter table "player" drop constraint "player_position_check";`);
    this.addSql(`alter table "player" drop column "date_of_birth", drop column "nationality", drop column "shirt_number";`);
    this.addSql(`alter table "player" add constraint "player_position_check" check ("position" in ('GK', 'DF', 'MF', 'FW'));`);

    this.addSql(`alter table "team" drop constraint "team_external_id_unique";`);
    this.addSql(`alter table "team" drop column "external_id", drop column "short_name", drop column "tla", drop column "crest_url";`);
  }

}
