import { randomUUID } from 'node:crypto';
import { jest } from '@jest/globals';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { EntityManager } from '@mikro-orm/postgresql';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import {
  DEFAULT_PLAYERS,
  cleanAll,
  openPack,
  registerUser,
  resetCaches,
  seedPlayers,
  setCredits,
  syncStock,
} from './support/packs-fixtures';

jest.setTimeout(120_000);

/** 08-sobres US3 (inventario) y US4 (historial de un token). */
describe('Tokens (e2e)', () => {
  let app: INestApplication;
  let em: EntityManager;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    await app.init();
    em = app.get(EntityManager);
  });

  beforeEach(async () => {
    await cleanAll(em);
    await seedPlayers(em);
    await resetCaches(app);
    await syncStock(app);
  });

  afterAll(async () => {
    await cleanAll(em);
    await app.close();
  });

  function get(token: string, path: string) {
    return request(app.getHttpServer()).get(path).set('Authorization', `Bearer ${token}`);
  }

  /** Abre `n` sobres del tipo y devuelve los ids de los tokens recibidos. */
  async function openMany(token: string, type: string, n: number): Promise<string[]> {
    const ids: string[] = [];
    for (let i = 0; i < n; i++) {
      const { body } = await openPack(app, token, { type }).expect(201);
      ids.push(...body.cards.map((c: any) => c.tokenId));
    }
    return ids;
  }

  async function allInventory(token: string, limit = 2): Promise<any[]> {
    const items: any[] = [];
    for (let page = 1; ; page++) {
      const { body } = await get(token, `/inventory?page=${page}&limit=${limit}`).expect(200);
      items.push(...body.data);
      if (page >= body.meta.totalPages) return items;
    }
  }

  // ---------------------------------------------------------------- US3 — inventario

  describe('US3 — ver mis cartas (FR-033 a FR-036)', () => {
    it('contiene exactamente los tokens recibidos, agrupados por jugador (US3-1, US3-3)', async () => {
      const { token, userId } = await registerUser(app, 'ana@tokens.test');
      await setCredits(em, userId, 100_000);
      const received = await openMany(token, 'legendary', 3);

      const items = await allInventory(token, 100);
      const tokenIds = items.flatMap((item) => item.tokens.map((t: any) => t.id));
      expect(new Set(tokenIds)).toEqual(new Set(received));
      expect(items.reduce((sum, item) => sum + item.count, 0)).toBe(received.length);

      for (const item of items) {
        expect(item.count).toBe(item.tokens.length);
        const fixture = DEFAULT_PLAYERS.find((p) => p.name === item.player.name)!;
        expect(item.player).toMatchObject({
          name: fixture.name,
          position: 'MF',
          club: { name: 'E2E Sobres FC' },
          rarity: expect.any(String),
          marketValue: fixture.price, // cotización vigente (Clarifications)
        });
        expect(item.reputation).toBe(fixture.reputation);
        const serials = item.tokens.map((t: any) => t.serial);
        expect(serials).toEqual([...serials].sort((a, b) => a - b));
      }
    });

    it('un usuario sin cartas recibe una lista vacía (US3-2)', async () => {
      const { token } = await registerUser(app, 'vacio@tokens.test');
      const { body } = await get(token, '/inventory').expect(200);
      expect(body).toEqual({ data: [], meta: { total: 0, page: 1, limit: 20, totalPages: 0 } });
    });

    it('ordena por reputación de mayor a menor (US3-4, FR-035)', async () => {
      const { token, userId } = await registerUser(app, 'orden@tokens.test');
      await setCredits(em, userId, 100_000);
      await openMany(token, 'legendary', 4);

      const items = await allInventory(token, 100);
      const reputations = items.map((item) => item.reputation);
      expect(reputations).toEqual([...reputations].sort((a, b) => b - a));
    });

    it('un token que deja de ser del usuario no aparece (US3-5, FR-033)', async () => {
      const { token, userId } = await registerUser(app, 'pierde@tokens.test');
      const [lost, ...kept] = await openMany(token, 'common', 1);
      const other = await registerUser(app, 'gana@tokens.test');
      await em.execute(`update "token" set "owner_id" = ? where "id" = ?`, [other.userId, lost]);

      const tokenIds = (await allInventory(token, 100)).flatMap((item) => item.tokens.map((t: any) => t.id));
      expect(tokenIds).not.toContain(lost);
      expect(new Set(tokenIds)).toEqual(new Set(kept));
      expect(userId).toBeDefined();
    });

    it('cada usuario ve solo su inventario (US3-6)', async () => {
      const ana = await registerUser(app, 'ana2@tokens.test');
      const beto = await registerUser(app, 'beto2@tokens.test');
      const anas = await openMany(ana.token, 'rare', 1);

      const betoIds = (await allInventory(beto.token, 100)).flatMap((i) => i.tokens.map((t: any) => t.id));
      expect(betoIds.some((id: string) => anas.includes(id))).toBe(false);
      // No hay forma de pedir el de otro: un parámetro extra es inválido.
      await get(ana.token, `/inventory?userId=${beto.userId}`).expect(422);
    });

    it('la paginación permite recorrerlo completo (US3-8, FR-035)', async () => {
      const { token, userId } = await registerUser(app, 'paginas@tokens.test');
      await setCredits(em, userId, 100_000);
      await openMany(token, 'legendary', 5);

      const full = (await get(token, '/inventory?limit=100').expect(200)).body;
      const paged = await allInventory(token, 2);
      expect(paged.map((i) => i.player.id)).toEqual(full.data.map((i: any) => i.player.id));
      expect(full.meta.total).toBe(full.data.length);
    });

    it('no existen operaciones para sacar un token del inventario (US3-7, FR-036)', async () => {
      const { token } = await registerUser(app, 'sin-acciones@tokens.test');
      const [tokenId] = await openMany(token, 'common', 1);
      for (const path of [`/tokens/${tokenId}/sell`, `/tokens/${tokenId}/transfer`, `/inventory/${tokenId}/list`]) {
        const res = await request(app.getHttpServer()).post(path).set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(404);
      }
    });

    it('sin sesión responde 401 UNAUTHENTICATED', async () => {
      const res = await request(app.getHttpServer()).get('/inventory').expect(401);
      expect(res.body.code).toBe('UNAUTHENTICATED');
    });

    it('una paginación inválida responde 422 VALIDATION_ERROR', async () => {
      const { token } = await registerUser(app, 'pag@tokens.test');
      const res = await get(token, '/inventory?page=0').expect(422);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });
  });

  // ---------------------------------------------------------------- US4 — historial de un token

  describe('US4 — historial de una carta (FR-030 a FR-032)', () => {
    it('muestra la emisión y la entrega en sobre, en orden y sin eventos internos (US4-1, US4-2)', async () => {
      const { token, userId } = await registerUser(app, 'hist@tokens.test');
      const { body: opening } = await openPack(app, token, { type: 'rare' }).expect(201);
      const card = opening.cards[0];

      const { body } = await get(token, `/tokens/${card.tokenId}/history`).expect(200);
      expect(body).toMatchObject({ tokenId: card.tokenId, serial: card.serial, playerId: card.player.id });
      expect(body.events.map((e: any) => e.type)).toEqual(['emision', 'entrega_en_sobre']);
      expect(body.events[0]).toMatchObject({ from: null, to: 'plataforma', operation: null });
      expect(body.events[1]).toMatchObject({
        from: 'plataforma',
        to: 'yo',
        quotePrice: card.quotePrice,
        rarity: card.rarity,
        operation: { type: 'pack_opening', id: opening.id },
      });
      expect(new Date(body.events[0].at) <= new Date(body.events[1].at)).toBe(true);
      expect(userId).toBeDefined();
    });

    it('los demás dueños aparecen sin identificar (US4-3)', async () => {
      const ana = await registerUser(app, 'ana3@tokens.test');
      const beto = await registerUser(app, 'beto3@tokens.test');
      const [tokenId] = await openMany(ana.token, 'common', 1);
      // Un movimiento futuro (mercado) simulado: el token pasa de ana a beto.
      await em.execute(`update "token" set "owner_id" = ? where "id" = ?`, [beto.userId, tokenId]);
      await em.execute(
        `insert into "token_event" ("id", "token_id", "type", "from_status", "to_status", "from_owner_id",
           "to_owner_id", "correlation_id", "created_at")
         values (?, ?, 'puesta_en_venta', 'de_usuario', 'de_usuario', ?, ?, 'e2e', now() + interval '1 second')`,
        [randomUUID(), tokenId, ana.userId, beto.userId],
      );

      const deBeto = (await get(beto.token, `/tokens/${tokenId}/history`).expect(200)).body.events;
      expect(deBeto[1]).toMatchObject({ type: 'entrega_en_sobre', to: 'otro_usuario' });
      expect(deBeto[2]).toMatchObject({ from: 'otro_usuario', to: 'yo' });
      expect(JSON.stringify(deBeto)).not.toContain(ana.userId);

      // US4-5: ana ya no lo posee, pero lo poseyó: puede ver su historial.
      const deAna = (await get(ana.token, `/tokens/${tokenId}/history`).expect(200)).body.events;
      expect(deAna[1]).toMatchObject({ to: 'yo' });
      expect(deAna[2]).toMatchObject({ from: 'yo', to: 'otro_usuario' });
    });

    it('un token ajeno o inexistente responde 404 TOKEN_NOT_FOUND sin distinguirlos (US4-4)', async () => {
      const ana = await registerUser(app, 'ana4@tokens.test');
      const beto = await registerUser(app, 'beto4@tokens.test');
      const [ajeno] = await openMany(ana.token, 'common', 1);

      const a = await get(beto.token, `/tokens/${ajeno}/history`).expect(404);
      const b = await get(beto.token, `/tokens/${randomUUID()}/history`).expect(404);
      expect(a.body.code).toBe('TOKEN_NOT_FOUND');
      expect({ ...a.body, correlationId: null }).toEqual({ ...b.body, correlationId: null });
      // Un token de la plataforma tampoco es visible.
      const [{ id }] = await em.execute<{ id: string }[]>(`select "id" from "token" where "status" = 'en_sobre' limit 1`);
      await get(beto.token, `/tokens/${id}/history`).expect(404);
    });

    it('un id con formato inválido responde 422 VALIDATION_ERROR', async () => {
      const { token } = await registerUser(app, 'uuid@tokens.test');
      const res = await get(token, '/tokens/no-es-uuid/history').expect(422);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });

    it('los eventos no se pueden modificar ni borrar (US4-6, FR-040)', async () => {
      await expect(em.execute('delete from "token_event"')).rejects.toThrow(/inmutable/);
      await expect(em.execute(`update "token_event" set "rarity" = 'legendary'`)).rejects.toThrow(/inmutable/);
    });
  });
});
