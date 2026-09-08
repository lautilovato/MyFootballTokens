import { Migration } from '@mikro-orm/migrations';

export class Migration20260829203938 extends Migration {

  override name = 'Migration20260829203938';

  override up(): void | Promise<void> {
    this.addSql(`alter table "player" drop constraint "player_pkey";`);
    this.addSql(`alter table "player" drop column "id";`);
    this.addSql(`alter table "player" add column "id" uuid not null;`);
    this.addSql(`alter table "player" add constraint "player_pkey" primary key ("id");`);

    this.addSql(`alter table "player" add column "base_value" numeric(10,2) not null;`);
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table "player" drop column "base_value";`);

    this.addSql(`alter table "player" drop constraint "player_pkey";`);
    this.addSql(`alter table "player" drop column "id";`);
    this.addSql(`alter table "player" add column "id" serial primary key;`);
  }

}
