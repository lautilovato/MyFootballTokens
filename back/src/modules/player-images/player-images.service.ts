import { Injectable } from '@nestjs/common';
import {
  TheSportsDbAdapter,
  TheSportsDbCandidate,
} from '../../adapters/the-sports-db/the-sports-db.adapter';
import { Player } from '../../infrastructure/database/entities/player.entity';
import { PinoLoggerService } from '../../shared/logging/pino-logger.service';
import { PlayerService } from '../player/player.service';
import { PlayerImagesRefreshResultDto } from './dto/player-images-refresh-result.dto';
import { pickBestCandidate, toSearchTerm, type PlayerToMatch } from './player-image-matcher';
import { PlayerImagesRepository } from './player-images.repository';

export const DEFAULT_REFRESH_LIMIT = 50;
export const MAX_REFRESH_LIMIT = 500;

// Tras esta cantidad de fallas seguidas se asume que la API está caída o nos bloqueó, y se
// corta la corrida en vez de seguir martillándola.
const MAX_CONSECUTIVE_FAILURES = 5;

const DAY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class PlayerImagesService {
  constructor(
    private readonly adapter: TheSportsDbAdapter,
    private readonly repository: PlayerImagesRepository,
    private readonly playerService: PlayerService,
    private readonly logger: PinoLoggerService,
  ) {}

  /**
   * Busca en TheSportsDB la ilustración cartoon de los próximos `limit` jugadores pendientes y
   * guarda su URL. El plan gratuito limita las peticiones (cada jugador cuesta una o dos
   * búsquedas más un detalle), así que el catálogo se completa en varias corridas, de a tandas.
   */
  async refresh(requestedLimit?: number): Promise<PlayerImagesRefreshResultDto> {
    const limit = Math.min(Math.max(requestedLimit ?? DEFAULT_REFRESH_LIMIT, 1), MAX_REFRESH_LIMIT);
    const threshold = Number(process.env.THESPORTSDB_MATCH_THRESHOLD ?? 0.85);
    const retryAfterDays = Number(process.env.THESPORTSDB_RETRY_AFTER_DAYS ?? 30);
    const retryBefore = new Date(Date.now() - retryAfterDays * DAY_MS);

    const players = await this.repository.findPending(limit, retryBefore);

    let matched = 0;
    let noMatch = 0;
    let noCartoon = 0;
    let failed = 0;
    let consecutiveFailures = 0;
    let processed = 0;
    const unmatchedNames: string[] = [];

    for (const player of players) {
      try {
        const candidate = await this.findCandidate(player, threshold);

        if (!candidate) {
          await this.repository.saveResult(player, null);
          noMatch++;
          unmatchedNames.push(player.fullName);
        } else {
          const cartoonUrl = await this.adapter.getCartoonUrl(candidate.id);
          await this.repository.saveResult(player, cartoonUrl);
          if (cartoonUrl) matched++;
          else noCartoon++;
        }

        consecutiveFailures = 0;
        processed++;
      } catch (error) {
        failed++;
        consecutiveFailures++;
        this.logger.event('PlayerImagesService', 'no se pudo buscar la imagen del jugador', {
          player: player.fullName,
          message: error instanceof Error ? error.message : String(error),
        });

        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
          this.logger.event('PlayerImagesService', 'fallas consecutivas, aborta el resto de la corrida', {
            processed,
          });
          break;
        }
      }
    }

    // Sin esto la home seguiría sirviendo el listado cacheado, sin las imágenes nuevas.
    if (matched > 0) await this.playerService.invalidateListCache();

    const result: PlayerImagesRefreshResultDto = {
      processed,
      matched,
      noMatch,
      noCartoon,
      failed,
      remaining: await this.repository.countPending(retryBefore),
      unmatchedNames,
    };
    this.logger.event('PlayerImagesService', 'refresh finalizado', {
      ...result,
      unmatchedNames: undefined,
      unmatchedCount: unmatchedNames.length,
    });
    return result;
  }

  /**
   * Busca por el nombre completo y, si no aparece nadie confiable, por el apellido solo: los
   * nombres de Football-Data a veces son más largos que los de TheSportsDB
   * ("Rodrigo Hernández Cascante" vs "Rodri").
   */
  private async findCandidate(player: Player, threshold: number): Promise<TheSportsDbCandidate | null> {
    const toMatch: PlayerToMatch = {
      fullName: player.fullName,
      dateOfBirth: toIsoDay(player.dateOfBirth),
      teamName: player.team.name,
    };

    const searchName = toSearchTerm(player.fullName);
    const byFullName = pickBestCandidate(
      toMatch,
      await this.adapter.searchPlayers(searchName),
      threshold,
    );
    if (byFullName) return byFullName;

    const surname = searchName.split(' ').at(-1);
    if (!surname || surname === searchName) return null;

    return pickBestCandidate(toMatch, await this.adapter.searchPlayers(surname), threshold);
  }
}

/** `date_of_birth` es una columna `date`: según el driver llega como string o como Date. */
function toIsoDay(value: string | Date | undefined | null): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
}
