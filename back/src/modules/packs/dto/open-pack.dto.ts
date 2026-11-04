import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/**
 * Pedido de apertura (FR-018). Solo el tipo: el usuario sale siempre de la sesión y
 * `forbidNonWhitelisted` rechaza cualquier otro campo, como un `userId` (FR-025, US2-16).
 *
 * No se valida con `@IsEnum`: un tipo inexistente tiene que llegar al servicio y responder
 * 404 `PACK_TYPE_NOT_FOUND` (US2-8); un valor ausente o no textual es 422.
 */
export class OpenPackDto {
  @ApiProperty({
    example: 'rare',
    description: 'common, rare, epic o legendary. Un valor desconocido responde 404 PACK_TYPE_NOT_FOUND.',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  type!: string;
}
