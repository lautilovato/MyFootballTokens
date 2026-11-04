import { Migration } from '@mikro-orm/migrations';

/**
 * Imagen del jugador (ilustración cartoon de TheSportsDB) y la marca de cuándo se buscó.
 *
 * Ambas nullable: los jugadores existentes no tienen imagen hasta que corra el refresh de
 * imágenes, y "no buscada" (`image_checked_at` nulo) no es lo mismo que "buscada sin resultado".
 *
 * Los índices funcionales de Migration20260920203500 no están declarados en las entidades, así
 * que el generador propone borrarlos: esas líneas se quitaron a mano a propósito.
 */
export class Migration20261003180000 extends Migration {

  override name = 'Migration20261003180000';

  override up(): void | Promise<void> {
    this.addSql(`alter table "player" add "image_url" varchar(255) null, add "image_checked_at" timestamptz null;`);
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table "player" drop column "image_url", drop column "image_checked_at";`);
  }

}
