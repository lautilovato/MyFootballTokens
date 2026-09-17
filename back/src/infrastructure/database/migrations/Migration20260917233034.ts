import { Migration } from '@mikro-orm/migrations';

export class Migration20260917233034 extends Migration {

  override name = 'Migration20260917233034';

  override up(): void | Promise<void> {
    this.addSql(`create table "user" ("id" uuid not null, "email" varchar(255) not null, "username" varchar(255) not null, "password_hash" varchar(255) not null, "created_at" timestamptz not null, "updated_at" timestamptz null, primary key ("id"));`);
    this.addSql(`alter table "user" add constraint "user_email_unique" unique ("email");`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "user" cascade;`);
  }

}
