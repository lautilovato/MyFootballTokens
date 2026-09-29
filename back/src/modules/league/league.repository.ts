import { Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import { League } from '../../infrastructure/database/entities/league.entity';

@Injectable()
export class LeagueRepository {
  constructor(private readonly em: EntityManager) {}

  /** Ordenadas por nombre: es el orden en que el panel de filtros las muestra. */
  async findAll(): Promise<League[]> {
    return this.em.getRepository(League).findAll({ orderBy: { name: 'ASC' } });
  }
}
