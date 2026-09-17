import { Migration } from '@mikro-orm/migrations';

export class Migration20260916232339 extends Migration {

  override name = 'Migration20260916232339';

  override up(): void | Promise<void> {
    this.addSql(`create table "who_scored_unmatched_team" ("id" uuid not null, "who_scored_external_id" varchar(255) not null, "who_scored_name" varchar(255) not null, "league_id" int not null, "best_candidate_similarity" numeric(4,3) null, "created_at" timestamptz not null, primary key ("id"));`);
    this.addSql(`alter table "who_scored_unmatched_team" add constraint "who_scored_unmatched_team_who_scored_external_id__8178b_unique" unique ("who_scored_external_id", "league_id");`);

    this.addSql(`alter table "who_scored_unmatched_team" add constraint "who_scored_unmatched_team_league_id_foreign" foreign key ("league_id") references "league" ("id");`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "who_scored_unmatched_team" cascade;`);
  }

}
