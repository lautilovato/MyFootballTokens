import { Migration } from '@mikro-orm/migrations';

/**
 * Rol de las cuentas (11-admin-panel, data-model.md): las cuentas existentes y las del registro
 * quedan como `user` por el default. El de administrador solo lo otorga el seed.
 *
 * El generador también propone borrar los índices, CHECK y triggers de migraciones anteriores que
 * no están declarados en las entidades: esas líneas no se incluyen a propósito, igual que en
 * `Migration20261026120000`. `.snapshot.json` se ajustó a mano solo con esta columna.
 */
export class Migration20261031120000 extends Migration {

  override name = 'Migration20261031120000';

  override up(): void | Promise<void> {
    this.addSql(`alter table "user" add column "role" text not null default 'user';`);
    this.addSql(`alter table "user" add constraint "user_role_check" check ("role" in ('user', 'admin'));`);
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table "user" drop constraint "user_role_check";`);
    this.addSql(`alter table "user" drop column "role";`);
  }

}
