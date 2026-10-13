import { Migration } from '@mikro-orm/migrations';

/**
 * La liga española pasa a mostrarse como "LaLiga" en lugar de "Primera Division", el nombre
 * sin tilde de Football-Data.org. La ingesta ya lo escribe así (LEAGUE_DISPLAY_NAMES en
 * football-data.adapter.ts); esta migración corrige la fila que ya estaba cargada. Solo toca
 * datos, no el esquema.
 */
export class Migration20260929200000 extends Migration {

  override name = 'Migration20260929200000';

  override async up(): Promise<void> {
    this.addSql(`update "league" set "name" = 'LaLiga' where "code" = 'PD';`);
  }

  override async down(): Promise<void> {
    this.addSql(`update "league" set "name" = 'Primera Division' where "code" = 'PD';`);
  }

}
