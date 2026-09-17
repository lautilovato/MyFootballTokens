import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { User } from '../../infrastructure/database/entities/user.entity';
import { INVALID_CREDENTIALS_MESSAGE } from '../../shared/auth/auth.constants';
import { AuthRepository, normalizeEmail } from './auth.repository';
import { AuthResponseDto, UserPublicDto } from './dto/auth-response.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

/** Costo fijo, no configurable por entorno: una palanca así solo apunta hacia abajo (research #1). */
const BCRYPT_COST = 10;

/**
 * Hash descartable contra el que se compara cuando la cuenta no existe.
 * Iguala el tiempo de los dos caminos de fallo: sin esto, "email inexistente"
 * responde perceptiblemente más rápido y esa diferencia es el oráculo que
 * SC-006 intenta cerrar (research #8).
 */
const DUMMY_HASH = '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly authRepository: AuthRepository,
    private readonly jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthResponseDto> {
    const email = normalizeEmail(dto.email);

    if (await this.safely(() => this.authRepository.existsByEmail(email))) {
      throw new ConflictException('Ya existe una cuenta con ese email');
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_COST);
    const user = await this.safely(() =>
      this.authRepository.create(email, dto.username, passwordHash),
    );

    // null = la restricción única lo rechazó: registro concurrente con el mismo email.
    if (!user) throw new ConflictException('Ya existe una cuenta con ese email');

    return this.buildResponse(user);
  }

  async login(dto: LoginDto): Promise<AuthResponseDto> {
    const user = await this.safely(() => this.authRepository.findByEmail(dto.email));

    // Se hashea igual cuando no hay usuario, para no filtrar su existencia por tiempo.
    const matches = await bcrypt.compare(dto.password, user?.passwordHash ?? DUMMY_HASH);

    if (!user || !matches) {
      // Sin email ni contraseña en el log (constitución §4).
      this.logger.warn('Intento de inicio de sesión fallido');
      throw new UnauthorizedException(INVALID_CREDENTIALS_MESSAGE);
    }

    return this.buildResponse(user);
  }

  private buildResponse(user: User): AuthResponseDto {
    const payload = { sub: user.id, username: user.username };
    const publicUser: UserPublicDto = {
      id: user.id,
      email: user.email,
      username: user.username,
    };
    return { accessToken: this.jwtService.sign(payload), user: publicUser };
  }

  /**
   * Traduce cualquier falla de persistencia a un 500 estandarizado, sin dejar
   * salir la traza ni el detalle del ORM al cliente (FR-015, quickstart E14).
   */
  private async safely<T>(op: () => Promise<T>): Promise<T> {
    try {
      return await op();
    } catch (error) {
      this.logger.error('Falla de persistencia durante una operación de autenticación', error);
      throw new InternalServerErrorException('Error interno');
    }
  }
}
