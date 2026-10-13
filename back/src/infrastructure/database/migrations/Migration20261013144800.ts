import { Migration } from '@mikro-orm/migrations';

/**
 * El score deja de tener tope superior (07-cotizacion): un jugador por encima del percentil 95
 * supera 1 y su precio ya no se amontona en un máximo. `numeric(5,4)` solo admitía hasta
 * 9,9999; se ensancha a `numeric(9,4)`. Los datos existentes no cambian.
 *
 * Los índices funcionales de Migration20260920203500 no están declarados en las entidades, así
 * que el generador propone borrarlos: esas líneas no se incluyen a propósito.
 */
export class Migration20261013144800 extends Migration {

  override name = 'Migration20261013144800';

  override up(): void | Promise<void> {
    this.addSql(`alter table "player_quote" alter column "score" type numeric(9,4) using ("score"::numeric(9,4));`);
  }

  override down(): void | Promise<void> {
    // Falla si algún score ya supera 9,9999: en ese caso hay que revisarlos antes de volver atrás.
    this.addSql(`alter table "player_quote" alter column "score" type numeric(5,4) using ("score"::numeric(5,4));`);
  }

}
