import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'ana@example.com' })
  @IsEmail({}, { message: 'El email no tiene un formato válido' })
  email!: string;

  /**
   * Sin MinLength a propósito (data-model.md #3): una contraseña corta debe
   * fallar como credencial inválida, no como error de validación — si no, la
   * diferencia le informa al atacante qué contraseñas ni vale la pena probar.
   */
  @ApiProperty({ example: 'unaClaveSegura1' })
  @IsString()
  password!: string;
}
