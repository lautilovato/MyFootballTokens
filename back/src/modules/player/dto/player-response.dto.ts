import { ApiProperty } from '@nestjs/swagger';
import { Player, PlayerPosition } from '../../../infrastructure/database/entities/player.entity';
import { PlayerSeasonStats } from '../../../infrastructure/database/entities/player-season-stats.entity';
import { nationalityCode } from '../nationality-code';
import { ovrFromRating } from '../ovr';
import { rarityFromOvr } from '../rarity';
import type { Rarity } from '../rarity';
import { mockMarketMovement } from '../market-value.mock';

/**
 * Oferta de tokens. Constantes, no persistidas: la constitución §5 fija "100 tokens iniciales
 * por jugador, con un valor de 1 crédito en el momento cero, concentrados inicialmente en un
 * único superusuario" — al estar todos en el superusuario, lo emitido es lo total.
 *
 * No existe entidad Token: en esta feature el supply es dato de presentación y la compra está
 * fuera de alcance (FR-032, research #6).
 */
export const TOKEN_SUPPLY_TOTAL = 100;
export const TOKEN_SUPPLY_MINTED = 100;

class ClubDto {
  @ApiProperty({ example: 'Manchester City' })
  name!: string;

  @ApiProperty({ type: String, nullable: true, description: 'Nulo mientras no se carguen los escudos' })
  crestUrl!: string | null;
}

class NationalityDto {
  @ApiProperty({ type: String, nullable: true, example: 'England' })
  name!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    example: 'gb-eng',
    description:
      'ISO 3166-1 alpha-2 en minúscula, o subdivisión de flagcdn para las selecciones británicas. Nulo si el país no está mapeado.',
  })
  code!: string | null;
}

class SupplyDto {
  @ApiProperty({ example: TOKEN_SUPPLY_MINTED })
  minted!: number;

  @ApiProperty({ example: TOKEN_SUPPLY_TOTAL })
  total!: number;
}

/** Fila que devuelve el repositorio: el jugador más sus estadísticas de la temporada vigente. */
export interface PlayerWithStats {
  player: Player;
  stats: PlayerSeasonStats | null;
}

function toNumberOrNull(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

export class PlayerCardDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Erling Haaland' })
  name!: string;

  @ApiProperty({ enum: PlayerPosition })
  position!: PlayerPosition;

  @ApiProperty({
    type: Number,
    nullable: true,
    minimum: 0,
    maximum: 99,
    example: 86,
    description:
      'Parte entera y primer decimal del rating de temporada, como entero de dos cifras (FR-027). Nulo si el jugador no tiene estadísticas.',
  })
  ovr!: number | null;

  @ApiProperty({ enum: ['legendary', 'epic', 'rare', 'common'] })
  rarity!: Rarity;

  @ApiProperty({ type: ClubDto })
  club!: ClubDto;

  @ApiProperty({ type: NationalityDto })
  nationality!: NationalityDto;

  @ApiProperty({ type: Number, nullable: true, description: 'Nulo —no cero— si no hay estadísticas (FR-015)' })
  goals!: number | null;

  @ApiProperty({ type: Number, nullable: true })
  assists!: number | null;

  @ApiProperty({ type: Number, example: 8450, description: 'Valor base del jugador. Dato real.' })
  marketValue!: number;

  @ApiProperty({ type: Number, example: 12.5, description: 'SIMULADO — determinista por jugador (research #5)' })
  changePct!: number;

  @ApiProperty({ type: SupplyDto, description: 'SIMULADO — constantes de la constitución §5' })
  supply!: SupplyDto;

  @ApiProperty({
    type: [Number],
    description: 'SIMULADO — 30 puntos del más viejo al más nuevo, terminando en marketValue',
  })
  priceHistory!: number[];

  static fromEntity({ player, stats }: PlayerWithStats): PlayerCardDto {
    const dto = new PlayerCardDto();
    const marketValue = Number(player.baseValue);
    const movement = mockMarketMovement(player.id, marketValue);

    dto.id = player.id;
    dto.name = player.fullName;
    dto.position = player.position;
    dto.ovr = ovrFromRating(stats?.rating ?? null);
    dto.rarity = rarityFromOvr(dto.ovr);
    dto.club = { name: player.team.name, crestUrl: player.team.crestUrl ?? null };
    dto.nationality = {
      name: player.nationality ?? null,
      code: nationalityCode(player.nationality),
    };
    dto.goals = stats ? stats.goals : null;
    dto.assists = stats ? stats.assists : null;
    dto.marketValue = marketValue;
    dto.changePct = movement.changePct;
    dto.supply = { minted: TOKEN_SUPPLY_MINTED, total: TOKEN_SUPPLY_TOTAL };
    dto.priceHistory = movement.history;

    return dto;
  }
}

export class PlayerDetailDto extends PlayerCardDto {
  @ApiProperty({ example: 'Premier League' })
  league!: string;

  @ApiProperty({ type: String, nullable: true, example: '2025-2026' })
  season!: string | null;

  @ApiProperty({ type: Number, nullable: true, example: 195, description: 'Centímetros' })
  height!: number | null;

  @ApiProperty({ type: Number, nullable: true })
  shotsPerGame!: number | null;

  @ApiProperty({ type: Number, nullable: true })
  keyPasses!: number | null;

  @ApiProperty({ type: Number, nullable: true })
  dribbles!: number | null;

  @ApiProperty({ type: Number, nullable: true })
  tackles!: number | null;

  @ApiProperty({ type: Number, nullable: true, example: 8.63, description: 'Origen del OVR' })
  rating!: number | null;

  static override fromEntity(row: PlayerWithStats): PlayerDetailDto {
    const { player, stats } = row;
    // Reusa el mapeo de la carta para que OVR, rareza y mercado simulado sean exactamente los
    // mismos que muestra la grilla (FR-031, SC-011).
    const dto = Object.assign(new PlayerDetailDto(), PlayerCardDto.fromEntity(row));

    dto.league = player.team.league.name;
    dto.season = stats?.season ?? null;
    dto.height = player.height ?? null;
    dto.shotsPerGame = toNumberOrNull(stats?.shotsPerGame);
    dto.keyPasses = toNumberOrNull(stats?.keyPasses);
    dto.dribbles = toNumberOrNull(stats?.dribbles);
    dto.tackles = toNumberOrNull(stats?.tackles);
    dto.rating = toNumberOrNull(stats?.rating);

    return dto;
  }
}

export class PlayersPageMetaDto {
  @ApiProperty({ description: 'Jugadores que satisfacen los filtros activos, no los de la página' })
  total!: number;

  @ApiProperty()
  page!: number;

  @ApiProperty()
  limit!: number;

  @ApiProperty()
  totalPages!: number;
}

export class PlayersPageDto {
  @ApiProperty({ type: [PlayerCardDto] })
  data!: PlayerCardDto[];

  @ApiProperty({ type: PlayersPageMetaDto })
  meta!: PlayersPageMetaDto;
}
