import { ApiProperty } from '@nestjs/swagger';

export type HistoryParty = 'plataforma' | 'yo' | 'otro_usuario';

/** Fila de `token_event` tal como la lee el repositorio. */
export interface TokenEventRow {
  type: string;
  created_at: Date | string;
  from_status: string | null;
  from_owner_id: string | null;
  to_owner_id: string | null;
  quote_price: number | null;
  rarity: string | null;
  reference_type: string | null;
  reference_id: string | null;
}

/** Eventos internos que no se muestran al usuario (FR-031). */
const HIDDEN_EVENTS = new Set(['asignacion_a_sobre']);

class OperationDto {
  @ApiProperty({ enum: ['pack_batch', 'pack_opening'] })
  type!: string;

  @ApiProperty({ format: 'uuid' })
  id!: string;
}

export class TokenHistoryEventDto {
  @ApiProperty({ enum: ['emision', 'entrega_en_sobre', 'devolucion_a_plataforma', 'puesta_en_venta'] })
  type!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  at!: string;

  @ApiProperty({ enum: ['plataforma', 'yo', 'otro_usuario'], nullable: true, description: 'Nulo en la emisión' })
  from!: HistoryParty | null;

  @ApiProperty({ enum: ['plataforma', 'yo', 'otro_usuario'] })
  to!: HistoryParty;

  @ApiProperty({ type: Number, nullable: true, description: 'Cotización del jugador en ese instante' })
  quotePrice!: number | null;

  @ApiProperty({ type: String, nullable: true, description: 'Rareza vigente en ese instante' })
  rarity!: string | null;

  @ApiProperty({ type: OperationDto, nullable: true })
  operation!: OperationDto | null;
}

export class TokenHistoryResponseDto {
  @ApiProperty({ format: 'uuid' })
  tokenId!: string;

  @ApiProperty()
  serial!: number;

  @ApiProperty({ format: 'uuid' })
  playerId!: string;

  @ApiProperty({ type: [TokenHistoryEventDto] })
  events!: TokenHistoryEventDto[];

  /**
   * Arma el historial visible para `viewerId`: los dueños que no son él quedan sin identificar
   * y los eventos internos se omiten (FR-031).
   */
  static from(
    token: { id: string; serial: number; player_id: string },
    rows: TokenEventRow[],
    viewerId: string,
  ): TokenHistoryResponseDto {
    const party = (ownerId: string | null): HistoryParty =>
      ownerId === null ? 'plataforma' : ownerId === viewerId ? 'yo' : 'otro_usuario';

    return {
      tokenId: token.id,
      serial: Number(token.serial),
      playerId: token.player_id,
      events: rows
        .filter((row) => !HIDDEN_EVENTS.has(row.type))
        .map((row) => ({
          type: row.type,
          at: new Date(row.created_at).toISOString(),
          from: row.from_status === null ? null : party(row.from_owner_id),
          to: party(row.to_owner_id),
          quotePrice: row.quote_price === null ? null : Number(row.quote_price),
          rarity: row.rarity,
          operation:
            row.reference_type && row.reference_id ? { type: row.reference_type, id: row.reference_id } : null,
        })),
    };
  }
}
