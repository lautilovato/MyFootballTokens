import { ApiProperty } from '@nestjs/swagger';

/** Vista pública del usuario: se arma campo por campo, nunca serializando la entidad (FR-004). */
export class UserPublicDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'email' })
  email!: string;

  @ApiProperty()
  username!: string;
}

export class AuthResponseDto {
  @ApiProperty({ description: 'JWT firmado. Payload limitado a sub y username (FR-007).' })
  accessToken!: string;

  @ApiProperty({ type: UserPublicDto })
  user!: UserPublicDto;
}
