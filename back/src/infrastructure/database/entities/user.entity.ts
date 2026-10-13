import { randomUUID } from 'node:crypto';
import { Entity, PrimaryKey, Property } from '@mikro-orm/decorators/legacy';

@Entity()
export class User {
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

  @Property({ type: 'Date', onCreate: () => new Date() })
  createdAt!: Date;

  @Property({ type: 'Date', onUpdate: () => new Date(), nullable: true })
  updatedAt?: Date;
}
