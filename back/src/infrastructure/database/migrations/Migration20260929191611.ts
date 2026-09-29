import { Migration } from '@mikro-orm/migrations';

/**
 * Partidos jugados en la temporada, para el panel de detalle del jugador.
 *
 * Nullable: los snapshots existentes no tienen el dato hasta que el próximo refresh de
 * WhoScored lo complete, y "sin dato" no es lo mismo que cero partidos.
 *
 * Los índices funcionales de Migration20260920203500 no están declarados en las entidades, así
 * que el generador propone borrarlos: esas líneas se quitaron a mano a propósito.
 */
export class Migration20260929191611 extends Migration {

  override name = 'Migration20260929191611';

  override up(): void | Promise<void> {
    this.addSql(`alter table "player_season_stats" add "matches_played" int null;`);
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table "player_season_stats" drop column "matches_played";`);
  }

}
