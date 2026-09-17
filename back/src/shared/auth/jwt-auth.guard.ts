import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { AUTH_ENV } from './auth.constants';

export interface AuthenticatedUser {
  id: string;
  username: string;
}

/**
 * Protege las lecturas de catálogo (FR-009). Ausente, inválido y vencido se
 * rechazan igual: un mensaje distinto por caso le diría al atacante en qué
 * estaba equivocado.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractToken(request);
    if (!token) throw new UnauthorizedException();

    try {
      const payload = await this.jwtService.verifyAsync<{ sub: string; username: string }>(
        token,
        { secret: process.env[AUTH_ENV.jwtSecret] },
      );
      (request as Request & { user?: AuthenticatedUser }).user = {
        id: payload.sub,
        username: payload.username,
      };
      return true;
    } catch {
      throw new UnauthorizedException();
    }
  }

  private extractToken(request: Request): string | undefined {
    const [scheme, value] = request.headers.authorization?.split(' ') ?? [];
    return scheme === 'Bearer' ? value : undefined;
  }
}
