import { CACHE_MANAGER, type Cache } from '@nestjs/cache-manager';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PinoLoggerService } from '../../shared/logging/pino-logger.service';
import { GetPlayersFilterDto } from './dto/get-players-filter.dto';
import { PlayerCardDto, PlayerDetailDto, PlayersPageDto } from './dto/player-response.dto';
import { PlayerRepository } from './player.repository';

/** Clave del contador que versiona el espacio de claves del listado (research #8). */
export const PLAYERS_LIST_VERSION_KEY = 'players:list:version';

/** Clave de la temporada vigente, cacheada para no repetir el MAX(season) en cada petición. */
const CURRENT_SEASON_KEY = 'players:current-season';

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
    const version = await this.getListVersion();
    const cacheKey = this.buildCacheKey(filter, page, limit, version);

    const cached = await this.cache.get<PlayersPageDto>(cacheKey);
    if (cached) {
      this.logger.event('PlayerService', 'players queried', {
        ...this.logFilters(filter),
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
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };

    await this.cache.set(cacheKey, result);

    this.logger.event('PlayerService', 'players queried', {
      ...this.logFilters(filter),
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

  /**
   * Invalida el espacio entero de claves del listado incrementando su versión (research #8).
   * Es O(1): las entradas viejas quedan inalcanzables al instante y expiran solas por TTL,
   * sin recorrer el keyspace de Redis. La llaman los procesos que cambian el catálogo.
   */
  async invalidateListCache(): Promise<void> {
    const current = (await this.cache.get<number>(PLAYERS_LIST_VERSION_KEY)) ?? 0;
    // TTL 0 = sin expiración: el contador debe sobrevivir al TTL de las entradas que versiona.
    await this.cache.set(PLAYERS_LIST_VERSION_KEY, current + 1, 0);
    await this.cache.del(CURRENT_SEASON_KEY);

    this.logger.event('PlayerService', 'players list cache invalidated', {
      version: current + 1,
    });
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

  private buildCacheKey(
    filter: GetPlayersFilterDto,
    page: number,
    limit: number,
    version: number,
  ): string {
    // Los arreglos se ordenan para que ?position=FW&position=MF y ?position=MF&position=FW
    // compartan entrada: son la misma consulta.
    const sorted = (values?: string[]) => (values ? [...values].sort((a, b) => a.localeCompare(b)) : null);

    return `players:list:v${version}:${JSON.stringify({
      league: sorted(filter.league),
      team: sorted(filter.team),
      position: sorted(filter.position),
      rarity: sorted(filter.rarity),
      minValue: filter.minValue ?? null,
      maxValue: filter.maxValue ?? null,
      minOvr: filter.minOvr ?? null,
      maxOvr: filter.maxOvr ?? null,
      search: filter.search?.trim().toLowerCase() ?? null,
      page,
      limit,
    })}`;
  }

  private logFilters(filter: GetPlayersFilterDto): Record<string, unknown> {
    return {
      league: filter.league ?? null,
      team: filter.team ?? null,
      position: filter.position ?? null,
      rarity: filter.rarity ?? null,
      minValue: filter.minValue ?? null,
      maxValue: filter.maxValue ?? null,
      minOvr: filter.minOvr ?? null,
      maxOvr: filter.maxOvr ?? null,
      hasSearch: Boolean(filter.search),
    };
  }
}
