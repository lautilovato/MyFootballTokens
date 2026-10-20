import type { INestApplication } from '@nestjs/common';
import type { EntityManager } from '@mikro-orm/postgresql';
import request from 'supertest';
import { League } from '../../src/infrastructure/database/entities/league.entity';
import { Player, PlayerPosition } from '../../src/infrastructure/database/entities/player.entity';
import { PlayerQuote } from '../../src/infrastructure/database/entities/player-quote.entity';
import { PlayerSeasonStats } from '../../src/infrastructure/database/entities/player-season-stats.entity';
import { QuoteRun } from '../../src/infrastructure/database/entities/quote-run.entity';
import { Team } from '../../src/infrastructure/database/entities/team.entity';
import { User } from '../../src/infrastructure/database/entities/user.entity';
import { PacksService } from '../../src/modules/packs/packs.service';
import { PlayerService } from '../../src/modules/player/player.service';
import { cleanPacksData } from './clean-database';

export const ADMIN_KEY_HEADER = 'x-api-key';
export const PASSWORD = 'Passw0rd!2026';

export interface PlayerFixture {
  name: string;
  /** Nula = sin reputación cargada (no elegible, FR-068). */
  reputation: number | null;
  /** 0 = nunca cotizado (no elegible, FR-027). */
  price: number;
}

/**
 * Catálogo chico para los e2e de 08-sobres: seis jugadores elegibles que cubren las cuatro
 * rarezas, uno sin cotización y uno sin reputación.
 */
export const DEFAULT_PLAYERS: PlayerFixture[] = [
  { name: 'Leo Legendario', reputation: 91, price: 9000 },
  { name: 'Ezequiel Epico', reputation: 85, price: 6000 },
  { name: 'Emilio Epico', reputation: 81, price: 5000 },
  { name: 'Raul Raro', reputation: 75, price: 3000 },
  { name: 'Ramon Raro', reputation: 71, price: 2500 },
  { name: 'Carlos Comun', reputation: 60, price: 1000 },
  { name: 'Nico SinCotizar', reputation: 80, price: 0 },
  { name: 'Pedro SinReputacion', reputation: null, price: 4000 },
];

export async function cleanAll(em: EntityManager): Promise<void> {
  await cleanPacksData(em);
  await em.nativeDelete(PlayerSeasonStats, {});
  await em.nativeDelete(PlayerQuote, {});
  await em.nativeDelete(QuoteRun, {});
  await em.nativeDelete(Player, {});
  await em.nativeDelete(Team, {});
  await em.nativeDelete(League, {});
  await em.nativeDelete(User, {});
}

/**
 * Redis sobrevive a la limpieza de la base (y entre corridas): sin esto, el catálogo de sobres o
 * el listado de jugadores de un test anterior responderían por los datos recién sembrados.
 */
export async function resetCaches(app: INestApplication): Promise<void> {
  await app.get(PacksService).bumpStockVersion();
  await app.get(PlayerService).invalidateListCache();
}

/** Siembra los jugadores y devuelve sus ids por nombre. */
export async function seedPlayers(em: EntityManager, players: PlayerFixture[] = DEFAULT_PLAYERS): Promise<Map<string, string>> {
  const fork = em.fork();
  const league = fork.create(League, { name: 'E2E Sobres', country: 'Testland' });
  const team = fork.create(Team, { name: 'E2E Sobres FC', league, crestUrl: null });
  const ids = new Map<string, string>();
  for (const fixture of players) {
    const player = fork.create(Player, {
      fullName: fixture.name,
      position: PlayerPosition.MF,
      baseValue: fixture.price.toFixed(2),
      worldReputation: fixture.reputation,
      nationality: 'Argentina',
      team,
      createdAt: new Date(),
    });
    fork.persist(player);
    ids.set(fixture.name, player.id);
  }
  fork.persist([league, team]);
  await fork.flush();
  return ids;
}

export async function registerUser(
  app: INestApplication,
  email: string,
): Promise<{ token: string; userId: string }> {
  const res = await request(app.getHttpServer())
    .post('/auth/register')
    .send({ email, username: email.split('@')[0], password: PASSWORD })
    .expect(201);
  return { token: res.body.accessToken, userId: res.body.user.id };
}

export async function setCredits(em: EntityManager, userId: string, credits: number): Promise<void> {
  await em.fork().nativeUpdate(User, { id: userId }, { credits });
}

export async function syncStock(app: INestApplication) {
  return request(app.getHttpServer())
    .post('/packs/stock/sync')
    .set(ADMIN_KEY_HEADER, process.env.ADMIN_API_KEY!)
    .expect(200);
}

export function openPack(app: INestApplication, token: string, body: Record<string, unknown>) {
  return request(app.getHttpServer()).post('/packs/openings').set('Authorization', `Bearer ${token}`).send(body);
}
