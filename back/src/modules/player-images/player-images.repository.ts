import { Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import { Player } from '../../infrastructure/database/entities/player.entity';

@Injectable()
export class PlayerImagesRepository {
  constructor(private readonly em: EntityManager) {}

  /**
   * Jugadores que faltan por revisar: los del listado de la home (con estadísticas de la
   * temporada vigente, mismo criterio que PlayerRepository) que no tienen imagen y que nunca se
   * buscaron o se buscaron antes de `retryBefore`. Los 2.600 jugadores de los planteles no
   * entrarían: sin estadísticas no se muestran, y cada uno costaría dos peticiones.
   */
  private pendingQuery(retryBefore: Date) {
    return this.em
      .createQueryBuilder(Player, 'p')
      .select('*')
      .leftJoinAndSelect('p.team', 't')
      .where(
        `exists (select 1 from "player_season_stats" "s0" where "s0"."player_id" = "p"."id" and "s0"."season" = (select max("season") from "player_season_stats"))`,
      )
      .andWhere('"p"."image_url" is null')
      .andWhere('("p"."image_checked_at" is null or "p"."image_checked_at" < ?)', [retryBefore]);
  }

  /** Los de mayor valor primero: son los que más se ven en la home. */
  async findPending(limit: number, retryBefore: Date): Promise<Player[]> {
    return this.pendingQuery(retryBefore).orderBy({ baseValue: 'DESC' }).limit(limit).getResult();
  }

  async countPending(retryBefore: Date): Promise<number> {
    return this.pendingQuery(retryBefore).getCount();
  }

  /** Guarda de a un jugador: si la corrida se corta, lo ya revisado no se pierde ni se repite. */
  async saveResult(player: Player, imageUrl: string | null): Promise<void> {
    player.imageCheckedAt = new Date();
    if (imageUrl) player.imageUrl = imageUrl;
    this.em.persist(player);
    await this.em.flush();
  }
}
