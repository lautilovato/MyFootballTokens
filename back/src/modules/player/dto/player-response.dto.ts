import { ApiProperty } from '@nestjs/swagger';
import { Player, PlayerPosition } from '../../../infrastructure/database/entities/player.entity';
import { PlayerSeasonStats } from '../../../infrastructure/database/entities/player-season-stats.entity';
import { nationalityCode } from '../nationality-code';
import { ovrFromReputation } from '../ovr';
import { rarityFromOvr } from '../rarity';
import type { Rarity } from '../rarity';
import { priceMovement } from '../price-movement';

/**
 * Oferta de tokens. Constantes, no persistidas: cada jugador tiene 100 tokens (constitución §5).
 *
 * Sigue siendo dato de presentación: la home muestra la emisión como maqueta hasta que una
 * feature posterior la conecte a los tokens reales de 08-sobres (Assumptions, «Fuera de
 * alcance»).
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

/**
 * Fila que devuelve el repositorio: el jugador, sus estadísticas de la temporada vigente y los
 * precios de sus últimas cotizaciones, del más viejo al más nuevo. Si falta, el jugador no tiene
 * cotizaciones: el repositorio siempre la completa, pero una fila armada a mano sin ella es
 * válida y se trata como serie vacía.
 */
export interface PlayerWithStats {
  player: Player;
  stats: PlayerSeasonStats | null;
  priceSeries?: number[];
  /** Publicaciones activas del jugador (09-mercado FR-026). */
  forSaleCount?: number;
  /** Número de carta de su publicación activa más antigua (15-numero-de-carta FR-003). */
  firstListedSerial?: number | null;
  /** Cartas en poder de usuarios. Solo lo completa el detalle (15-numero-de-carta FR-005). */
  inCirculation?: number;
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
      'Reputación mundial cargada, acotada a 99 (08-sobres FR-067). Nulo si el jugador no tiene reputación cargada (FR-068).',
  })
  ovr!: number | null;

  @ApiProperty({
    enum: ['legendary', 'epic', 'rare', 'common'],
    description: 'Derivada del OVR: 88 o más legendary, 80–87 epic, 70–79 rare, resto common (08-sobres FR-016).',
  })
  rarity!: Rarity;

  @ApiProperty({ type: ClubDto })
  club!: ClubDto;

  @ApiProperty({ type: NationalityDto })
  nationality!: NationalityDto;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Ilustración cartoon (PNG) de TheSportsDB. Nulo si todavía no se encontró.',
  })
  imageUrl!: string | null;

  @ApiProperty({ type: Number, nullable: true, description: 'Nulo —no cero— si no hay estadísticas (FR-015)' })
  goals!: number | null;

  @ApiProperty({ type: Number, nullable: true })
  assists!: number | null;

  @ApiProperty({ type: Number, example: 8450, description: 'Precio de la última cotización del jugador (07-cotizacion). 0 si nunca fue cotizado. Dato real.' })
  marketValue!: number;

  @ApiProperty({
    type: Number,
    example: 12.5,
    description:
      'Variación porcentual de la última cotización respecto de la anterior, con un decimal. 0 si el jugador tiene menos de dos cotizaciones. Dato real.',
  })
  changePct!: number;

  @ApiProperty({ type: SupplyDto, description: 'SIMULADO — constantes de la constitución §5' })
  supply!: SupplyDto;

  @ApiProperty({
    type: [Number],
    description:
      'Precios de las últimas cotizaciones (hasta 30), del más viejo al más nuevo; el último coincide con marketValue. Vacío si el jugador nunca fue cotizado. Dato real.',
  })
  priceHistory!: number[];

  @ApiProperty({
    type: Number,
    minimum: 0,
    description: 'Cartas del jugador a la venta: publicaciones activas de usuarios y de la plataforma (09-mercado FR-026)',
  })
  forSaleCount!: number;

  @ApiProperty({
    type: Number,
    nullable: true,
    description: 'Número de carta de la publicación activa más antigua del jugador. Nulo si no tiene cartas a la venta (15-numero-de-carta FR-003)',
  })
  firstListedSerial!: number | null;

  static fromEntity({ player, stats, priceSeries = [], forSaleCount = 0, firstListedSerial = null }: PlayerWithStats): PlayerCardDto {
    const dto = new PlayerCardDto();
    const marketValue = Number(player.baseValue);
    const movement = priceMovement(priceSeries);

    dto.id = player.id;
    dto.name = player.fullName;
    dto.position = player.position;
    dto.ovr = ovrFromReputation(player.worldReputation);
    dto.rarity = rarityFromOvr(dto.ovr);
    dto.club = { name: player.team.name, crestUrl: player.team.crestUrl ?? null };
    dto.nationality = {
      name: player.nationality ?? null,
      code: nationalityCode(player.nationality),
    };
    dto.imageUrl = player.imageUrl ?? null;
    dto.goals = stats ? stats.goals : null;
    dto.assists = stats ? stats.assists : null;
    dto.marketValue = marketValue;
    dto.changePct = movement.changePct;
    dto.supply = { minted: TOKEN_SUPPLY_MINTED, total: TOKEN_SUPPLY_TOTAL };
    dto.priceHistory = movement.history;
    dto.forSaleCount = forSaleCount;
    dto.firstListedSerial = firstListedSerial;

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

  @ApiProperty({ type: Number, nullable: true, example: 28, description: 'Partidos jugados en la temporada' })
  matchesPlayed!: number | null;

  @ApiProperty({ type: Number, nullable: true })
  shotsPerGame!: number | null;

  @ApiProperty({ type: Number, nullable: true })
  keyPasses!: number | null;

  @ApiProperty({ type: Number, nullable: true })
  dribbles!: number | null;

  @ApiProperty({ type: Number, nullable: true })
  tackles!: number | null;

  @ApiProperty({ type: Number, nullable: true, example: 8.63, description: 'Rating de la temporada vigente' })
  rating!: number | null;

  @ApiProperty({
    type: Number,
    minimum: 0,
    description: 'Cartas del jugador en poder de usuarios, a la venta o no. Dato real (15-numero-de-carta FR-005)',
  })
  inCirculation!: number;

  static override fromEntity(row: PlayerWithStats): PlayerDetailDto {
    const { player, stats } = row;
    // Reusa el mapeo de la carta para que OVR, rareza y precios sean exactamente los
    // mismos que muestra la grilla (FR-031, SC-011).
    const dto = Object.assign(new PlayerDetailDto(), PlayerCardDto.fromEntity(row));

    dto.league = player.team.league.name;
    dto.season = stats?.season ?? null;
    dto.height = player.height ?? null;
    dto.matchesPlayed = stats?.matchesPlayed ?? null;
    dto.shotsPerGame = toNumberOrNull(stats?.shotsPerGame);
    dto.keyPasses = toNumberOrNull(stats?.keyPasses);
    dto.dribbles = toNumberOrNull(stats?.dribbles);
    dto.tackles = toNumberOrNull(stats?.tackles);
    dto.rating = toNumberOrNull(stats?.rating);
    dto.inCirculation = row.inCirculation ?? 0;

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
