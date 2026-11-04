import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

/**
 * Pedido de publicación (FR-003). Solo el token: el precio lo da la cotización del jugador
 * (FR-002) y el vendedor sale de la sesión (FR-009). `forbidNonWhitelisted` rechaza un `price` o
 * un `userId` con 422 VALIDATION_ERROR (US1-3, US1-12).
 */
export class CreateListingDto {
  @ApiProperty({ format: 'uuid', description: 'Un token propio, en estado de_usuario' })
  @IsUUID()
  tokenId!: string;
}
