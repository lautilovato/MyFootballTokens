# Spec: Enriquecimiento de jugadores con métricas de rendimiento desde WhoScored

Depende de: `spec.md` (catálogo base desde Football-Data.org) — esta spec asume que `League`,
`Team` y `Player` ya existen y están poblados.

## 1. Objetivo

Enriquecer los jugadores ya cargados con métricas de rendimiento (Altura, Partidos Jugados, goles,Tiros por partido, asistencias, Pases clave, rating, Entradas, intercepciones, faltas, despejes, tarjetas amarillas y tarjetas rojas) obtenidas por scraping de WhoScored, para alimentar la
fórmula de score definida en el documento de visión:

```
score = 0.25*goals + 0.15*assists + 0.10*shots + 0.10*keyPasses
      + 0.10*dribbles + 0.10*tackles + 0.20*rating
```

## 2. Alcance

**Incluido:**
- Cliente de scraping para WhoScored (HTTP simple + fallback a browser headless).
- Adapter que parsea el HTML/JSON embebido a un shape de dominio normalizado.
- Matcher que vincula cada jugador de WhoScored con su `Player` ya existente (por
  `footballDataId`) usando nombre + equipo, y completa `Player.whoscoredId`.
- Entidades `PlayerSeasonStats` (snapshot agregado, refresh semanal) y `PlayerMatchStats`
  (detalle partido por partido, para el historial de cotizaciones).
- Servicio de ingesta (`PlayerStatsIngestionService`) que orquesta todo lo anterior.

**Fuera de alcance (próximas specs):**
- Cálculo de la cotización en sí (`QuotationService`) — esta spec solo deja los datos crudos
  persistidos; el cálculo del score/valor es otra spec que consume `PlayerSeasonStats` /
  `PlayerMatchStats`.
- Scheduler semanal — se define para reusar `PlayerStatsIngestionService.run()`, igual que se
  hizo con la ingesta de Football-Data.org.

## 3. Fuente externa: WhoScored

WhoScored no tiene API pública ni documentación oficial — es scraping puro sobre HTML/JSON que
la propia página usa para renderizarse. Dos consecuencias directas:

- **No hay contrato estable.** El markup puede cambiar sin aviso. Todo lo que sigue en esta spec
  sobre selectores/estructura hay que **confirmarlo inspeccionando la página real** (DevTools →
  Network/Elements) antes de escribir el parser final — lo marco explícitamente como Paso 0 más
  abajo, en vez de asumir selectores que no pude verificar en vivo.
- **Protección anti-bot.** A diferencia de Football-Data.org, WhoScored puede devolver challenges
  de Cloudflare ante tráfico que parece automatizado. El cliente tiene que degradar a un browser
  headless solo cuando el `GET` simple falla, no usarlo por default (ver sección 6).

### Dos páginas objetivo, dos granularidades

| Página | URL (patrón) | Qué trae | Cuándo se usa |
|---|---|---|---|
| Estadísticas de plantel | `whoscored.com/teams/{id}/show/{slug}` (la tabla de stats del equipo — confirmar la ruta/tab exacta en Paso 0) | Todos los jugadores del equipo con sus stats de temporada agregadas (goles, asistencias, rating promedio, apps, etc.) en una sola request | Refresh semanal masivo — 1 request por equipo, igual cantidad que usaste para Football-Data.org |
| Estadísticas por partido del jugador | `whoscored.com/players/{id}/matchstatistics/{slug}` (confirmado — son las URLs que ya están en el documento de visión) | Tabla partido por partido de la temporada: rating, minutos, goles, asistencias, tiros, pases clave, regates, tackles, tarjetas, MOTM | Bajo demanda, cuando se necesita el historial de un jugador puntual (`GET /players/:id/quotes`) |

### Paso 0 — Reconnaissance (hacer antes de codear el parser)

1. Abrir una página de plantel y una de `matchstatistics` con DevTools → Network → filtrar por
   `Fetch/XHR` y por `Doc`. Confirmar si la tabla viene en el HTML inicial (server-rendered) o se
   arma con un JSON embebido en un `<script>` (como pasa con `matchCentreData` en las páginas de
   partido).
2. Si es HTML server-rendered: anotar el `id`/`class` de la tabla y de las columnas para
   parsearlo con `cheerio`.
3. Si es JSON embebido: anotar el nombre de la variable (regex tipo
   `/scriptVarName:\s*(\{.*\})/`) y el shape del objeto.
4. Documentar el resultado en este archivo (reemplazando esta sección) antes de dar por cerrada
   la spec — así el adapter no se escribe a ciegas.

## 4. Estrategia de matching (WhoScored ↔ Football-Data.org)

Ninguna de las dos fuentes comparte IDs. El matching se hace así, en orden de confianza:

1. **Nombre normalizado + equipo**: sacar acentos, pasar a minúsculas, comparar `Player.name`
   (de football-data.org) contra el nombre de WhoScored, restringido a jugadores del mismo
   `Team` (ya vinculado por nombre de equipo/liga).
2. **Desempate por fecha de nacimiento** si hay más de un jugador del mismo equipo con nombre
   similar (ej. apodos como "Rodri" vs "Rodrigo").
3. **Sin match automático**: si no se alcanza un umbral de similitud (ej. Levenshtein/Jaro-Winkler
   > 0.85) se guarda en una tabla de revisión (`UnmatchedWhoscoredPlayer`) en vez de forzar un
   match incorrecto — mejor no tener el dato que tenerlo mal vinculado a otro jugador.

```ts
// src/whoscored/matching/player-matcher.ts
import { Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/core';
import { Player } from '../../players/entities/player.entity';
import { Team } from '../../teams/entities/team.entity';
import { normalizeName, nameSimilarity } from './name-utils';

const MATCH_THRESHOLD = 0.85;

@Injectable()
export class PlayerMatcher {
  constructor(private readonly em: EntityManager) {}

  async match(whoscoredName: string, team: Team): Promise<Player | null> {
    const candidates = await this.em.find(Player, { team });
    const target = normalizeName(whoscoredName);

    let best: { player: Player; score: number } | null = null;
    for (const candidate of candidates) {
      const score = nameSimilarity(target, normalizeName(candidate.name));
      if (!best || score > best.score) best = { player: candidate, score };
    }

    if (best && best.score >= MATCH_THRESHOLD) return best.player;
    return null;
  }
}
```

```ts
// src/whoscored/entities/unmatched-whoscored-player.entity.ts
import { Entity, PrimaryKey, Property } from '@mikro-orm/core';
import { v4 } from 'uuid';

@Entity({ tableName: 'unmatched_whoscored_players' })
export class UnmatchedWhoscoredPlayer {
  @PrimaryKey({ type: 'uuid' })
  id: string = v4();

  @Property()
  whoscoredId!: number;

  @Property()
  whoscoredName!: string;

  @Property()
  teamExternalId!: number;

  @Property({ onCreate: () => new Date() })
  detectedAt: Date = new Date();
}
```

## 5. Modelo de datos

```ts
// src/players/entities/player.entity.ts (diff sobre la entidad existente)
// whoscoredId ya está reservado en la spec anterior; acá se completa.
```

```ts
// src/player-stats/entities/player-season-stats.entity.ts
import { Entity, PrimaryKey, Property, ManyToOne, Unique } from '@mikro-orm/core';
import { v4 } from 'uuid';
import { Player } from '../../players/entities/player.entity';

@Entity({ tableName: 'player_season_stats' })
@Unique({ properties: ['player', 'season'] })
export class PlayerSeasonStats {
  @PrimaryKey({ type: 'uuid' })
  id: string = v4();

  @ManyToOne(() => Player)
  player!: Player;

  @Property()
  season!: string; // ej. "2025-2026"

  @Property({ type: 'float', nullable: true })
  rating?: number;

  @Property({ default: 0 })
  appearances: number = 0;

  @Property({ default: 0 })
  minutesPlayed: number = 0;

  @Property({ default: 0 })
  goals: number = 0;

  @Property({ default: 0 })
  assists: number = 0;

  @Property({ type: 'float', default: 0 })
  shotsPerGame: number = 0;

  @Property({ type: 'float', default: 0 })
  keyPassesPerGame: number = 0;

  @Property({ type: 'float', default: 0 })
  dribblesPerGame: number = 0;

  @Property({ type: 'float', default: 0 })
  tacklesPerGame: number = 0;

  @Property({ type: 'float', nullable: true })
  passSuccessPercent?: number;

  @Property({ default: 0 })
  yellowCards: number = 0;

  @Property({ default: 0 })
  redCards: number = 0;

  @Property({ onUpdate: () => new Date(), onCreate: () => new Date() })
  updatedAt: Date = new Date();
}
```

```ts
// src/player-stats/entities/player-match-stats.entity.ts
import { Entity, PrimaryKey, Property, ManyToOne, Unique } from '@mikro-orm/core';
import { v4 } from 'uuid';
import { Player } from '../../players/entities/player.entity';

@Entity({ tableName: 'player_match_stats' })
@Unique({ properties: ['player', 'matchDate'] })
export class PlayerMatchStats {
  @PrimaryKey({ type: 'uuid' })
  id: string = v4();

  @ManyToOne(() => Player)
  player!: Player;

  @Property({ type: 'date' })
  matchDate!: string;

  @Property({ nullable: true })
  opponent?: string;

  @Property({ type: 'float', nullable: true })
  rating?: number;

  @Property({ default: 0 })
  minutesPlayed: number = 0;

  @Property({ default: 0 })
  goals: number = 0;

  @Property({ default: 0 })
  assists: number = 0;

  @Property({ default: 0 })
  shots: number = 0;

  @Property({ default: 0 })
  keyPasses: number = 0;

  @Property({ default: 0 })
  dribbles: number = 0;

  @Property({ default: 0 })
  tackles: number = 0;

  @Property({ default: 0 })
  yellowCards: number = 0;

  @Property({ default: 0 })
  redCards: number = 0;

  @Property({ default: false })
  manOfTheMatch: boolean = false;

  @Property({ onCreate: () => new Date() })
  createdAt: Date = new Date();
}
```

`PlayerSeasonStats` es lo que alimenta el refresh semanal masivo (1 request por equipo).
`PlayerMatchStats` es más caro de conseguir (1 request por jugador) así que se llena bajo demanda
o para un subconjunto de jugadores (ej. los que tienen tokens comprados), no para los ~2500
jugadores de las 5 ligas de una.

## 6. Cliente de scraping

```ts
// src/whoscored/whoscored.client.ts
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import * as cheerio from 'cheerio';

@Injectable()
export class WhoScoredClient {
  private readonly logger = new Logger(WhoScoredClient.name);
  private queue: Promise<unknown> = Promise.resolve();
  private readonly minDelayMs: number;
  private consecutiveBlocks = 0;

  constructor(private readonly config: ConfigService) {
    this.minDelayMs = this.config.get<number>('WHOSCORED_MIN_DELAY_MS', 3000);
  }

  async fetchHtml(path: string): Promise<cheerio.CheerioAPI> {
    const task = this.queue.then(() => this.delay(this.minDelayMs)).then(() => this.request(path));
    this.queue = task.catch(() => undefined);
    const html = await task;
    return cheerio.load(html as string);
  }

  private async request(path: string, attempt = 1): Promise<string> {
    try {
      const response = await axios.get<string>(path, {
        baseURL: this.config.get<string>('WHOSCORED_BASE_URL'),
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml',
        },
        timeout: 15_000,
      });
      this.consecutiveBlocks = 0;
      return response.data;
    } catch (error: any) {
      const status = error?.response?.status;
      const looksBlocked = status === 403 || status === 503;

      if (looksBlocked) {
        this.consecutiveBlocks++;
        this.logger.warn(`Posible bloqueo en ${path} (status ${status}), intento ${attempt}`);
      }

      if (attempt <= 2) {
        await this.delay(this.minDelayMs * attempt * 2);
        return this.request(path, attempt + 1);
      }

      // después de 2 reintentos fallidos, si venimos con bloqueos consecutivos,
      // esto es la señal de escalar a un browser headless (ver nota abajo).
      this.logger.error(`No se pudo obtener ${path} tras ${attempt} intentos: ${status ?? error.message}`);
      throw error;
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
```

**Sobre el fallback a headless browser:** no lo incluyo en el código de arranque porque agrega
una dependencia pesada (`playwright`) que solo se justifica si el `GET` simple efectivamente
empieza a devolver challenges de Cloudflare. Si `consecutiveBlocks` supera un umbral (ej. 3),
la recomendación es levantar un `WhoScoredBrowserClient` alternativo con Playwright que
implemente la misma interfaz (`fetchHtml(path): Promise<CheerioAPI>`) y que
`PlayerStatsIngestionService` lo use como fallback — sin tocar el resto del pipeline. Documentarlo
como parche puntual una vez que se confirme que hace falta, no antes.

## 7. Adapter: HTML → shape de dominio

El parsing exacto depende de lo que se confirme en el Paso 0 (sección 3). Estructura del adapter,
con el parser como punto de extensión explícito:

```ts
// src/whoscored/whoscored.adapter.ts
import { Injectable } from '@nestjs/common';
import { WhoScoredClient } from './whoscored.client';

export interface WhoScoredSquadRow {
  whoscoredId: number;
  name: string;
  rating: number | null;
  appearances: number;
  minutesPlayed: number;
  goals: number;
  assists: number;
  shotsPerGame: number;
  keyPassesPerGame: number;
  dribblesPerGame: number;
  tacklesPerGame: number;
  passSuccessPercent: number | null;
  yellowCards: number;
  redCards: number;
}

export interface WhoScoredMatchRow {
  matchDate: string;
  opponent: string | null;
  rating: number | null;
  minutesPlayed: number;
  goals: number;
  assists: number;
  shots: number;
  keyPasses: number;
  dribbles: number;
  tackles: number;
  yellowCards: number;
  redCards: number;
  manOfTheMatch: boolean;
}

@Injectable()
export class WhoScoredAdapter {
  constructor(private readonly client: WhoScoredClient) {}

  async getTeamSquadStats(teamPath: string): Promise<WhoScoredSquadRow[]> {
    const $ = await this.client.fetchHtml(teamPath);
    // TODO (Paso 0): reemplazar por los selectores/keys reales confirmados en la página.
    // Placeholder deliberado: no hay que asumir un selector que no se verificó en vivo.
    throw new Error('Parser pendiente de selectores confirmados — ver sección 3, Paso 0');
  }

  async getPlayerMatchStats(playerPath: string): Promise<WhoScoredMatchRow[]> {
    const $ = await this.client.fetchHtml(playerPath);
    // TODO (Paso 0): idem.
    throw new Error('Parser pendiente de selectores confirmados — ver sección 3, Paso 0');
  }
}
```

Dejo el `throw` explícito a propósito: es preferible que falle ruidosamente a que el equipo
copie un selector inventado y descubra en producción que la tabla nunca se parseó bien.

## 8. Servicio de ingesta

```ts
// src/whoscored/player-stats-ingestion.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/core';
import { WhoScoredAdapter } from './whoscored.adapter';
import { PlayerMatcher } from './matching/player-matcher';
import { Team } from '../teams/entities/team.entity';
import { PlayerSeasonStats } from '../player-stats/entities/player-season-stats.entity';
import { UnmatchedWhoscoredPlayer } from './entities/unmatched-whoscored-player.entity';

@Injectable()
export class PlayerStatsIngestionService {
  private readonly logger = new Logger(PlayerStatsIngestionService.name);

  constructor(
    private readonly adapter: WhoScoredAdapter,
    private readonly matcher: PlayerMatcher,
    private readonly em: EntityManager,
  ) {}

  async run(season: string): Promise<{ teamsProcessed: number; matched: number; unmatched: number }> {
    const teams = await this.em.find(Team, {}, { populate: ['league'] });
    let matched = 0;
    let unmatched = 0;

    for (const team of teams) {
      try {
        const rows = await this.adapter.getTeamSquadStats(team.whoscoredPath); // ver nota abajo
        for (const row of rows) {
          const player = await this.matcher.match(row.name, team);
          if (!player) {
            await this.em.persistAndFlush(
              this.em.create(UnmatchedWhoscoredPlayer, {
                whoscoredId: row.whoscoredId,
                whoscoredName: row.name,
                teamExternalId: team.externalId,
              }),
            );
            unmatched++;
            continue;
          }

          player.whoscoredId = row.whoscoredId;
          await this.upsertSeasonStats(player, season, row);
          matched++;
        }
      } catch (error) {
        // un equipo que falla no aborta el resto — mismo criterio de resiliencia que en football-data.org
        this.logger.error(`No se pudo procesar stats de WhoScored para el equipo ${team.name}: ${error}`);
      }
    }

    return { teamsProcessed: teams.length, matched, unmatched };
  }

  private async upsertSeasonStats(player: any, season: string, row: any): Promise<void> {
    let stats = await this.em.findOne(PlayerSeasonStats, { player, season });
    const data = {
      rating: row.rating,
      appearances: row.appearances,
      minutesPlayed: row.minutesPlayed,
      goals: row.goals,
      assists: row.assists,
      shotsPerGame: row.shotsPerGame,
      keyPassesPerGame: row.keyPassesPerGame,
      dribblesPerGame: row.dribblesPerGame,
      tacklesPerGame: row.tacklesPerGame,
      passSuccessPercent: row.passSuccessPercent,
      yellowCards: row.yellowCards,
      redCards: row.redCards,
    };
    if (!stats) {
      stats = this.em.create(PlayerSeasonStats, { player, season, ...data });
    } else {
      this.em.assign(stats, data);
    }
    await this.em.persistAndFlush([stats, player]);
  }
}
```

Nota: `team.whoscoredPath` asume que se agrega un campo `whoscoredPath` (o `whoscoredId`) a la
entidad `Team` para guardar la referencia al equipo en WhoScored — ese vínculo equipo-a-equipo
también hay que resolverlo una vez (matching por nombre, igual que con jugadores, pero mucho más
chico: ~100 equipos en vez de miles de jugadores) y cachearlo, no repetirlo en cada corrida.

## 9. Manejo de errores y resiliencia

- **Bloqueo de un equipo puntual:** se loguea, se registra en `UnmatchedWhoscoredPlayer` si
  aplica, y se sigue con el resto — mismo criterio que en la ingesta de Football-Data.org.
- **Bloqueo generalizado (Cloudflare):** el `WhoScoredClient` cuenta bloqueos consecutivos; si
  supera el umbral, corresponde escalar a browser headless (sección 6) en vez de reintentar al
  infinito con requests simples.
- **Jugador sin match:** no se descarta el proceso ni se fuerza un vínculo dudoso — queda en la
  tabla de revisión para resolución manual o para mejorar el algoritmo de matching más adelante.
- **WhoScored caído por completo:** igual que con Football-Data.org, la persistencia es
  incremental — los `PlayerSeasonStats` ya cargados en la corrida anterior siguen disponibles
  para calcular cotizaciones, cumpliendo el requisito 5.4 de tolerancia a fallas del proveedor.

## 10. Variables de entorno

```env
WHOSCORED_BASE_URL=https://www.whoscored.com
WHOSCORED_MIN_DELAY_MS=3000
```

## 11. Testing sugerido

- **Unit — `PlayerMatcher`:** casos con nombres idénticos, con acentos, con apodos ("Rodri" vs
  "Rodrigo Hernández") y con dos jugadores del mismo equipo con nombres parecidos, para validar
  el umbral de similitud.
- **Unit — `WhoScoredAdapter`:** una vez resuelto el Paso 0, testear el parser contra un fixture
  HTML guardado localmente (no pegarle a WhoScored en cada test run).
- **Integration — `PlayerStatsIngestionService`:** mockear el adapter para devolver filas
  conocidas y verificar que actualiza `PlayerSeasonStats` sin duplicar y que los no-matcheados
  van a `UnmatchedWhoscoredPlayer`.

## 12. Próximos pasos (fuera de esta spec)

1. Resolver el Paso 0 (selectores reales) y completar `WhoScoredAdapter`.
2. Matching equipo-a-equipo (Football-Data.org ↔ WhoScored) para poblar `team.whoscoredPath`.
3. Scheduler semanal que reuse `PlayerStatsIngestionService.run()` junto con
   `PlayersIngestionService.run()` de la spec anterior.
4. `QuotationService` que consuma `PlayerSeasonStats`/`PlayerMatchStats` y calcule el score/valor
   según la fórmula del documento de visión.