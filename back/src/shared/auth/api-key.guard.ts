import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { ADMIN_API_KEY_HEADER, AUTH_ENV } from './auth.constants';

/**
 * Protege los disparos administrativos (FR-010). Es independiente de la sesión
 * de usuario: un JWT válido no habilita nada de acá (FR-011).
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const expected = process.env[AUTH_ENV.adminApiKey]?.trim();
    // Defensa en profundidad: main.ts ya impide arrancar sin la clave.
    if (!expected) throw new UnauthorizedException();

    const request = context.switchToHttp().getRequest<Request>();
    const provided = request.headers[ADMIN_API_KEY_HEADER];
    const value = Array.isArray(provided) ? provided[0] : provided;

    if (!value?.trim() || value !== expected) throw new UnauthorizedException();
    return true;
  }
}
