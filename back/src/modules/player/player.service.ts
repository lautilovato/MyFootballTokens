import { CACHE_MANAGER, type Cache } from '@nestjs/cache-manager';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PinoLoggerService } from '../../shared/logging/pino-logger.service';
import { GetPlayersFilterDto } from './dto/get-players-filter.dto';
import { PlayerResponseDto, PlayersPageDto } from './dto/player-response.dto';
import { PlayerRepository } from './player.repository';

@Injectable()
export class PlayerService {
  constructor(
    private readonly playerRepository: PlayerRepository,
    private readonly logger: PinoLoggerService,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
  ) {}

  async findAll(filter: GetPlayersFilterDto): Promise<PlayersPageDto> {
    const page = filter.page ?? 1;
    const limit = filter.limit ?? 20;
    const cacheKey = this.buildCacheKey(filter, page, limit);

    const cached = await this.cache.get<PlayersPageDto>(cacheKey);
    if (cached) {
      this.logger.event('PlayerService', 'players queried', {
        league: filter.league ?? null,
        team: filter.team ?? null,
        position: filter.position ?? null,
        page,
        limit,
        cacheHit: true,
      });
      return cached;
    }

    const [players, total] = await this.playerRepository.findAndCount(filter);
    const result: PlayersPageDto = {
      data: players.map((player) => PlayerResponseDto.fromEntity(player)),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };

    await this.cache.set(cacheKey, result);

    this.logger.event('PlayerService', 'players queried', {
      league: filter.league ?? null,
      team: filter.team ?? null,
      position: filter.position ?? null,
      page,
      limit,
      cacheHit: false,
      resultCount: players.length,
      total,
    });

    return result;
  }

  async findOne(id: string): Promise<PlayerResponseDto> {
    const player = await this.playerRepository.findOneById(id);

    this.logger.event('PlayerService', 'player detail queried', {
      id,
      found: player !== null,
    });

    if (!player) {
      throw new NotFoundException(`Player ${id} not found`);
    }

    return PlayerResponseDto.fromEntity(player);
  }

  private buildCacheKey(filter: GetPlayersFilterDto, page: number, limit: number): string {
    return `players:list:${JSON.stringify({
      league: filter.league ?? null,
      team: filter.team ?? null,
      position: filter.position ?? null,
      page,
      limit,
    })}`;
  }
}
