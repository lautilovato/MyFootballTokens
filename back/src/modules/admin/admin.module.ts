import { Module } from '@nestjs/common';
import { AuthSharedModule } from '../../shared/auth/auth-shared.module';
import { AdminController } from './admin.controller';
import { AdminRepository } from './admin.repository';
import { AdminService } from './admin.service';

/**
 * Panel de administración (11-admin-panel): métricas de solo lectura. Lee las tablas de los demás
 * dominios con SQL propio, sin importar sus módulos.
 */
@Module({
  imports: [AuthSharedModule],
  controllers: [AdminController],
  providers: [AdminService, AdminRepository],
})
export class AdminModule {}
