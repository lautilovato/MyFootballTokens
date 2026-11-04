import { CanActivate, ExecutionContext, ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import type { Request } from 'express';
import { CorrelationIdStore } from '../logging/correlation-id.store';
import type { AuthenticatedUser } from './jwt-auth.guard';

/**
 * Protege el panel de administración (11-admin-panel). Va después de `JwtAuthGuard`, que deja el
 * usuario en el pedido. El rol no viaja en el JWT y se lee de la base en cada pedido: una cuenta
 * que lo perdió queda afuera aunque su sesión siga vigente (FR-004, research #2).
 *
 * El código va en el cuerpo porque `ApiErrorFilter` responde 500 ante cualquier excepción sin él.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  private readonly logger = new Logger(AdminGuard.name);

  constructor(private readonly em: EntityManager) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const { user } = context.switchToHttp().getRequest<Request & { user: AuthenticatedUser }>();
    const [account] = await this.em.execute<{ role: string }[]>('select "role" from "user" where "id" = ?', [user.id]);
    if (account?.role === 'admin') return true;

    this.logger.warn(`Acceso de administrador rechazado (correlationId=${CorrelationIdStore.getId() ?? 'unknown'})`);
    throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Esta sección es solo para administradores' });
  }
}
