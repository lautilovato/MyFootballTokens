import { Injectable } from '@nestjs/common';
import type { FilterQuery } from '@mikro-orm/postgresql';
import { EntityManager } from '@mikro-orm/postgresql';
import { Player } from '../../infrastructure/database/entities/player.entity';
import { GetPlayersFilterDto } from './dto/get-players-filter.dto';

@Injectable()
export class PlayerRepository {
  constructor(private readonly em: EntityManager) {}

  async findAndCount(filter: GetPlayersFilterDto): Promise<[Player[], number]> {
    const teamFilter: Record<string, unknown> = {};
    if (filter.team) {
      teamFilter.name = filter.team;
    }
    if (filter.league) {
      teamFilter.league = { name: filter.league };
    }

    const where: FilterQuery<Player> = {
      ...(filter.position ? { position: filter.position } : {}),
      ...(Object.keys(teamFilter).length > 0 ? { team: teamFilter } : {}),
    };

    const page = filter.page ?? 1;
    const limit = filter.limit ?? 20;

    return this.em.getRepository(Player).findAndCount(where, {
      populate: ['team', 'team.league'],
      limit,
      offset: (page - 1) * limit,
      orderBy: { fullName: 'ASC' },
    });
  }

  async findOneById(id: string): Promise<Player | null> {
    return this.em
      .getRepository(Player)
      .findOne({ id } as FilterQuery<Player>, { populate: ['team', 'team.league'] });
  }
}
