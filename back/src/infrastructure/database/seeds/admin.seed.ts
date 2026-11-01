import { randomUUID } from 'node:crypto';
import * as bcrypt from 'bcrypt';
import { isEmail } from 'class-validator';
import type { EntityManager } from '@mikro-orm/postgresql';
import { ADMIN_SEED_ENV, BCRYPT_COST } from '../../../shared/auth/auth.constants';
import { normalizeEmail } from '../../../modules/auth/auth.repository';

const DEFAULT_USERNAME = 'Administrador';
const MIN_PASSWORD_LENGTH = 8;

export type AdminSeedResult = 'created' | 'promoted' | 'unchanged';

/** Falta o está mal una credencial. Nunca incluye su valor. */
export class AdminSeedConfigError extends Error {}

interface AdminCredentials {
  email: string;
  password: string;
  username: string;
}

/** Mismas reglas que `RegisterDto` (11-admin-panel FR-008). */
function readCredentials(env: NodeJS.ProcessEnv): AdminCredentials {
  const email = env[ADMIN_SEED_ENV.email]?.trim();
  const password = env[ADMIN_SEED_ENV.password];
  const username = env[ADMIN_SEED_ENV.username]?.trim() || DEFAULT_USERNAME;

  if (!email || !password) {
    throw new AdminSeedConfigError(`Faltan ${ADMIN_SEED_ENV.email} y ${ADMIN_SEED_ENV.password} en el entorno.`);
  }
  if (!isEmail(email)) {
    throw new AdminSeedConfigError(`${ADMIN_SEED_ENV.email} no tiene un formato válido.`);
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new AdminSeedConfigError(`${ADMIN_SEED_ENV.password} debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`);
  }
  return { email: normalizeEmail(email), password, username };
}

/**
 * Crea la cuenta administradora o le da el rol a la cuenta común con ese correo (FR-007, FR-010).
 * El upsert es una sola sentencia: dos ejecuciones simultáneas no duplican la cuenta. Sin fila
 * devuelta, la cuenta ya era administradora. Una cuenta existente solo cambia de rol: conserva su
 * contraseña, su saldo y sus cartas.
 *
 * Saldo 0 y sin entrega inicial (FR-009): el backfill de créditos excluye a los administradores.
 */
export async function seedAdmin(em: EntityManager, env: NodeJS.ProcessEnv): Promise<AdminSeedResult> {
  const { email, password, username } = readCredentials(env);
  const passwordHash = await bcrypt.hash(password, BCRYPT_COST);

  const rows = await em.execute<{ inserted: boolean }[]>(
    `insert into "user" ("id", "email", "username", "password_hash", "credits", "role", "created_at")
     values (?, ?, ?, ?, 0, 'admin', now())
     on conflict ("email") do update set "role" = 'admin', "updated_at" = now()
       where "user"."role" <> 'admin'
     returning (xmax = 0) as "inserted"`,
    [randomUUID(), email, username, passwordHash],
  );

  if (rows.length === 0) return 'unchanged';
  return rows[0].inserted ? 'created' : 'promoted';
}
