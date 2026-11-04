# Tasks: Sistema de Score y Cotización de Jugadores

**Input**: Design documents from `.specify/specs/07-cotizacion/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/quotes.openapi.yaml](./contracts/quotes.openapi.yaml), [quickstart.md](./quickstart.md)

**Tests**: SÍ se incluyen. Cada historia de la spec define un «Independent Test» con escenarios de aceptación verificables, el plan fija los archivos de test (unitarios para las utilidades puras, e2e por módulo) y la convención del proyecto (05-auth, 06-home) exige tests unitarios y de integración.

**Organization**: Las tareas se agrupan por historia de usuario para que cada una pueda implementarse y verificarse por separado.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: puede correr en paralelo — toca archivos distintos y no depende de tareas incompletas.
- **[US#]**: historia de usuario a la que pertenece. Setup, Foundational y Polish no llevan etiqueta.

## Path Conventions

Solo se toca `back/` (constitución §7): entidades en `back/src/infrastructure/database/entities/`, módulos de dominio en `back/src/modules/<dominio>/`, e2e en `back/test/`. `/front` no cambia.

Convenciones que todas las tareas deben respetar (ver código existente como referencia):

- Guards **por ruta**, nunca a nivel de clase: `ApiKeyGuard` + `@ApiSecurity(SWAGGER_API_KEY_SCHEME)` para lo administrativo, `JwtAuthGuard` + `@ApiBearerAuth(SWAGGER_BEARER_SCHEME)` para las consultas (`back/src/modules/player-stats/player-stats.controller.ts`).
- Logs con `PinoLoggerService.event(context, message, data)`; Correlation ID vía `CorrelationIdStore` (`back/src/shared/logging/correlation-id.store.ts`).
- Errores de negocio con código estable: `throw new ConflictException({ code: 'RUN_IN_PROGRESS', message: '...' })` (contrato, schema `Error`).
- Entidades con los decoradores de `@mikro-orm/decorators/legacy`, como `back/src/infrastructure/database/entities/player.entity.ts`.
- Caché con `CACHE_MANAGER` y claves versionadas, como `PlayerService.invalidateListCache()` en `back/src/modules/player/player.service.ts`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: dependencia nueva y configuración por entorno.

- [X] T001 Instalar `@nestjs/schedule` en `back/package.json` (`npm install @nestjs/schedule` dentro de `back/`). Trae `cron` como dependencia; `CronJob` se importa desde `'cron'`, como indica la documentación de `@nestjs/schedule` (research #1)
- [X] T002 [P] Agregar a `back/.env` un bloque `# --- 07-cotizacion ---` con `QUOTES_SCHEDULER_ENABLED=true`, `QUOTES_RECALC_CRON=0 3 * * 1` y `QUOTES_RECALC_TIMEZONE=` (vacío = zona del servidor); y a `back/.env.test` el mismo bloque con `QUOTES_SCHEDULER_ENABLED=false` (quickstart, Prerrequisitos)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: esquema de datos, migración con las estrategias sembradas, y el módulo `valuation-strategy` en modo lectura, que US1 necesita para resolver la estrategia activa.

**⚠️ CRITICAL**: ninguna historia puede comenzar hasta terminar esta fase.

### Entidades (data-model.md)

- [X] T003 [P] Agregar `worldReputation?: number | null` (`@Property({ type: 'smallint', nullable: true })`, comentario «0–100, nulo = sin cargar (FR-023)») a `back/src/infrastructure/database/entities/player.entity.ts`, y actualizar el comentario de `baseValue` para indicar que es el espejo del precio de la última cotización (research #10)
- [X] T004 [P] Crear `back/src/infrastructure/database/entities/valuation-strategy-version.entity.ts`: exporta `METRICS = ['goals','assists','shots','keyPasses','dribbles','tackles','rating','absence','worldReputation'] as const`, `type Metric`, `type Weights = Partial<Record<Metric, number>>`, `type StrategyPositionKey = 'GK'|'DF'|'MF'|'FW'`, `interface StrategyWeights { general: Weights; byPosition?: Partial<Record<StrategyPositionKey, Weights>> }` y la entidad `ValuationStrategyVersion` con `id` uuid, `strategy` ManyToOne, `version` int, `weights` jsonb, `baseValue`, `scaleFactor`, `minPrice` int, `defaultReputation` smallint, `createdAt`; `@Unique({ properties: ['strategy', 'version'] })`
- [X] T005 [P] Crear `back/src/infrastructure/database/entities/valuation-strategy.entity.ts` con `ValuationStrategy`: `id` uuid, `key` string único, `name`, `description` text, `active` boolean, `currentVersion` int, `createdAt`, y `OneToMany` a `ValuationStrategyVersion`
- [X] T006 [P] Crear `back/src/infrastructure/database/entities/quote-run.entity.ts` con los enums `QuoteRunTrigger { AUTOMATIC, MANUAL }` y `QuoteRunStatus { RUNNING, COMPLETED, FAILED, SKIPPED }` y la entidad `QuoteRun` con los campos de data-model.md (`strategyVersion` ManyToOne nullable, `season` nullable, `startedAt`, `finishedAt` nullable, `quotedCount`/`skippedCount` int default 0, `failureReason` text nullable, `normalizationBounds` jsonb nullable, `correlationId` string)
- [X] T007 [P] Crear `back/src/infrastructure/database/entities/player-quote.entity.ts` con el enum `PositionProfile { GENERAL, GK, DF, MF, FW }`, la interfaz exportada `BreakdownItem { metric: Metric; raw: number | null; normalized: number; weight: number; contribution: number }` y la entidad `PlayerQuote` con los campos de data-model.md (`score` decimal(5,4), `rawScore` decimal(8,4), `positiveWeightSum` decimal(6,4), `price` int, `origin` enum `QuoteRunTrigger`, `breakdown` jsonb, `usedDefaultReputation`, `missingMatchesPlayed`, `calculatedAt`)

### Migración

- [X] T008 Generar la migración con `npx mikro-orm migration:create` en `back/` (que también actualiza `back/src/infrastructure/database/migrations/.snapshot.json`) y completar a mano el archivo nuevo `back/src/infrastructure/database/migrations/Migration2026100XXXXXXX.ts` con: CHECK `world_reputation between 0 and 100`; índice único parcial `valuation_strategy_one_active` sobre `((true)) WHERE active`; índice único parcial `quote_run_one_running` sobre `((true)) WHERE status = 'RUNNING'`; índices `player_quote (player_id, calculated_at desc)` y `player_quote (run_id)`; seed de `performance` (activa, `current_version = 1`) y `prestige` (`current_version = 1`) con su versión 1 (`base_value 100`, `scale_factor 900`, `min_price 10`, `default_reputation 20`) y los pesos exactos de data-model.md «Valores sembrados» (FW sin perfil propio). El `down()` revierte todo
- [X] T009 [P] Actualizar `cleanDatabase()` en `back/test/players.e2e-spec.ts`, `back/test/player-stats.e2e-spec.ts`, `back/test/team-whoscored-matching.e2e-spec.ts` y `back/test/ingestion.e2e-spec.ts` para borrar `PlayerQuote` y luego `QuoteRun` **antes** que `Player` (la FK nueva rompería el `nativeDelete(Player, {})` actual)

### Módulo `valuation-strategy` (solo lectura)

- [X] T010 [P] Crear `back/src/modules/valuation-strategy/valuation-strategy.repository.ts` con `findActive(): Promise<{ strategy, version } | null>` y `findByKey(key): Promise<{ strategy, version } | null>`, donde `version` es la `ValuationStrategyVersion` cuyo número coincide con `strategy.currentVersion`
- [X] T011 Crear `back/src/modules/valuation-strategy/valuation-strategy.service.ts` con `getActiveVersion()` (lanza `ConflictException({ code: 'NO_ACTIVE_STRATEGY' })` si no hay activa) y `getVersionByKey(key)` (lanza `NotFoundException` si no existe)
- [X] T012 Crear `back/src/modules/valuation-strategy/valuation-strategy.controller.ts` vacío (`@ApiTags('ValuationStrategies') @Controller('valuation-strategies')`, sin rutas todavía: las agrega US4) y `back/src/modules/valuation-strategy/valuation-strategy.module.ts` (importa `AuthSharedModule`, exporta `ValuationStrategyService`)
- [X] T013 Registrar `ScheduleModule.forRoot()` y `ValuationStrategyModule` en `back/src/app.module.ts`
- [X] T014 Correr la migración de `back/src/infrastructure/database/migrations/` contra la base de desarrollo y la de test (`npx mikro-orm migration:up` en `back/`, y con `back/.env.test`) y verificar que existen las 4 tablas, la columna y las dos estrategias sembradas con `performance` activa

**Checkpoint**: esquema y estrategias listos; el resto de las suites e2e sigue en verde.

---

## Phase 3: User Story 1 - Calcular el score y la cotización de cada jugador (Priority: P1) 🎯 MVP

**Goal**: un administrador dispara el recálculo y cada jugador con estadísticas de la temporada vigente obtiene un score y un precio, con traza de estrategia y versión, de forma atómica y sin corridas concurrentes.

**Independent Test**: con jugadores con estadísticas, `POST /quotes/recalculate` devuelve una corrida `COMPLETED`; en la base, cada jugador con estadísticas tiene una `player_quote` cuyo precio sigue al score, el mejor delantero cotiza por encima del peor, el que menos jugó puntúa menos y `player.base_value` refleja el precio. No requiere consultas, historial, scheduler ni prestigio.

### Tests for User Story 1 ⚠️

> Escribirlos primero y verificar que fallan antes de implementar.

- [X] T015 [P] [US1] Crear `back/src/modules/quotes/score-calculator.spec.ts` (Jest, sin Nest ni base) que cubra: el ejemplo de la spec (valores normalizados del delantero con los pesos generales de performance → `score 0.693`, `price 724`); percentiles p5/p95 por interpolación lineal; métrica sin variación (`p95 = p5`) → normalizado 0 para todos; valor extremo recortado a 1 sin aplastar al resto; re-escalado por `S⁺` cuando los positivos no suman 1 (FR-007); suma de `breakdown[].contribution` = `rawScore` (±0,0001); `rawScore` negativo → `score 0` y `price = baseValue`; piso de `minPrice`; ausencia contra el máximo de partidos de su liga; `matchesPlayed` nulo → `absence 0`, métricas por partido en 0 y `missingMatchesPlayed true`; reputación nula → `defaultReputation` y `usedDefaultReputation true`; selección de perfil (DF usa su perfil; FW y UNKNOWN usan el general); mismo score ⇒ mismo precio (FR-002a)
- [X] T016 [US1] Crear `back/test/quotes.e2e-spec.ts` con el mismo arranque que `back/test/players.e2e-spec.ts` (AppModule, `ValidationPipe` igual a `main.ts`, `cleanDatabase()` que borra `PlayerQuote`, `QuoteRun`, `PlayerSeasonStats`, `Player`, `Team`, `League`, `User` y además restaura `performance` como activa), un seed con dos ligas, jugadores FW/MF/DF/GK con estadísticas de la temporada `2025-2026` y uno sin estadísticas, y un `describe('US1')` con: US1-1 (`200`, `COMPLETED`, `MANUAL`, `quotedCount`/`skippedCount` correctos, una `player_quote` por jugador con estadísticas y `base_value` igual a su `price`), US1-2 (mejor delantero → score y precio estrictamente mayores), US1-3 (el que menos jugó puntúa menos), US1-5 (con `jest.spyOn` sobre `QuotesRepository.persistBatch` lanzando error: respuesta `500`, corrida `FAILED` con motivo, 0 filas nuevas en `player_quote`), US1-6 (sin `x-api-key` o con JWT → `401`), US1-7 (sin estrategia activa vía `em.nativeUpdate` → `409 NO_ACTIVE_STRATEGY`), US1-8 (jugador con todo en cero y ausencia máxima → `score 0`, `price 100`), `strategyKey: 'prestige'` → la corrida registra `prestige` v1, `strategyKey` inexistente → `404`, y concurrencia (dos POST en paralelo → un `200` y un `409 RUN_IN_PROGRESS`, más una fila `SKIPPED`)

### Implementation for User Story 1

- [X] T017 [P] [US1] Crear la utilidad pura `back/src/modules/quotes/score-calculator.ts` (sin decoradores, sin DI, sin base; solo imports de tipos de las entidades): `percentile(values, p)`, `computeBounds(rows): Record<Metric, { p5, p95 }>`, `computeLeagueMaxMatches(rows)`, y `calculateQuotes(rows, version): CalculatedQuote[]`, que aplica research #4–#7 y devuelve por jugador `{ playerId, score, rawScore, price, positionProfile, positiveWeightSum, breakdown, usedDefaultReputation, missingMatchesPlayed }`. Los datos entran como números (convertir los `decimal` string de las estadísticas antes de llamarla)
- [X] T018 [P] [US1] Crear `back/src/modules/quotes/dto/recalculate-request.dto.ts` con `strategyKey?: string` (`@IsOptional() @IsString() @Matches(/^[a-z][a-z0-9-]{2,39}$/)`, `@ApiPropertyOptional`)
- [X] T019 [P] [US1] Crear `back/src/modules/quotes/dto/quote-run-response.dto.ts` con los campos del schema `QuoteRun` del contrato y un `static fromEntity(run: QuoteRun)`
- [X] T020 [US1] Crear `back/src/modules/quotes/quotes.repository.ts` con: `findCurrentSeason()` (máximo de `player_season_stats.season`, mismo criterio que `PlayerRepository`); `countCatalogPlayers()`; `tryStartRun(trigger, correlationId): Promise<QuoteRun | null>` (inserta `RUNNING`; devuelve `null` si el índice `quote_run_one_running` rechaza la fila, detectando `UniqueConstraintViolationException`); `insertSkippedRun(trigger, correlationId)`; `loadSeasonBatch(season)` (**una** consulta SQL que trae estadísticas, `position`, id de liga vía equipo y `world_reputation` de cada jugador con estadísticas de esa temporada); `persistBatch(run, version, season, quotes, bounds, skippedCount)` (en `em.transactional`: `insertMany` de `PlayerQuote` con un `calculatedAt` común, `UPDATE player SET base_value = q.price FROM player_quote q WHERE q.player_id = player.id AND q.run_id = ?`, y cierre de la corrida en `COMPLETED` con contadores, `season`, `strategyVersion` y `normalizationBounds`); `markRunFailed(runId, reason)` (escritura aparte, fuera de la transacción) (research #2, #3)
- [X] T021 [US1] Crear `back/src/modules/quotes/quotes.service.ts` con `runRecalculation(trigger, strategyKey?)`: resuelve la versión (`ValuationStrategyService.getVersionByKey` o `getActiveVersion`); resuelve la temporada (`409 NO_SEASON_DATA` si no hay); toma el lock con `tryStartRun` (si devuelve `null`: `insertSkippedRun` y `409 RUN_IN_PROGRESS`); carga el lote, llama a `calculateQuotes`, persiste con `persistBatch` e invalida la caché del listado con `PlayerService.invalidateListCache()`; ante cualquier error, `markRunFailed` y relanza (→ `500`). Usa el Correlation ID de `CorrelationIdStore.getId()` y emite los eventos `quote run started`, `quote run completed` (cotizados, omitidos, duración) y `quote run failed` (FR-035)
- [X] T022 [US1] Crear `back/src/modules/quotes/quotes.controller.ts` (`@ApiTags('Quotes') @Controller('quotes')`) con `POST /quotes/recalculate`: `@UseGuards(ApiKeyGuard)`, `@HttpCode(200)`, body `RecalculateRequestDto`, respuestas 200/400/401/404/409/500 documentadas según el contrato; devuelve `QuoteRunResponseDto`
- [X] T023 [US1] Crear `back/src/modules/quotes/quotes.module.ts` (importa `AuthSharedModule`, `ValuationStrategyModule` y `PlayerModule`) y registrarlo en `back/src/app.module.ts`
- [X] T024 [US1] Correr `npm test -- score-calculator` y `npm run test:e2e -- quotes` en `back/` y dejar en verde T015 y T016

**Checkpoint**: MVP. El sistema calcula scores y precios reales y la home ya muestra el precio vía `base_value`.

---

## Phase 4: User Story 2 - Consultar el score, la cotización y su historial (Priority: P2)

**Goal**: una persona con sesión consulta la cotización actual (con score, desglose y variación) y el historial paginado de un jugador.

**Independent Test**: recalcular tres veces y verificar que la cotización actual coincide con la última del historial, que el desglose suma el score, que el historial tiene 3 registros en orden cronológico y que la consulta refleja un recálculo nuevo de inmediato.

### Tests for User Story 2 ⚠️

- [X] T025 [US2] Agregar a `back/test/quotes.e2e-spec.ts` un `describe('US2')` (con JWT obtenido vía `/auth/register` + `/auth/login`, como `players.e2e-spec.ts`) que cubra: US1-4 (jugador sin cotizar → `200 { quoted: false, quote: null }`); US2-1 (precio, score, fecha, estrategia y versión; `previousPrice`/`changePct` en `null` tras la primera corrida y con valor tras la segunda); US2-2 (suma de `breakdown[].contribution` = `rawScore` ±0,0001); US2-3 (tras 3 corridas, `meta.total = 3` en orden ascendente, el último igual a la cotización actual); US2-4 (`from`/`to` y `page`/`limit` acotan el tramo); US2-5 (uuid inexistente → `404`); US2-6 (fecha mal formada, `from > to`, `limit=500` → `400`); US2-7 (sin JWT → `401`); US2-8 (consultar la cotización actual, recalcular y volver a consultar: devuelve la nueva sin esperar el TTL)

### Implementation for User Story 2

- [X] T026 [P] [US2] Crear `back/src/modules/quotes/dto/current-quote-response.dto.ts` (schemas `CurrentQuote`, `Quote` y `BreakdownItem` del contrato, con `static fromQuotes(playerId, latest, previous)` que calcula `previousPrice` y `changePct` con un decimal)
- [X] T027 [P] [US2] Crear `back/src/modules/quotes/dto/quote-history-query.dto.ts` (`from`/`to` `@IsOptional() @IsISO8601()`, `page` `@Min(1)` por defecto 1, `limit` `@Min(1) @Max(200)` por defecto 50, con `@Type(() => Number)`) y `back/src/modules/quotes/dto/quote-history-response.dto.ts` (schemas `QuoteHistoryPage` y `PageMeta`)
- [X] T028 [US2] Agregar a `back/src/modules/quotes/quotes.repository.ts`: `playerExists(id)`, `findLatestTwo(playerId)` (usa el índice `(player_id, calculated_at desc)` y popula `strategyVersion.strategy`) y `findHistory(playerId, { from, to, page, limit })` (orden ascendente por `calculated_at`, devuelve `[rows, total]`)
- [X] T029 [US2] Agregar a `back/src/modules/quotes/quotes.service.ts`: `getCurrent(playerId)` con caché en `quotes:current:v{N}:{playerId}` (`N` = valor de `quotes:version`, por defecto 0), donde un fallo de Redis cae a la base sin romper la consulta; `getHistory(playerId, query)` (`400` si `from > to`, `404` si el jugador no existe); y en `runRecalculation`, incrementar `quotes:version` (TTL 0) **después** de que `persistBatch` confirma (research #11, FR-021)
- [X] T030 [US2] Agregar a `back/src/modules/quotes/quotes.controller.ts` `GET /quotes/players/:playerId/current` y `GET /quotes/players/:playerId/history` con `@UseGuards(JwtAuthGuard)`, `ParseUUIDPipe` y documentación Swagger según el contrato
- [X] T031 [US2] Correr `npm run test:e2e -- quotes` en `back/` y dejar en verde T025 sin romper T016

**Checkpoint**: US1 y US2 funcionan juntas; la cotización es consultable y explicable.

---

## Phase 5: User Story 3 - Valuar por calidad general con la «reputación mundial» (Priority: P3)

**Goal**: el administrador carga la reputación mundial, individual o en lote, y la estrategia de prestigio ordena a las figuras por encima de jugadores con mejores números.

**Independent Test**: cargar reputación 95 a un jugador de rating 7,1 y 40 a otro de rating 7,6, recalcular con `prestige` (el primero cotiza más) y con `performance` (se invierte el orden).

### Tests for User Story 3 ⚠️

- [X] T032 [US3] Agregar a `back/test/quotes.e2e-spec.ts` un `describe('US3')` que cubra: US3-1 y US3-2 (los dos jugadores de la Independent Test, mismo equipo y posición, recalculando con `strategyKey: 'prestige'` y con `'performance'`; SC-004); US3-3 (jugador sin reputación → `usedDefaultReputation: true` en su cotización con prestigio); US3-4 (`worldReputation: 150`, `-1`, `"alta"` → `400`); US3-5 (lote con un id existente y uno inexistente → `updated` y `notFound` correctos; un ítem con formato inválido → `400` y nadie actualizado); US3-6 (cambiar la reputación no altera la cotización actual hasta el próximo recálculo); US3-7 (sin `x-api-key` → `401`); `PUT /quotes/reputation/<uuid inexistente>` → `404`; `worldReputation: null` borra el valor

### Implementation for User Story 3

- [X] T033 [P] [US3] Crear `back/src/modules/quotes/dto/set-reputation.dto.ts` (`worldReputation: number | null`, con `@ValidateIf((o) => o.worldReputation !== null) @IsInt() @Min(0) @Max(100)`)
- [X] T034 [P] [US3] Crear `back/src/modules/quotes/dto/bulk-reputation.dto.ts` (`items` con `@ValidateNested({ each: true }) @Type(() => ReputationItemDto) @ArrayMinSize(1) @ArrayMaxSize(1000)`; `ReputationItemDto` con `playerId` `@IsUUID()` y `worldReputation` validado como en T033) y `back/src/modules/quotes/dto/bulk-reputation-result.dto.ts` (`updated: string[]`, `notFound: string[]`)
- [X] T035 [US3] Agregar a `back/src/modules/quotes/quotes.repository.ts` `setReputation(playerId, value): Promise<boolean>` (devuelve si existía) y `setReputationBulk(items): Promise<string[]>` (un solo `UPDATE player SET world_reputation = v.value FROM (VALUES ...) v(id, value) WHERE player.id = v.id RETURNING player.id`, que devuelve los ids actualizados)
- [X] T036 [US3] Agregar a `back/src/modules/quotes/quotes.service.ts` `setReputation(playerId, dto)` (`404` si no existe) y `setReputationBulk(dto)` (`notFound` = ids pedidos − ids actualizados), con el evento de log `world reputation updated` (cantidad, sin valores por jugador). No invalidan ninguna caché de cotización (FR-026)
- [X] T037 [US3] Agregar a `back/src/modules/quotes/quotes.controller.ts` `PUT /quotes/reputation/:playerId` y `PUT /quotes/reputation` con `@UseGuards(ApiKeyGuard)`. Declarar la ruta de lote antes de la parametrizada y documentar ambas según el contrato
- [X] T038 [US3] Correr `npm run test:e2e -- quotes` en `back/` y dejar en verde T032

**Checkpoint**: las dos estrategias son distinguibles con datos reales de reputación.

---

## Phase 6: User Story 4 - Configurar y seleccionar estrategias de valuación (Priority: P4)

**Goal**: el administrador lista estrategias, crea versiones nuevas e inmutables con pesos generales y por posición, y elige cuál queda activa.

**Independent Test**: listar estrategias, crear una v2 de `performance` con otros pesos, activarla, recalcular y verificar que las cotizaciones nuevas citan v2 mientras las anteriores conservan v1.

### Tests for User Story 4 ⚠️

- [X] T039 [P] [US4] Crear `back/src/modules/valuation-strategy/strategy-config.rules.spec.ts` (Jest, sin Nest) que cubra: configuración sembrada válida; métrica desconocida; posición desconocida; perfil general sin ningún peso positivo; perfil por posición sin positivos; peso con más de 4 decimales; `scaleFactor <= 0`, `minPrice < 1` y `defaultReputation` fuera de 0–100 rechazados con un motivo por regla
- [X] T040 [P] [US4] Crear `back/test/valuation-strategies.e2e-spec.ts` (mismo arranque que T016; restaura el seed de estrategias en `afterAll` borrando las versiones > 1 y reactivando `performance`) que cubra: US4-1 (lista con `performance` y `prestige`, versión vigente, pesos y activa); US4-2 (POST versión → `201` con `version: 2` y la v1 intacta en `GET /:key/versions`); US4-3 (una cotización calculada con v1 sigue citando v1 tras crear la v2); US4-4 (métrica `cards`, peso `1.5`, sin positivos, `scaleFactor: 0` → `400` sin versión nueva); US4-5 (activar `prestige` desactiva `performance`; nunca dos activas); US4-6 (activar no cambia cotizaciones vigentes); US4-7 (perfil DF propio aplicado a defensores y general a FW, verificado por `positionProfile`); US4-8 (sin `x-api-key` → `401`; GET sin JWT → `401`); key inexistente → `404`

### Implementation for User Story 4

- [X] T041 [P] [US4] Crear la utilidad pura `back/src/modules/valuation-strategy/strategy-config.rules.ts` con `validateStrategyConfig(config): string[]` (lista de motivos; vacía = válida), con las reglas de data-model.md «Reglas de validación» que `class-validator` no expresa: al menos un positivo por perfil, claves de métricas y posiciones conocidas, máximo 4 decimales
- [X] T042 [P] [US4] Crear `back/src/modules/valuation-strategy/dto/strategy-config.dto.ts` (`WeightsDto` con una propiedad opcional `@IsNumber() @Min(-1) @Max(1)` por métrica de `METRICS`; `ByPositionDto` con `GK`/`DF`/`MF`/`FW` opcionales anidados; `StrategyConfigDto` con `weights.general` obligatorio, `byPosition` opcional y los enteros `baseValue` ≥ 0, `scaleFactor` ≥ 1, `minPrice` ≥ 1, `defaultReputation` 0–100) y `back/src/modules/valuation-strategy/dto/strategy-response.dto.ts` (schemas `Strategy` y `StrategyVersion`, con `fromEntity`)
- [X] T043 [US4] Agregar a `back/src/modules/valuation-strategy/valuation-strategy.repository.ts`: `findAllWithCurrentVersion()`, `findVersions(key)` (de la más nueva a la más vieja), `createVersion(key, config)` (en `em.transactional`: bloquea la estrategia con `LockMode.PESSIMISTIC_WRITE`, inserta la versión `currentVersion + 1` y actualiza `currentVersion`) y `activate(key)` (en una transacción: desactiva la activa y activa la elegida)
- [X] T044 [US4] Agregar a `back/src/modules/valuation-strategy/valuation-strategy.service.ts` `list()`, `listVersions(key)`, `createVersion(key, dto)` (corre `validateStrategyConfig`; si hay motivos → `BadRequestException` con la lista, sin crear nada) y `activate(key)`; `404` para key inexistente; eventos de log `strategy version created` y `strategy activated`
- [X] T045 [US4] Agregar a `back/src/modules/valuation-strategy/valuation-strategy.controller.ts` `GET /valuation-strategies` y `GET /valuation-strategies/:key/versions` (`JwtAuthGuard`), `POST /valuation-strategies/:key/versions` (`ApiKeyGuard`, `201`) y `POST /valuation-strategies/:key/activate` (`ApiKeyGuard`, `@HttpCode(200)`), documentados según el contrato
- [X] T046 [US4] Correr `npm test -- strategy-config` y `npm run test:e2e -- valuation-strategies` en `back/` y dejar en verde T039 y T040

**Checkpoint**: las estrategias son configurables sin tocar código (SC-009).

---

## Phase 7: User Story 5 - Recálculo automático semanal (Priority: P5)

**Goal**: el sistema recalcula solo una vez por semana con la estrategia activa, deja registro consultable de cada corrida y se recupera de corridas interrumpidas sin ejecutar las atrasadas.

**Independent Test**: con `QUOTES_RECALC_CRON` en un intervalo corto, la corrida dispara sola y deja un lote `AUTOMATIC` con su registro en `GET /quotes/runs`.

### Tests for User Story 5 ⚠️

- [X] T047 [US5] Agregar a `back/test/quotes.e2e-spec.ts` un `describe('US5')` que cubra: con `QUOTES_SCHEDULER_ENABLED=false` no hay ningún job `quotes-weekly-recalculation` en `SchedulerRegistry`; `QuotesService.runScheduled()` genera una corrida `AUTOMATIC` cuyas cotizaciones tienen `origin: 'AUTOMATIC'` y un `correlationId` no vacío (US5-1, US5-5); `runScheduled()` con una fila `RUNNING` existente no lanza, no duplica cotizaciones y deja una fila `SKIPPED` (US5-2); `runScheduled()` con el repositorio forzado a fallar deja la corrida `FAILED` sin propagar el error (US5-4); `recoverInterruptedRuns()` pasa una fila `RUNNING` huérfana a `FAILED` con `interrupted` (US5-3); `GET /quotes/runs` con `x-api-key` devuelve las corridas de la más reciente a la más vieja con `meta`, y sin clave → `401`

### Implementation for User Story 5

- [X] T048 [P] [US5] Crear `back/src/modules/quotes/dto/list-runs-query.dto.ts` (`page` ≥ 1 por defecto 1, `limit` 1–100 por defecto 20) y agregar a `back/src/modules/quotes/dto/quote-run-response.dto.ts` el DTO de página `QuoteRunsPageDto` (`data` + `meta` con el schema `PageMeta`)
- [X] T049 [US5] Agregar a `back/src/modules/quotes/quotes.repository.ts` `findRuns(page, limit)` (orden `started_at desc`, devuelve `[rows, total]`) y `failInterruptedRuns(): Promise<number>` (`UPDATE quote_run SET status = 'FAILED', failure_reason = 'interrupted', finished_at = now() WHERE status = 'RUNNING'`)
- [X] T050 [US5] Agregar a `back/src/modules/quotes/quotes.service.ts`: `onApplicationBootstrap()` → `recoverInterruptedRuns()` (llama a `failInterruptedRuns` y loguea cuántas cerró); `onModuleInit()` → si `QUOTES_SCHEDULER_ENABLED !== 'false'`, crea un `CronJob` desde `'cron'` con `QUOTES_RECALC_CRON` (por defecto `0 3 * * 1`) y `QUOTES_RECALC_TIMEZONE` (si está vacía, zona del servidor), lo registra como `quotes-weekly-recalculation` en `SchedulerRegistry` y lo arranca, logueando la expresión efectiva; `runScheduled()` → genera un `randomUUID()`, ejecuta `runRecalculation(AUTOMATIC)` dentro de `CorrelationIdStore.run(id, ...)` y captura todo error (incluido `RUN_IN_PROGRESS`), logueándolo sin propagarlo para no tirar el proceso; `listRuns(query)` (research #1, #2)
- [X] T051 [US5] Agregar a `back/src/modules/quotes/quotes.controller.ts` `GET /quotes/runs` con `@UseGuards(ApiKeyGuard)` y la query `ListRunsQueryDto`, documentado según el contrato
- [X] T052 [US5] Correr `npm run test:e2e -- quotes` en `back/` y dejar en verde T047 junto con las suites de US1–US3

**Checkpoint**: todas las historias funcionan de forma independiente.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: coherencia final, documentación y verificación de punta a punta.

- [X] T053 [P] Actualizar el comentario de cabecera de `back/src/modules/player/market-value.mock.ts` y la descripción de `marketValue` en `back/src/modules/player/dto/player-response.dto.ts`: el valor actual ahora es el precio de la última cotización (espejo `base_value`, 07-cotizacion research #10) y solo la variación y la serie siguen siendo maqueta
- [X] T054 [P] Revisar en Swagger (`/api`) que los 9 endpoints coinciden con `.specify/specs/07-cotizacion/contracts/quotes.openapi.yaml` en ruta, método, esquema de seguridad, códigos de respuesta y forma de los cuerpos; corregir cualquier diferencia en los controllers o DTOs
- [X] T055 Medir SC-001: sembrar 5.000 jugadores con estadísticas en la base de desarrollo (script descartable, no versionado), ejecutar `POST /quotes/recalculate` y registrar la duración del evento `quote run completed` en `.specify/specs/07-cotizacion/quickstart.md` (objetivo < 2 min)
- [X] T056 Correr la suite completa en `back/` (`npm run lint`, `npm test`, `npm run test:e2e`) y dejar todo en verde, incluidas las 4 suites e2e preexistentes modificadas en T009
- [X] T057 Ejecutar los escenarios Q1–Q11 de `.specify/specs/07-cotizacion/quickstart.md` contra la base de desarrollo y anotar cualquier desvío

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sin dependencias.
- **Foundational (Phase 2)**: depende de Setup (T013 necesita T001). Bloquea todas las historias.
- **US1 (Phase 3)**: depende de Foundational. Es la base de cálculo de todas las demás.
- **US2 (Phase 4)**: depende de US1 (necesita cotizaciones para consultar y modifica `runRecalculation`).
- **US3 (Phase 5)**: depende de US1 (recálculo con `strategyKey`). Es independiente de US2 y US4.
- **US4 (Phase 6)**: depende de Foundational; sus tests US4-3, US4-6 y US4-7 usan el recálculo de US1. Puede hacerse en paralelo con US2/US3 porque toca otro módulo.
- **US5 (Phase 7)**: depende de US1 (envuelve `runRecalculation`).
- **Polish (Phase 8)**: depende de todas las historias.

### Dentro de cada historia

- Tests primero; deben fallar antes de implementar.
- DTOs y utilidades puras → repository → service → controller → corrida de tests.

### Conflictos de archivo a tener en cuenta

- `back/test/quotes.e2e-spec.ts` lo tocan T016, T025, T032 y T047: secuenciales.
- `back/src/modules/quotes/quotes.repository.ts`, `quotes.service.ts` y `quotes.controller.ts` crecen en US1, US2, US3 y US5: dentro de cada archivo, en orden de fase.
- `back/src/app.module.ts` lo tocan T013 y T023: secuenciales.
- `valuation-strategy/*` (US4) no comparte archivos con `quotes/*`: US4 puede ir en paralelo con US2, US3 y US5.

### Parallel Opportunities

- Setup: T002 en paralelo con T001.
- Foundational: T003–T007 (cinco entidades, archivos distintos) en paralelo; T009 y T010 en paralelo entre sí una vez creadas las entidades.
- US1: T015, T017, T018 y T019 en paralelo.
- US2: T026 y T027 en paralelo.
- US3: T033 y T034 en paralelo.
- US4: T039, T040, T041 y T042 en paralelo.
- Entre historias: US4 completa en paralelo con US2 → US3 → US5.

---

## Parallel Example: User Story 1

```bash
# Test unitario, utilidad pura y DTOs de US1 a la vez (archivos distintos, sin dependencias):
Task: "T015 Crear back/src/modules/quotes/score-calculator.spec.ts"
Task: "T017 Crear back/src/modules/quotes/score-calculator.ts"
Task: "T018 Crear back/src/modules/quotes/dto/recalculate-request.dto.ts"
Task: "T019 Crear back/src/modules/quotes/dto/quote-run-response.dto.ts"
```

## Parallel Example: Foundational

```bash
Task: "T003 player.entity.ts + worldReputation"
Task: "T004 valuation-strategy-version.entity.ts"
Task: "T005 valuation-strategy.entity.ts"
Task: "T006 quote-run.entity.ts"
Task: "T007 player-quote.entity.ts"
```

---

## Implementation Strategy

### MVP (solo User Story 1)

1. Phase 1 (Setup) + Phase 2 (Foundational).
2. Phase 3 (US1): recálculo manual atómico con la estrategia activa.
3. **Parar y validar**: T024 en verde y quickstart Q2 + Q4. La home ya muestra precios reales.

### Entrega incremental

1. Setup + Foundational → esquema y estrategias sembradas.
2. US1 → precios reales (MVP).
3. US2 → cotización consultable y explicable, con historial.
4. US3 → reputación y estrategia de prestigio con datos reales.
5. US4 → estrategias editables y activables sin tocar código.
6. US5 → corrida semanal desatendida.

### Reparto del trabajo

- Persona A: US1 → US2 → US3 → US5 (módulo `quotes`).
- Persona B: después de Foundational, US4 completa (módulo `valuation-strategy`).

---

## Notes

- [P] = archivos distintos, sin dependencias pendientes.
- Las cotizaciones y las versiones de estrategia son **solo INSERT**: ninguna tarea puede agregar un `UPDATE` o `DELETE` sobre `player_quote` ni sobre `valuation_strategy_version` (FR-011, FR-017). Los únicos `DELETE` están en los `cleanDatabase()` de los tests.
- Commit después de cada tarea o grupo lógico; validar en cada checkpoint.
