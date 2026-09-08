# Research: Catálogo de Jugadores

## Contexto de partida

El backend (`/back`) ya existe con NestJS 12 + MikroORM 7 (PostgreSQL). Ya hay entidades
`Player`, `Team` y `League` con una migración aplicada (`Migration20260827190315`). Ninguna
de las siguientes piezas requeridas por el spec existe todavía: `@nestjs/swagger`,
`class-validator`/`class-transformer`, caché Redis, logger estructurado, ni el módulo
`/back/src/modules/player/`. Esta investigación resuelve los puntos NEEDS CLARIFICATION
del Technical Context y las divergencias entre el spec y el esquema actual.

## Decisiones

### 1. Player.id: pasar de `number` (serial) a `uuid`
- **Decisión:** Migrar la PK de `Player` de `number` a `uuid` (`@PrimaryKey({ type: 'uuid' })`,
  default `v4()`), con una nueva migración de MikroORM.
- **Rationale:** El DoD del spec exige explícitamente que `GET /players/:id` valide formato
  UUID y devuelva 400 si no lo es. Esto no es negociable con un PK numérico.
- **Alternativas consideradas:** Mantener `id: number` y usar `ParseIntPipe` — rechazada
  porque contradice el criterio de aceptación explícito (formato UUID) del spec.
- **Alcance:** Solo `Player.id`. `Team.id` y `League.id` quedan como `serial` porque no se
  exponen en ningún endpoint público de este feature.

### 2. `team` / `league` como strings en la respuesta, no como columnas denormalizadas
- **Decisión:** Mantener las relaciones existentes (`Player.team -> Team`, `Team.league ->
  League`). El DTO de respuesta (`PlayerResponseDto`) deriva `team` y `league` como strings
  a partir de `team.name` y `team.league.name` mediante un `populate` en el repository.
- **Rationale:** El spec pide "propiedades mínimas" en la entidad expuesta al cliente, no
  necesariamente columnas físicas. Denormalizar duplicaría datos que ya existen vía relación
  y that iría en contra del esquema ya migrado.
- **Alternativas consideradas:** Agregar columnas `team: string` y `league: string` planas
  a `Player` — rechazada por duplicación de datos y por romper la normalización ya
  establecida en el schema actual.

### 3. `externalId` como campo derivado en el DTO
- **Decisión:** El DTO expone `externalId` calculado como
  `externalWhoScoredId ?? externalFootballDataId`. La entidad conserva ambas columnas.
- **Rationale:** El esquema actual ya distingue el origen del ID externo (WhoScored vs
  Football-Data), lo cual es más trazable que un único campo genérico, y es requerido por
  la capa de Adapters de la constitución (aislamiento por proveedor externo).
- **Alternativas consideradas:** Reemplazar ambas columnas por una sola `externalId` —
  rechazada porque pierde la trazabilidad de la fuente y rompe el aislamiento por adapter.

### 4. `baseValue`: nueva columna requerida
- **Decisión:** Agregar `baseValue: numeric(10,2)` (`@Property({ type: 'decimal',
  precision: 10, scale: 2 })`) a `Player`, no nullable, vía nueva migración.
- **Rationale:** No existe hoy y el spec lo requiere explícitamente como valor base previo
  a cotizaciones.
- **Alternativas consideradas:** Ninguna — es un gap directo, no hay ambigüedad.

### 5. Caché de `GET /players`: caché manual en `PlayerService` + Redis
- **Decisión original:** Interceptor (`CacheInterceptor`) aplicado sobre el handler de
  listado.
- **Revisión en implementación:** Con `CacheInterceptor`, un cache-hit corta la cadena
  *antes* de que `PlayerService.findAll` se ejecute — el service nunca corre, así que nunca
  podría loguear el evento en un hit. Eso choca directamente con el DoD #4 ("registrar la
  consulta de datos" en `PlayerService`, para toda consulta, no solo en cache-miss). Se
  cambia a **caché manual dentro de `PlayerService`**: se inyecta `CACHE_MANAGER` de
  `@nestjs/cache-manager`, se hace `cache.get(key)` primero (logueando `cacheHit: true` si
  hay resultado) y, si no hay hit, se consulta el repository, se arma la respuesta, se
  guarda con `cache.set(key, result)` y se loguea `cacheHit: false` con el conteo de
  resultados. La clave de caché se deriva de los filtros + paginación normalizados
  (`players:list:${JSON.stringify({ league, team, position, page, limit })}`). TTL tomado
  del default configurado en `CacheModule` (`PLAYERS_CACHE_TTL_SECONDS`, default 60s).
- **Rationale:** Es la única opción de las dos permitidas por la constitución
  ("Interceptor de caché o servicio de caché manual") que permite loguear el resultado de
  *cada* consulta (hit o miss) desde `PlayerService`, cumpliendo el DoD #4 sin depender de
  un side-channel (logs HTTP de acceso) para inferir el estado de caché.
- **Store Redis:** `cache-manager-ioredis-yet` (research original) está deprecado para
  `cache-manager` v6+ — el propio paquete indica migrar a Keyv. `@nestjs/cache-manager@12`
  declara como peer `cache-manager >=6` y `keyv >=5`, así que el store real es `@keyv/redis`
  (`new KeyvRedis('redis://host:port')`), pasado directo en `CacheModule.registerAsync({
  useFactory: () => ({ stores: [new KeyvRedis(...)] }) })`.
- **Infra:** Se agregó un servicio `redis` a `back/docker-compose.yml` y variables
  `REDIS_HOST` / `REDIS_PORT` / `PLAYERS_CACHE_TTL_SECONDS` a `back/.env`.

### 6. Logging estructurado + trazabilidad
- **Decisión original:** Introducir `nestjs-pino` (+ `pino-http`) como logger estructurado
  compartido, inyectado en `PlayerService`.
- **Revisión en implementación:** `nestjs-pino@4.6.1` (última versión publicada) declara
  peer `@nestjs/common` hasta `^11.0.0` — no soporta `@nestjs/common@12` (ya instalado en
  este proyecto), y no hay ninguna versión posterior que lo soporte. Instalarlo forzaría
  `--legacy-peer-deps`/`--force`, lo cual se evita. En su lugar: `pino` + `pino-http`
  directos (ambos sin peer dependency de NestJS, instalan limpio) envueltos en un
  `PinoLoggerService` propio (`back/src/shared/logging/pino-logger.service.ts`) que
  implementa la interfaz `LoggerService` de NestJS, más un middleware que asigna
  `pino-http` con un `genReqId` basado en el header `x-correlation-id` entrante (o un uuid
  nuevo si no viene), expuesto a los servicios vía un provider `REQUEST`-scoped
  (`CorrelationIdService`) para que `PlayerService` pueda incluir el correlation id en cada
  línea de log.
- **Rationale:** Mantiene el requisito de logs JSON estructurados + correlation id de la
  constitución sin forzar una resolución de dependencias incorrecta; `pino` es el motor que
  `nestjs-pino` usa internamente, así que el formato de log resultante es equivalente.
- **Alternativas consideradas:** `Logger` nativo de NestJS con formato JSON manual —
  rechazado porque no da correlación de requests out-of-the-box y obligaría a reimplementar
  ese middleware de todos modos; forzar la instalación de `nestjs-pino` con
  `--legacy-peer-deps` — rechazado por instalar una versión no probada contra Nest 12.
- **Alcance:** Se agrega como módulo compartido reutilizable (no exclusivo de `player`), ya
  que la constitución lo exige para todo el sistema, pero solo se conecta a `PlayerService`
  dentro de este feature.

### 7. Validación global de entrada
- **Decisión:** Registrar `ValidationPipe({ whitelist: true, transform: true,
  forbidNonWhitelisted: true })` globalmente en `main.ts` (no existe hoy ningún pipe
  global), y usar `class-validator` + `class-transformer` en `GetPlayersFilterDto`.
- **Rationale:** Es requisito de la constitución (validación estricta vía DTOs) y del spec
  (400 automático en paginación inválida).

### 8. Paginación
- **Decisión:** Envelope de respuesta `{ data: PlayerResponseDto[], meta: { total, page,
  limit, totalPages } }`. `page` default 1, `limit` default 20 (máx 100).
- **Rationale:** Convención estándar de REST paginado, compatible con `@ApiQuery` y fácil
  de documentar en Swagger.

## Technical Context resuelto

- **Language/Version:** TypeScript 6 (modo estricto), Node.js LTS compatible con
  `target: ES2023` (existente en `tsconfig.json`).
- **Primary Dependencies:** NestJS 12, MikroORM 7 (`@mikro-orm/postgresql`), nuevas:
  `@nestjs/swagger`, `class-validator`, `class-transformer`, `@nestjs/cache-manager`,
  `cache-manager`, `cache-manager-ioredis-yet` (o equivalente), `nestjs-pino`, `pino-http`.
- **Storage:** PostgreSQL (ya en `docker-compose.yml`, puerto 5433) + Redis (a agregar).
- **Testing:** Jest (ya configurado en `back/jest.config.ts` y `test/jest-e2e.json`).
- **Target Platform:** Servidor Node.js (API REST), directorio `/back`.
- **Project Type:** web-service (backend-only para este feature).
- **Performance Goals:** p95 < 300ms para `GET /players` en cache hit; p95 < 800ms en cache
  miss con dataset de escala real (ver Scale/Scope).
- **Constraints:** Respuestas de `GET /players` deben pasar por caché Redis; validación
  estricta de entrada; solo lectura (sin mutación) en este módulo.
- **Scale/Scope:** ~5 ligas, del orden de 2500-3000 jugadores totales (tamaño real de las 5
  ligas top), paginado en bloques de hasta 100.
