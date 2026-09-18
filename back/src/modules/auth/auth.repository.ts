import { Injectable } from '@nestjs/common';
import { EntityManager, UniqueConstraintViolationException } from '@mikro-orm/postgresql';
import { User } from '../../infrastructure/database/entities/user.entity';

/** Normaliza el email para que el índice único signifique lo que se espera (data-model.md #1). */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

@Injectable()
export class AuthRepository {
  constructor(private readonly em: EntityManager) {}

  async findByEmail(email: string): Promise<User | null> {
    return this.em.findOne(User, { email: normalizeEmail(email) });
  }

  async existsByEmail(email: string): Promise<boolean> {
    const count = await this.em.count(User, { email: normalizeEmail(email) });
    return count > 0;
  }

  /**
   * Crea el usuario. La autoridad sobre la unicidad es la restricción de la base,
   * no un chequeo previo: dos registros simultáneos pasan ambos el chequeo y uno
   * falla acá. Devuelve null en ese caso para que el service lo traduzca a 409
   * en vez de dejarlo salir como 500 (data-model.md #5).
   */
  async create(email: string, username: string, passwordHash: string): Promise<User | null> {
    const user = this.em.create(User, {
      email: normalizeEmail(email),
      username,
      passwordHash,
      createdAt: new Date(),
    });
    try {
      this.em.persist(user);
      await this.em.flush();
      return user;
    } catch (error) {
      if (error instanceof UniqueConstraintViolationException) return null;
      throw error;
    }
  }
}
