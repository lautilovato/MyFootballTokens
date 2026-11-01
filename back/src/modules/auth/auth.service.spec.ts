import { jest } from '@jest/globals';
import { ConflictException, InternalServerErrorException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { AuthRepository, normalizeEmail } from './auth.repository';
import { INVALID_CREDENTIALS_MESSAGE } from '../../shared/auth/auth.constants';
import type { User } from '../../infrastructure/database/entities/user.entity';
import type { CreditsService } from '../credits/credits.service';

describe('AuthService', () => {
  let repo: {
    findByEmail: ReturnType<typeof jest.fn>;
    existsByEmail: ReturnType<typeof jest.fn>;
    create: ReturnType<typeof jest.fn>;
    inTransaction: ReturnType<typeof jest.fn>;
  };
  let jwt: { sign: ReturnType<typeof jest.fn> };
  let credits: { grantInitial: ReturnType<typeof jest.fn> };
  let service: AuthService;

  const usuario = (over: Partial<User> = {}): User =>
    ({
      id: 'u1',
      email: 'ana@example.com',
      username: 'ana',
      passwordHash: '',
      createdAt: new Date(),
      ...over,
    }) as User;

  beforeEach(() => {
    repo = {
      findByEmail: jest.fn(),
      existsByEmail: jest.fn(),
      create: jest.fn(),
      // Sin base: la "transacción" solo corre el trabajo y propaga lo que lance.
      inTransaction: jest.fn((work: () => Promise<unknown>) => work()),
    };
    jwt = { sign: jest.fn().mockReturnValue('token-firmado') };
    credits = { grantInitial: jest.fn().mockResolvedValue(true as never) };
    service = new AuthService(
      repo as unknown as AuthRepository,
      jwt as unknown as JwtService,
      credits as unknown as CreditsService,
    );
  });

  describe('normalizeEmail', () => {
    it('baja a minusculas y recorta, para que el indice unico signifique algo', () => {
      expect(normalizeEmail('  Ana@Example.COM ')).toBe('ana@example.com');
    });
  });

  describe('register', () => {
    it('persiste la contrasena hasheada, nunca en claro (FR-003)', async () => {
      repo.existsByEmail.mockResolvedValue(false);
      repo.create.mockImplementation((async (email: string, username: string, passwordHash: string) =>
        usuario({ email, username, passwordHash })) as never);

      await service.register({ email: 'ana@example.com', username: 'ana', password: 'secreta123' });

      const hash = repo.create.mock.calls[0][2] as string;
      expect(hash).not.toBe('secreta123');
      expect(hash.startsWith('$2b$')).toBe(true);
      expect(await bcrypt.compare('secreta123', hash)).toBe(true);
    });

    it('no devuelve el hash en la respuesta (FR-004)', async () => {
      repo.existsByEmail.mockResolvedValue(false);
      repo.create.mockResolvedValue(usuario({ passwordHash: '$2b$10$loquesea' }));

      const res = await service.register({
        email: 'ana@example.com',
        username: 'ana',
        password: 'secreta123',
      });

      expect(JSON.stringify(res)).not.toContain('$2b$');
      expect(Object.keys(res.user)).toEqual(['id', 'email', 'username', 'role']);
    });

    it('rechaza un email ya registrado (FR-005)', async () => {
      repo.existsByEmail.mockResolvedValue(true);
      await expect(
        service.register({ email: 'ana@example.com', username: 'ana', password: 'secreta123' }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(repo.create).not.toHaveBeenCalled();
    });

    it('traduce el registro concurrente a conflicto, no a 500 (data-model #5)', async () => {
      repo.existsByEmail.mockResolvedValue(false);
      repo.create.mockResolvedValue(null); // la restriccion unica lo rechazo
      await expect(
        service.register({ email: 'ana@example.com', username: 'ana', password: 'secreta123' }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(credits.grantInitial).not.toHaveBeenCalled();
    });

    it('acredita la entrega inicial dentro de la transacción del registro (08-sobres FR-001)', async () => {
      repo.existsByEmail.mockResolvedValue(false);
      repo.create.mockResolvedValue(usuario({ id: 'nuevo' }));

      await service.register({ email: 'ana@example.com', username: 'ana', password: 'secreta123' });

      expect(repo.inTransaction).toHaveBeenCalledTimes(1);
      expect(credits.grantInitial).toHaveBeenCalledWith('nuevo');
    });

    it('si la entrega inicial falla, responde 500 sin detalle interno', async () => {
      repo.existsByEmail.mockResolvedValue(false);
      repo.create.mockResolvedValue(usuario());
      credits.grantInitial.mockRejectedValue(new Error('detalle del ORM') as never);

      const error = await service
        .register({ email: 'ana@example.com', username: 'ana', password: 'secreta123' })
        .catch((e) => e);

      expect(error).toBeInstanceOf(InternalServerErrorException);
      expect(JSON.stringify(error.getResponse())).not.toContain('ORM');
    });
  });

  describe('login', () => {
    it('emite el token con payload no sensible: solo sub y username (FR-007)', async () => {
      const passwordHash = await bcrypt.hash('secreta123', 10);
      repo.findByEmail.mockResolvedValue(usuario({ passwordHash }));

      await service.login({ email: 'ana@example.com', password: 'secreta123' });

      expect(jwt.sign).toHaveBeenCalledWith({ sub: 'u1', username: 'ana' });
      const payload = jwt.sign.mock.calls[0][0] as Record<string, unknown>;
      expect(payload).not.toHaveProperty('email');
      expect(payload).not.toHaveProperty('passwordHash');
    });

    it('da el mismo error para email inexistente y contrasena incorrecta (FR-008, SC-006)', async () => {
      const passwordHash = await bcrypt.hash('secreta123', 10);

      repo.findByEmail.mockResolvedValue(null);
      const sinCuenta = await service
        .login({ email: 'nadie@example.com', password: 'x' })
        .catch((e) => e);

      repo.findByEmail.mockResolvedValue(usuario({ passwordHash }));
      const malPassword = await service
        .login({ email: 'ana@example.com', password: 'incorrecta' })
        .catch((e) => e);

      expect(sinCuenta).toBeInstanceOf(UnauthorizedException);
      expect(malPassword).toBeInstanceOf(UnauthorizedException);
      expect(sinCuenta.message).toBe(INVALID_CREDENTIALS_MESSAGE);
      expect(malPassword.message).toBe(sinCuenta.message);
      expect(sinCuenta.getResponse()).toEqual(malPassword.getResponse());
    });

    it('hashea igual cuando la cuenta no existe, para no filtrarlo por tiempo (research #8)', async () => {
      // No se puede espiar bcrypt.compare bajo ESM (modulo congelado), asi que
      // se verifica la propiedad real: bcrypt con costo 10 cuesta decenas de ms.
      // Si el camino "no existe" retornara sin comparar, tardaria microsegundos,
      // y esa diferencia es el oraculo que SC-006 intenta cerrar.
      repo.findByEmail.mockResolvedValue(null as never);

      const inicio = performance.now();
      await service.login({ email: 'nadie@example.com', password: 'x' }).catch(() => undefined);
      const transcurrido = performance.now() - inicio;

      expect(transcurrido).toBeGreaterThan(10);
    });
  });
});
