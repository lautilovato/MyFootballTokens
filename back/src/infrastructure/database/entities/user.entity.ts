import { randomUUID } from 'node:crypto';
import { OptionalProps } from '@mikro-orm/core';
import { Entity, Enum, PrimaryKey, Property } from '@mikro-orm/decorators/legacy';

/** Roles de una cuenta (11-admin-panel FR-001). El de administrador solo lo otorga el seed. */
export enum UserRole {
  USER = 'user',
  ADMIN = 'admin',
}

@Entity()
export class User {
  [OptionalProps]?: 'role';

  @PrimaryKey({ type: 'uuid' })
  id: string = randomUUID();

  /** Identificador de login. Se persiste siempre normalizado (data-model.md #1). */
  @Property({ type: 'string', unique: true })
  email!: string;

  /** Identidad visible. Deliberadamente NO único (data-model.md #2). */
  @Property({ type: 'string' })
  username!: string;

  /** Hash bcrypt. El nombre del campo es parte de la defensa de FR-004. */
  @Property({ type: 'string' })
  passwordHash!: string;

  /**
   * Saldo en créditos, entero y no negativo (08-sobres FR-004, FR-005): lo garantiza un CHECK en
   * la base. Solo lo cambian los movimientos de `credits` y `packs`, que dejan su registro
   * inmutable en `credit_movement`.
   */
  @Property({ type: 'integer', default: 0 })
  credits: number = 0;

  /** No da ningún poder sobre tokens ni saldos (11-admin-panel FR-006). */
  @Enum({ items: () => UserRole, default: UserRole.USER })
  role: UserRole = UserRole.USER;

  @Property({ type: 'Date', onCreate: () => new Date() })
  createdAt!: Date;

  @Property({ type: 'Date', onUpdate: () => new Date(), nullable: true })
  updatedAt?: Date;
}
