import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { AuthResponseDto } from './dto/auth-response.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

/**
 * El límite de intentos se aplica solo acá, no al resto de la API (FR-013,
 * research #7). Es por IP: limitar por email permitiría bloquear la cuenta
 * de otro a voluntad, convirtiendo la defensa en una denegación de servicio.
 */
@ApiTags('Auth')
@Controller('auth')
@Throttle({ default: { limit: 5, ttl: 60_000 } })
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @ApiOperation({ summary: 'Registra una cuenta nueva y devuelve la sesión iniciada' })
  @ApiResponse({ status: 201, description: 'Cuenta creada', type: AuthResponseDto })
  @ApiResponse({ status: 400, description: 'Entrada inválida' })
  @ApiResponse({ status: 409, description: 'Ya existe una cuenta con ese email' })
  @ApiResponse({ status: 429, description: 'Se superó el límite de peticiones' })
  async register(@Body() dto: RegisterDto): Promise<AuthResponseDto> {
    return this.authService.register(dto);
  }

  @Post('login')
  @HttpCode(200)
  @ApiOperation({ summary: 'Inicia sesión y emite la credencial' })
  @ApiResponse({ status: 200, description: 'Sesión iniciada', type: AuthResponseDto })
  @ApiResponse({ status: 400, description: 'Entrada inválida' })
  @ApiResponse({
    status: 401,
    description: 'Credenciales inválidas — mismo cuerpo para email inexistente y contraseña incorrecta',
  })
  @ApiResponse({ status: 429, description: 'Se superó el límite de peticiones' })
  async login(@Body() dto: LoginDto): Promise<AuthResponseDto> {
    return this.authService.login(dto);
  }
}
