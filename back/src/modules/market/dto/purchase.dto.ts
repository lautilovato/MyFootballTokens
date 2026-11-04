import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsUUID, Min } from 'class-validator';

/**
 * Pedido de compra (FR-010, FR-013): una publicación y el precio que el comprador vio y aceptó.
 * Si el precio vigente es mayor, se rechaza con PRICE_CHANGED; si es igual o menor, se cobra el
 * vigente. El comprador sale de la sesión: `forbidNonWhitelisted` rechaza un `userId` (US2-14).
 */
export class PurchaseDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  listingId!: string;

  @ApiProperty({ minimum: 1, description: 'Precio que vio y confirmó el comprador (FR-013)' })
  @IsInt()
  @Min(1)
  acceptedPrice!: number;
}
