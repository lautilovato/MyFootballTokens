import { ApiProperty } from '@nestjs/swagger';
import { UserRole } from '../../../infrastructure/database/entities/user.entity';

/** Vista pública del usuario: se arma campo por campo, nunca serializando la entidad (FR-004). */
export class UserPublicDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'email' })
  email!: string;

  @ApiProperty()
  username!: string;

  @ApiProperty({
    enum: UserRole,
    description: 'Para que el cliente decida qué mostrar. No autoriza nada: lo verifica el servidor (11-admin-panel FR-003).',
  })
  role!: UserRole;
}

export class AuthResponseDto {
  @ApiProperty({ description: 'JWT firmado. Payload limitado a sub y username (FR-007).' })
  accessToken!: string;

  @ApiProperty({ type: UserPublicDto })
  user!: UserPublicDto;
}
