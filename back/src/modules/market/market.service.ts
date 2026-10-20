import { randomUUID } from 'node:crypto';
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { CorrelationIdStore } from '../../shared/logging/correlation-id.store';
import { PinoLoggerService } from '../../shared/logging/pino-logger.service';
import { PlayerService } from '../player/player.service';
import { TOKEN_NOT_FOUND } from '../tokens/tokens.service';
import { ListingResponseDto } from './dto/listing-response.dto';
import { DEFAULT_OPERATIONS_PAGE_SIZE, OperationsQueryDto } from './dto/operations-query.dto';
import { OperationsResponseDto } from './dto/operations-response.dto';
import { DEFAULT_LISTINGS_PAGE_SIZE, PlayerListingsQueryDto } from './dto/player-listings-query.dto';
import { PlayerListingsResponseDto } from './dto/player-listings-response.dto';
import { PurchaseResponseDto } from './dto/purchase-response.dto';
import {
  InsufficientCreditsError,
  ListingNotActiveError,
  ListingNotFoundError,
  MarketRepository,
  OwnListingError,
  PlayerNotFoundError,
  PriceChangedError,
  PriceNotAvailableError,
  TokenAlreadyListedError,
  TokenNotOwnedError,
} from './market.repository';

const LOG_CONTEXT = 'MarketService';

/** Errores de dominio del mercado (FR-033, tabla «Códigos de error» de la spec). */
export const MARKET_ERRORS = {
  tokenNotFound: { ...TOKEN_NOT_FOUND },
  listingNotFound: { code: 'LISTING_NOT_FOUND', message: 'La publicación no existe' },
  playerNotFound: { code: 'PLAYER_NOT_FOUND', message: 'El jugador no existe' },
  tokenAlreadyListed: { code: 'TOKEN_ALREADY_LISTED', message: 'Esa carta ya está a la venta' },
  listingNotActive: { code: 'LISTING_NOT_ACTIVE', message: 'Esa carta ya no está a la venta' },
  ownListing: { code: 'OWN_LISTING', message: 'No podés comprar una carta tuya' },
  priceNotAvailable: { code: 'PRICE_NOT_AVAILABLE', message: 'El jugador todavía no tiene cotización' },
  priceChanged: { code: 'PRICE_CHANGED', message: 'El precio cambió; revisalo antes de comprar' },
  insufficientCredits: { code: 'INSUFFICIENT_CREDITS', message: 'El saldo no alcanza para comprar esta carta' },
} as const;

/** Cada error del repositorio con su respuesta HTTP (tabla «Códigos de error»). */
function toHttpError(error: unknown): unknown {
  if (error instanceof TokenNotOwnedError) return new NotFoundException({ ...MARKET_ERRORS.tokenNotFound });
  if (error instanceof ListingNotFoundError) return new NotFoundException({ ...MARKET_ERRORS.listingNotFound });
  if (error instanceof PlayerNotFoundError) return new NotFoundException({ ...MARKET_ERRORS.playerNotFound });
  if (error instanceof TokenAlreadyListedError) return new ConflictException({ ...MARKET_ERRORS.tokenAlreadyListed });
  if (error instanceof ListingNotActiveError) return new ConflictException({ ...MARKET_ERRORS.listingNotActive });
  if (error instanceof OwnListingError) return new ConflictException({ ...MARKET_ERRORS.ownListing });
  if (error instanceof PriceNotAvailableError) return new ConflictException({ ...MARKET_ERRORS.priceNotAvailable });
  if (error instanceof PriceChangedError) return new ConflictException({ ...MARKET_ERRORS.priceChanged });
  if (error instanceof InsufficientCreditsError) return new ConflictException({ ...MARKET_ERRORS.insufficientCredits });
  return error;
}

@Injectable()
export class MarketService {
  constructor(
    private readonly marketRepository: MarketRepository,
    private readonly playerService: PlayerService,
    private readonly logger: PinoLoggerService,
  ) {}

  /** Pone a la venta una carta del usuario (FR-003). */
  async publish(userId: string, tokenId: string): Promise<ListingResponseDto> {
    const listing = await this.run(() => this.marketRepository.createListing(userId, tokenId, this.correlationId()));
    await this.afterChange();
    this.logger.event(LOG_CONTEXT, 'listing created', {
      listingId: listing.id,
      tokenId: listing.tokenId,
      playerId: listing.playerId,
      price: listing.price,
    });
    return listing;
  }

  /** Retira una publicación activa del usuario (FR-006). */
  async withdraw(userId: string, listingId: string): Promise<ListingResponseDto> {
    const listing = await this.run(() => this.marketRepository.withdrawListing(userId, listingId, this.correlationId()));
    await this.afterChange();
    this.logger.event(LOG_CONTEXT, 'listing withdrawn', {
      listingId: listing.id,
      tokenId: listing.tokenId,
      playerId: listing.playerId,
    });
    return listing;
  }

  /** Compra una carta a la venta al precio vigente (FR-010 a FR-017). */
  async purchase(buyerId: string, listingId: string, acceptedPrice: number): Promise<PurchaseResponseDto> {
    const bought = await this.run(() =>
      this.marketRepository.purchase({ buyerId, listingId, acceptedPrice, correlationId: this.correlationId() }),
    );
    await this.afterChange();
    this.logger.event(LOG_CONTEXT, 'token purchased', {
      purchaseId: bought.id,
      listingId: bought.listingId,
      tokenId: bought.tokenId,
      playerId: bought.playerId,
      price: bought.price,
      buyerMovementId: bought.buyerMovementId,
      sellerMovementId: bought.sellerMovementId,
    });
    return {
      id: bought.id,
      listingId: bought.listingId,
      tokenId: bought.tokenId,
      serial: bought.serial,
      playerId: bought.playerId,
      rarity: bought.rarity,
      price: bought.price,
      balanceAfter: bought.balanceAfter,
      purchasedAt: bought.purchasedAt,
    };
  }

  /** Cartas a la venta de un jugador, vistas por el usuario de la sesión (FR-027). */
  async listPlayerListings(playerId: string, viewerId: string, query: PlayerListingsQueryDto): Promise<PlayerListingsResponseDto> {
    const page = query.page ?? 1;
    const limit = query.limit ?? DEFAULT_LISTINGS_PAGE_SIZE;
    const { price, total, listings } = await this.run(() =>
      this.marketRepository.findActiveListingsPage(playerId, viewerId, page, limit),
    );
    return { playerId, price, data: listings, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  /** Compras y ventas del usuario de la sesión (FR-029). */
  async listOperations(userId: string, query: OperationsQueryDto): Promise<OperationsResponseDto> {
    const page = query.page ?? 1;
    const limit = query.limit ?? DEFAULT_OPERATIONS_PAGE_SIZE;
    const { total, operations } = await this.marketRepository.findOperationsPage(userId, page, limit);
    return { data: operations, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  private correlationId(): string {
    return CorrelationIdStore.getId() ?? randomUUID();
  }

  /** Corre una operación del repositorio traduciendo sus errores de dominio. */
  private async run<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (error) {
      throw toHttpError(error);
    }
  }

  /** El Market lista según las publicaciones activas: cada cambio invalida su caché (research #8). */
  private async afterChange(): Promise<void> {
    await this.playerService.invalidateListCache();
  }
}
