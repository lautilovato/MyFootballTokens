import { CACHE_MANAGER, type Cache } from '@nestjs/cache-manager';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PinoLoggerService } from '../../shared/logging/pino-logger.service';
import { GetPlayersFilterDto } from './dto/get-players-filter.dto';
import { PlayerCardDto, PlayerDetailDto, PlayersPageDto } from './dto/player-response.dto';
import {
  CURRENT_SEASON_KEY,
  PLAYERS_LIST_VERSION_KEY,
  filterLogFields,
  pageMeta,
  playersListCacheKey,
  resolvePagination,
} from './player.model';
import { PlayerRepository } from './player.repository';

@Injectable()
export class PlayerService {
  constructor(
    private readonly playerRepository: PlayerRepository,
    private readonly logger: PinoLoggerService,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
  ) {}

  async findAll(filter: GetPlayersFilterDto): Promise<PlayersPageDto> {
    const { page, limit } = resolvePagination(filter);
    const version = await this.getListVersion();
    const cacheKey = playersListCacheKey(filter, page, limit, version);

    const cached = await this.cache.get<PlayersPageDto>(cacheKey);
    if (cached) {
      this.logger.event('PlayerService', 'players queried', {
        ...filterLogFields(filter),
        page,
        limit,
        cacheHit: true,
      });
      return cached;
    }

    const season = await this.getCurrentSeason();
    const [rows, total] = await this.playerRepository.findAndCount(filter, season);

    const result: PlayersPageDto = {
      data: rows.map((row) => PlayerCardDto.fromEntity(row)),
      meta: pageMeta(total, page, limit),
    };

    await this.cache.set(cacheKey, result);

    this.logger.event('PlayerService', 'players queried', {
      ...filterLogFields(filter),
      page,
      limit,
      season,
      cacheHit: false,
      resultCount: rows.length,
      total,
    });

    return result;
  }

  async findOne(id: string): Promise<PlayerDetailDto> {
    const season = await this.getCurrentSeason();
    const row = await this.playerRepository.findOneById(id, season);

    this.logger.event('PlayerService', 'player detail queried', {
      id,
      found: row !== null,
      hasSeasonStats: row?.stats != null,
    });

    if (!row) {
      throw new NotFoundException(`Player ${id} not found`);
    }

    return PlayerDetailDto.fromEntity(row);
  }

  
  async invalidateListCache(): Promise<void> {
    const current = await this.getListVersion();
    await this.cache.set(PLAYERS_LIST_VERSION_KEY, current + 1, 0);
    await this.cache.del(CURRENT_SEASON_KEY);

    this.logger.event('PlayerService', 'players list cache invalidated', {
      version: current + 1,
    });
  }

  async findCardsByIds(ids: string[]): Promise<Map<string, PlayerCardDto>> {
    const season = await this.getCurrentSeason();
    const rows = await this.playerRepository.findManyByIds(ids, season);
    return new Map(rows.map((row) => [row.player.id, PlayerCardDto.fromEntity(row)]));
  }

  private async getListVersion(): Promise<number> {
    return (await this.cache.get<number>(PLAYERS_LIST_VERSION_KEY)) ?? 0;
  }

  private async getCurrentSeason(): Promise<string | null> {
    const cached = await this.cache.get<string | null>(CURRENT_SEASON_KEY);
    if (cached !== undefined && cached !== null) return cached;

    const season = await this.playerRepository.findCurrentSeason();
    if (season !== null) {
      await this.cache.set(CURRENT_SEASON_KEY, season);
    }
    return season;
  }
}
