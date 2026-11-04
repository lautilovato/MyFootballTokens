import 'reflect-metadata';
import { MikroORM } from '@mikro-orm/postgresql';
import config from '../database.config';
import { AdminSeedConfigError, seedAdmin, type AdminSeedResult } from './admin.seed';

const MESSAGES: Record<AdminSeedResult, string> = {
  created: 'Cuenta administradora creada.',
  promoted: 'La cuenta ya existía: se le otorgó el rol de administrador.',
  unchanged: 'La cuenta ya era administradora: no hubo cambios.',
};

/** `npm run seed:admin` (11-admin-panel FR-007, FR-011). `database.config` carga el `.env`. */
async function main(): Promise<void> {
  // Sin log de consultas: con `NODE_ENV=dev` imprimiría el hash de la contraseña (FR-011).
  const orm = await MikroORM.init({ ...config, debug: false });
  try {
    const result = await seedAdmin(orm.em.fork(), process.env);
    console.log(MESSAGES[result]);
  } finally {
    await orm.close();
  }
}

main().catch((error: unknown) => {
  // Las fallas de configuración se explican solas; el resto no se imprime para no arrastrar los
  // parámetros de la consulta, que incluyen el hash (FR-011).
  console.error(error instanceof AdminSeedConfigError ? error.message : 'No se pudo ejecutar el seed del administrador.');
  process.exit(1);
});
