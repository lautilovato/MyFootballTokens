# Tasks: Créditos, Sobres e Inventario

**Input**: Design documents from `.specify/specs/08-sobres/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/packs.openapi.yaml](./contracts/packs.openapi.yaml), [quickstart.md](./quickstart.md)

**Tests**: SÍ se incluyen. Cada historia de la spec define un «Independent Test» con escenarios verificables, el plan fija los archivos de test (unitarios para las utilidades puras, e2e por módulo en `/back`, Vitest en `/front`) y es la convención del proyecto (05 a 07).

**Organization**: las tareas se agrupan por historia de usuario para que cada una se implemente y verifique por separado. Las historias siguen el orden de la spec (revisión 4): US1 y US2 (P1), US3 a US6 (P2), US7 (P3).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: puede correr en paralelo: toca archivos distintos y no depende de tareas incompletas.
- **[US#]**: historia de usuario a la que pertenece. Setup, Foundational y Polish no llevan etiqueta.

## Path Conventions

Backend en `back/` y cliente en `front/`, con la estructura de §7 de la constitución v4.0.0:
entidades en `back/src/infrastructure/database/entities/`, módulos de dominio en
`back/src/modules/<dominio>/`, e2e en `back/test/`, y en el cliente `pages/`, `components/`,
`services/` y `app/`.

Convenciones que todas las tareas deben respetar (ver el código existente):

- Guards **por ruta**: `JwtAuthGuard` + `@ApiBearerAuth(SWAGGER_BEARER_SCHEME)` para las rutas de usuario y `ApiKeyGuard` + `@ApiSecurity(SWAGGER_API_KEY_SCHEME)` para las administrativas (`back/src/modules/quotes/quotes.controller.ts`). El usuario sale de `@CurrentUser()` (`back/src/shared/auth/current-user.decorator.ts`), nunca del body ni de la query.
- Los controladores nuevos (`credits`, `tokens`, `packs`) llevan `@UseFilters(ApiErrorFilter)` a nivel de clase (research #10). Las excepciones de dominio se lanzan como `new ConflictException({ code: 'PACK_SOLD_OUT', message: '…' })`, `NotFoundException({ code, message })`, etc.
- Logs con `PinoLoggerService.event(context, message, data)`. El Correlation ID sale de `CorrelationIdStore.getId()`; en procesos sin petición se genera uno con `randomUUID()` y se corre dentro de `CorrelationIdStore.run(...)` (`back/src/modules/quotes/quotes.service.ts`, `runScheduled`).
- Transacciones con `this.em.fork().transactional(async (tx) => …)`, como `QuotesRepository.persistBatch`.
- Entidades con los decoradores de `@mikro-orm/decorators/legacy`, como `back/src/infrastructure/database/entities/player.entity.ts`. Los enums se guardan como `text` con `CHECK` en la migración.
- Caché con `CACHE_MANAGER` y claves versionadas, tolerando que Redis falle (`QuotesService.cacheGet/cacheSet`).
- En el cliente, toda la red pasa por `httpClient` (`front/src/services/http-client.ts`); los tests de componentes usan `createRoot` + `act` y stubean `matchMedia` (`front/src/components/__tests__/player-grid.test.tsx`).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: dependencias y configuración por entorno.

- [X] T001 Agregar `gsap` y `@gsap/react` a `dependencies` de `front/package.json` con `npm install gsap @gsap/react` dentro de `front/`, y verificar que `npm run build` compila `front/src/components/pack/Pack.tsx` y `front/src/components/confirm-modal/ConfirmModal.tsx` (research #16)
- [X] T002 [P] Agregar a `back/.env` un bloque `# --- 08-sobres ---` con `INITIAL_CREDITS=2000`, `PACKS_SCHEDULER_ENABLED=true` y `PACKS_STOCK_CRON=*/15 * * * *` (sin `PACK_TYPES_CONFIG`: rigen los valores por defecto), y a `back/.env.test` el mismo bloque con `PACKS_SCHEDULER_ENABLED=false` (quickstart, Prerrequisitos)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: esquema completo, utilidades compartidas, esqueleto de los tres módulos y el cambio de OVR, que define la rareza que usan los sobres.

**⚠️ CRITICAL**: ninguna historia puede comenzar hasta terminar esta fase.

### Entidades (data-model.md)

- [X] T003 [P] Agregar `credits!: number` (`@Property({ type: 'integer', default: 0 })`, comentario «saldo entero no negativo; solo lo cambian los movimientos de credits y packs (FR-004)») a `back/src/infrastructure/database/entities/user.entity.ts`
- [X] T004 [P] Crear `back/src/infrastructure/database/entities/credit-movement.entity.ts` con el enum `CreditMovementType { INITIAL_GRANT = 'entrega_inicial', PACK_PURCHASE = 'compra_sobre' }` y la entidad `CreditMovement` con los campos de data-model.md (`user` ManyToOne, `type`, `amount`, `balanceBefore`, `balanceAfter`, `referenceType` nullable, `referenceId` uuid nullable, `correlationId`, `createdAt`)
- [X] T005 [P] Crear `back/src/infrastructure/database/entities/token.entity.ts` con el enum `TokenStatus { RESERVED = 'reservado', IN_PACK = 'en_sobre', OWNED = 'de_usuario', PLATFORM_SALE = 'en_venta_plataforma' }` y la entidad `Token` (`player` ManyToOne, `serial` smallint, `status`, `owner` ManyToOne `User` nullable, `pack` ManyToOne `Pack` nullable, `createdAt`, `updatedAt`), con `@Unique({ properties: ['player', 'serial'] })`
- [X] T006 [P] Crear `back/src/infrastructure/database/entities/token-event.entity.ts` con el enum `TokenEventType { EMISSION = 'emision', PACK_ASSIGNMENT = 'asignacion_a_sobre', PACK_DELIVERY = 'entrega_en_sobre', RETURN_TO_PLATFORM = 'devolucion_a_plataforma', PUT_ON_SALE = 'puesta_en_venta' }` y la entidad `TokenEvent` con los campos de data-model.md (`token`, `type`, `fromStatus` nullable, `toStatus`, `fromOwnerId`/`toOwnerId` uuid nullable, `quotePrice` int nullable, `rarity` nullable, `referenceType`/`referenceId` nullable, `correlationId`, `createdAt`)
- [X] T007 [P] Crear `back/src/infrastructure/database/entities/pack-batch.entity.ts` (`PackBatch`: `id`, `number` autoincremental, `tokenCount`, `params` jsonb, `composition` jsonb, `correlationId`, `createdAt`) y `back/src/infrastructure/database/entities/pack.entity.ts` con los enums `PackType { COMMON = 'common', RARE = 'rare', EPIC = 'epic', LEGENDARY = 'legendary' }` y `PackStatus { SEALED = 'sin_abrir', OPENED = 'abierto' }` y la entidad `Pack` (`batch`, `type`, `cardCount` smallint, `status`, `openedAt` nullable, `createdAt`)
- [X] T008 [P] Crear `back/src/infrastructure/database/entities/pack-opening.entity.ts` (`PackOpening`: `user`, `pack` OneToOne único, `packType`, `price`, `cardCount`, `balanceBefore`, `balanceAfter`, `params` jsonb, `creditMovement` ManyToOne, `correlationId`, `createdAt`) y `back/src/infrastructure/database/entities/pack-opening-card.entity.ts` (`PackOpeningCard`: `opening`, `token`, `player`, `serial`, `rarity`, `quotePrice`), según data-model.md

### Migración

- [X] T009 Generar la migración con `npx mikro-orm migration:create` en `back/` (actualiza `back/src/infrastructure/database/migrations/.snapshot.json`), quitar las líneas que el generador propone para los índices funcionales de `Migration20260920203500` (como hizo `Migration20261013144800`) y completar a mano el archivo nuevo `back/src/infrastructure/database/migrations/Migration2026101XXXXXXX.ts` con:
  - los `CHECK` de data-model.md: `user.credits >= 0`; enums de `type` y `status`; `token.serial between 1 and 100`; `(status = 'de_usuario') = (owner_id is not null)`; `balance_after = balance_before + amount` en `credit_movement`; `balance_after = balance_before - price` en `pack_opening`; `opened_at` presente si y solo si `status = 'abierto'`;
  - el índice único parcial `credit_movement_user_initial_unique` sobre `(user_id) where type = 'entrega_inicial'`;
  - los índices `credit_movement (user_id, created_at)`, `token (owner_id, player_id) where status = 'de_usuario'`, `token (pack_id)`, `token (player_id) where status = 'reservado'`, `token_event (token_id, created_at)`, `pack (type, id) where status = 'sin_abrir'`, `pack_opening (user_id, created_at desc)` y `player (world_reputation)`;
  - la función `forbid_mutation()` (`raise exception '% es inmutable', TG_TABLE_NAME`) y triggers `before update or delete for each row` en `credit_movement`, `token_event`, `pack_opening` y `pack_opening_card` (research #4).

  El `down()` revierte todo. Aplicarla con `npm run migration:up` y también contra la base de test (`.env.test`)
- [X] T010 Crear `back/test/support/clean-database.ts` con `cleanPacksData(em)`, que hace `truncate table pack_opening_card, pack_opening, credit_movement, token_event, token, pack, pack_batch cascade`. `TRUNCATE` no dispara los triggers de fila de T009. Llamarla primero en `cleanDatabase()` de `back/test/players.e2e-spec.ts`, `back/test/quotes.e2e-spec.ts`, `back/test/player-stats.e2e-spec.ts`, `back/test/team-whoscored-matching.e2e-spec.ts` y `back/test/ingestion.e2e-spec.ts`, para que las FK nuevas hacia `player` y `user` no rompan sus `nativeDelete`

### Utilidades compartidas

- [X] T011 [P] Crear `back/src/shared/http/api-error.filter.ts`: `ApiErrorFilter` (`@Catch()`), que responde `{ code, message, correlationId }` (más `details` en validación) y traduce `UnauthorizedException` a 401 `UNAUTHENTICATED`, el `BadRequestException` del `ValidationPipe` (body con `message` como array) a 422 `VALIDATION_ERROR`, las `HttpException` cuyo body trae `code` a su status con ese código, y cualquier otra a 500 `INTERNAL_ERROR` con un mensaje genérico. El error interno se loguea con `PinoLoggerService.error` sin devolver la traza. `correlationId` sale de `CorrelationIdStore.getId()` (research #10, FR-049)
- [X] T012 [P] Crear `back/src/modules/packs/pack-config.rules.ts` (utilidad pura, sin Nest). Exporta `PACK_TYPES` en orden `common < rare < epic < legendary`, `DEFAULT_PACK_CONFIG` con la tabla de data-model.md y `parsePacksConfig(env)`, que lee `PACK_TYPES_CONFIG` (JSON opcional), normaliza probabilidades y participaciones a 1 y devuelve `{ ok: true, config } | { ok: false, errors: string[] }` validando las reglas de FR-045 y FR-009 de data-model.md. Incluye `canSumTo(target, cardCounts)` para la regla de partición exacta (research #11)
- [X] T013 [P] Crear `back/src/modules/packs/pack-config.rules.spec.ts`: valores por defecto válidos; precio 0, cartas negativas, todas las probabilidades en 0, JSON malformado y participaciones todas en 0 inválidos; partición exacta: solo `{3}` con participación positiva es inválido (100 no es múltiplo de 3), y `{4, 6}` o `{3, 4, 5, 6}` son válidos; monotonía de `epic + legendary` violada; normalización de probabilidades que no suman 1

### Cambio de OVR a reputación (FR-067 a FR-069; es la rareza que usan los sobres)

- [X] T014 [P] Reescribir `back/src/modules/player/ovr.ts`: `ovrFromReputation(reputation: number | null | undefined): number | null` (nulo sin reputación; `min(OVR_MAX, max(0, reputation))`) y quitar `ovrFromRating`, `ratingLowerBoundForOvr` y `ratingUpperBoundForOvr`. Actualizar el comentario de cabecera: el OVR es la reputación mundial cargada y ya no se deriva del rating (research #12). Reescribir `back/src/modules/player/ovr.spec.ts` con los casos nulo, 0, 91, 100 → 99 y valores fuera de rango
- [X] T015 [P] Actualizar `back/src/modules/player/rarity.ts`: `RARITY_THRESHOLDS = { legendary: 88, epic: 80, rare: 70 }` (FR-016), `rarityFromOvr` sin cambios de firma, y reemplazar `ratingRangesForRarities` por `reputationRangesForRarities(rarities)`, que devuelve rangos `{ min, max, includeNull }` sobre la reputación (`common` con `includeNull: true`, FR-068). Reescribir `back/src/modules/player/rarity.spec.ts` con los bordes 69/70, 79/80, 87/88 y nulo → `common`
- [X] T016 Actualizar `back/src/modules/player/player.repository.ts`: `buildRatingConditions` pasa a ser `buildReputationConditions` y compara contra `"p"."world_reputation"` sin subconsultas sobre `player_season_stats`: `minOvr` → `>=`, `maxOvr` → `<=` (con `maxOvr = 99` incluye 100), un filtro de OVR excluye nulos, y la rareza `common` incluye `is null`. Actualizar el comentario de la clase y `back/src/modules/player/player.repository.spec.ts` (depende de T014, T015)
- [X] T017 Actualizar `back/src/modules/player/dto/player-response.dto.ts`: `ovr = ovrFromReputation(player.worldReputation)` y `rarity = rarityFromOvr(ovr)` tanto en la carta como en el detalle, y la descripción Swagger de `ovr` («reputación mundial cargada, acotada a 99; nulo sin reputación»). Actualizar `back/src/modules/player/dto/player-response.dto.spec.ts` y la descripción del filtro `rarity` en `back/src/modules/player/dto/get-players-filter.dto.ts` (depende de T014, T015)
- [X] T018 Agregar `findCardsByIds(ids: string[]): Promise<Map<string, PlayerCardDto>>` a `back/src/modules/player/player.service.ts`: usa `PlayerRepository` para traer los jugadores con su temporada vigente y su serie de precios (exponer en el repositorio un `findManyByIds(ids, season)` público basado en `attachStats`) y los mapea con el mismo método que el listado (research #13). Confirmar que `PlayerModule` exporta `PlayerService`
- [X] T019 Actualizar `back/src/modules/quotes/quotes.service.ts`: `setReputation` y `setReputationBulk` llaman a `this.playerService.invalidateListCache()`, porque la reputación ahora cambia OVR y rareza en la home. Actualizar el comentario de `setReputation`, que hoy dice que no invalida ninguna caché
- [X] T020 Actualizar `back/test/players.e2e-spec.ts`: los fixtures cargan `worldReputation`; aserciones de OVR igual a la reputación; rareza con los cortes 88/80/70; jugador sin reputación con `ovr: null` y `rarity: 'common'`, excluido con `minOvr` activo e incluido con `rarity=common`; un `PUT /quotes/reputation/:id` cambia el OVR del listado sin esperar el TTL de la caché (SC-020)

### Esqueleto de los módulos

- [X] T021 [P] Crear el módulo `credits` en `back/src/modules/credits/`: `credits.module.ts` (importa `AuthSharedModule`, exporta `CreditsService`), `credits.controller.ts` (`@Controller('credits')`, `@ApiTags('Credits')`, `@UseFilters(ApiErrorFilter)`, sin rutas todavía), `credits.service.ts`, `credits.repository.ts` y `dto/`
- [X] T022 [P] Crear el módulo `tokens` en `back/src/modules/tokens/`: `tokens.module.ts` (importa `AuthSharedModule` y `PlayerModule`, exporta `TokensService`), `tokens.controller.ts` (`@Controller()`, `@ApiTags('Inventory')`, `@UseFilters(ApiErrorFilter)`, sin rutas todavía), `tokens.service.ts`, `tokens.repository.ts` y `dto/`
- [X] T023 [P] Crear el módulo `packs` en `back/src/modules/packs/`: `packs.module.ts` (importa `AuthSharedModule`, `TokensModule` y `PlayerModule`, exporta `PacksService`), `packs.controller.ts` (`@Controller('packs')`, `@ApiTags('Packs')`, `@UseFilters(ApiErrorFilter)`), `packs.service.ts`, `packs.repository.ts` y `dto/`. En `onModuleInit`, `PacksService` llama a `parsePacksConfig(process.env)` y lanza un `Error` con la lista de reglas violadas si la configuración es inválida (la app no arranca, research #11)
- [X] T024 Registrar `CreditsModule`, `TokensModule` y `PacksModule` en los `imports` de `back/src/app.module.ts`, después de `QuotesModule` (depende de T021 a T023)

**Checkpoint**: migración aplicada, `npm test -- ovr rarity pack-config` y `npm run test:e2e -- players` en verde, y la app arranca con los tres módulos vacíos.

---

## Phase 3: User Story 1 - Recibir créditos iniciales y ver mi saldo (Priority: P1) 🎯 MVP

**Goal**: toda cuenta tiene su saldo inicial con un movimiento de emisión registrado, y lo puede consultar.

**Independent Test**: registrar una cuenta y consultar `GET /credits` (igual a `INITIAL_CREDITS`); con una cuenta anterior a la feature, correr la regularización dos veces y verificar que recibe la cantidad una sola vez.

### Tests for User Story 1

- [X] T025 [P] [US1] Crear `back/test/credits.e2e-spec.ts` con:
  - **Registro**: deja saldo 2000 y una fila `entrega_inicial` con `balance_before 0` y `balance_after 2000` (US1-1).
  - **Consulta**: `GET /credits` devuelve un entero (US1-2) y sin token devuelve 401 con `code: 'UNAUTHENTICATED'` y `correlationId` (US1-6).
  - **Regularización**: un usuario insertado directo con `credits = 0` y sin movimiento recibe la entrega con `POST /credits/initial-grants` (US1-3); una segunda llamada devuelve `granted: 0` sin cambiar saldos (US1-4).
  - **Alcance**: cada usuario solo ve su saldo (US1-5).
  - **Concurrencia**: dos registros en paralelo terminan cada uno con 2000 exactos (US1-7).
  - **Fallo**: si la entrega falla dentro del registro (forzar con un `jest.spyOn` sobre el repositorio), el usuario no queda creado (research #3).
  - **Inmutabilidad**: un `update credit_movement` directo falla (FR-040).

### Implementation for User Story 1

- [X] T026 [US1] Implementar `back/src/modules/credits/credits.repository.ts`:
  - `insertInitialGrant(userId, amount, correlationId): Promise<boolean>`, en la transacción en curso:
    1. `select credits from "user" where id = ? for update`.
    2. `insert into credit_movement (…) values (…) on conflict (user_id) where type = 'entrega_inicial' do nothing returning id`, con `balance_before = credits` y `balance_after = credits + amount`.
    3. Si no devuelve fila, ya tenía la entrega: devuelve `false` sin tocar el saldo. No se usa la excepción de unicidad porque abortaría la transacción del registro.
    4. Si la devuelve, `update "user" set credits = credits + ? where id = ?` y devuelve `true`.
  - `findUsersWithoutInitialGrant(limit)` y `getBalance(userId)`.
- [X] T027 [US1] Implementar `back/src/modules/credits/credits.service.ts`:
  - `onModuleInit`: lee `INITIAL_CREDITS` (por defecto 2000) y lanza un `Error` si no es un entero positivo; la app no arranca (FR-045, research #11).
  - `grantInitial(userId)`: entrega ese monto con el Correlation ID actual.
  - `backfillInitialGrants()`: recorre por tandas los usuarios sin entrega y devuelve `{ granted, amount }`; corre también en `onApplicationBootstrap`, con un Correlation ID propio y sin propagar errores.
  - `getBalance(userId)`.
  - Logs `credits granted` y `initial grants backfilled` (FR-050).
- [X] T028 [P] [US1] Crear `back/src/modules/credits/dto/credit-balance.dto.ts` (`credits: number`) y `back/src/modules/credits/dto/initial-grants-result.dto.ts` (`granted`, `amount`) con `@ApiProperty`
- [X] T029 [US1] Agregar a `back/src/modules/credits/credits.controller.ts` `GET /credits` (`JwtAuthGuard`, usuario de `@CurrentUser()`) y `POST /credits/initial-grants` (`ApiKeyGuard`, `@HttpCode(200)`), documentados con Swagger según `contracts/packs.openapi.yaml`
- [X] T030 [US1] Actualizar `back/src/modules/auth/auth.module.ts` (importa `CreditsModule`) y `back/src/modules/auth/auth.service.ts`: `register` crea el usuario y llama a `creditsService.grantInitial(user.id)` dentro de un mismo `em.transactional(...)`, de modo que el `AuthRepository` y el `CreditsRepository` participen de la transacción (TransactionContext de MikroORM, research #3). Conservar el mapeo actual a 409 por email duplicado y a 500 por falla de persistencia (`safely`), y actualizar `back/src/modules/auth/auth.service.spec.ts` con el nuevo colaborador

**Checkpoint**: `npm run test:e2e -- credits` en verde; quickstart S1 y S2 manuales.

---

## Phase 4: User Story 2 - Elegir un tipo de sobre y abrirlo (Priority: P1)

**Goal**: emisión de tokens, stock de sobres generado automáticamente, catálogo con probabilidades en vivo y apertura atómica.

**Independent Test**: con usuarios con créditos y una corrida de cotización hecha, sincronizar el stock, abrir un sobre de cada tipo y verificar saldo, cartas, stock restante y dueño de cada token.

### Tests for User Story 2

- [X] T031 [P] [US2] Crear `back/src/modules/packs/pack-stock-planner.spec.ts`:
  - **Propiedades** con lotes aleatorios (generador con semilla fija, cientos de casos de 1 a 300 jugadores y rarezas mezcladas): cada token en exactamente un sobre; cada sobre con las cartas de su tipo; suma de cartas igual a N; cantidad de sobres por tipo cerca de la participación (SC-005, SC-006).
  - **Ceros**: una celda con probabilidad objetivo 0 queda en 0 (FR-014).
  - **Monotonía**: con la configuración por defecto, `epic + legendary` no decrece al subir de tipo (SC-007).
  - **Determinismo**: inyectando la función de azar, el resultado es reproducible.
- [X] T032 [P] [US2] Crear `back/test/packs.e2e-spec.ts` con fixtures propios (liga, equipo, jugadores con `world_reputation` y `base_value > 0`, uno sin cotización y uno sin reputación, y usuarios registrados por `/auth/register`):
  - **Sincronización**: `POST /packs/stock/sync` emite 100 tokens por jugador y genera un lote solo con los elegibles; repetirla no emite ni genera nada (FR-011, FR-012, FR-029).
  - **Catálogo**: `GET /packs/types` tiene 4 tipos, probabilidades que suman 1 y `remaining` correcto (US2-1).
  - **Apertura**: cobra el precio exacto, entrega `cards` cartas con `quotePrice` y `rarity` y baja `remaining` en 1 (US2-2, US2-3); cada token queda `de_usuario` con su evento `entrega_en_sobre`.
  - **Rechazos**: saldo insuficiente → 409 `INSUFFICIENT_CREDITS` sin efectos (US2-4); saldo exacto deja 0 (US2-5); tipo agotado → `PACK_SOLD_OUT` (US2-6); sin stock generado → `PACKS_NOT_AVAILABLE` (US2-7); tipo inexistente (`"mega"`) → 404 `PACK_TYPE_NOT_FOUND` (US2-8); `type` ausente o no textual → 422 `VALIDATION_ERROR`; sin sesión → 401 (US2-15); un `userId` en el body → 422 por `forbidNonWhitelisted`, sin abrir nada (US2-16).
  - **Exclusiones**: el jugador sin cotización o sin reputación nunca aparece (US2-9, SC-009).
  - **Mismo jugador**: con un lote de un solo jugador elegible, un sobre trae varias cartas suyas y el inventario las suma (US2-14, FR-024).
  - **Referencias**: el movimiento `compra_sobre` apunta a la apertura, la apertura al movimiento y cada `entrega_en_sobre` a la apertura, todos con el mismo `correlation_id` (FR-041).
  - **Concurrencia**: `Promise.all` de 5 aperturas con saldo para 2 → exactamente 2 éxitos (US2-10, SC-003); último sobre pedido por dos usuarios → uno solo (US2-11); ningún token en dos aperturas (US2-12).
  - **Atomicidad**: forzar un error tras el débito (`jest.spyOn` sobre el repositorio) y verificar saldo, inventario y stock intactos (US2-13, SC-002).
  - **Invariantes**: cada jugador suma 100 tokens en los 4 estados (FR-023); `Σ saldos = emitido − cobrado` (SC-013); las probabilidades después de una apertura reflejan las cartas que quedan (FR-010).

### Implementation for User Story 2

- [X] T033 [P] [US2] Crear `back/src/modules/packs/pack-stock-planner.ts` (utilidad pura, research #6). La firma es `planBatch(tokens: { tokenId: string; rarity: Rarity }[], config: PacksConfig, random: (maxExclusive: number) => number): PlannedBatch`:
  1. Cantidad de sobres por tipo según la participación, completando el residuo con programación dinámica para sumar N exacto.
  2. Matriz tipo × rareza por IPF sobre `cupos × probabilidades`, con márgenes en los cupos y en los tokens disponibles por rareza, y redondeo por mayor resto que preserve ambos márgenes.
  3. Mezcla Fisher–Yates por tipo y corte en sobres.

  Devuelve `{ packs: { type, tokenIds }[], composition }`
- [X] T034 [US2] Implementar en `back/src/modules/tokens/tokens.repository.ts` y `back/src/modules/tokens/tokens.service.ts` la emisión idempotente `emitMissing(): Promise<number>`: `insert into token … select p.id, gs from player p cross join generate_series(1, 100) gs on conflict (player_id, serial) do nothing returning id, player_id`, e inserción de los eventos `emision` (`to_status 'reservado'`, plataforma) para los ids devueltos, en una transacción. Log `tokens emitted` (FR-029, research #5)
- [X] T035 [US2] Implementar en `back/src/modules/packs/packs.repository.ts` la generación de lote, todo dentro de `fork().transactional` con `select pg_advisory_xact_lock(<clave fija de packs>)`:
  - `findEligibleReservedTokens(tx)`: tokens `reservado` de jugadores con 100 tokens emitidos, `base_value > 0` y `world_reputation is not null`, con la reputación de cada jugador, `for update`.
  - `persistBatch(tx, plan, params, correlationId)`: inserta `pack_batch`, los `pack` con `insertMany` por tandas, `update token … from unnest(:tokenIds::uuid[], :packIds::uuid[])` a `en_sobre` y los eventos `asignacion_a_sobre` con la cotización y la rareza vigentes.

  (research #6, #7)
- [X] T036 [US2] Implementar `PacksService.syncStock(): Promise<StockSyncResultDto>` en `back/src/modules/packs/packs.service.ts`: llama a `tokensService.emitMissing()`; después, dentro de la transacción del lote, lee los elegibles, calcula la rareza con `rarityFromOvr(ovrFromReputation(rep))`, llama a `planBatch` con `crypto.randomInt` y persiste. Si hubo lote, incrementa `packs:stock-version` (TTL 0) e invalida la caché del catálogo. Log `pack batch generated` con cantidad de tokens y sobres por tipo, nunca con su contenido (FR-015)
- [X] T037 [US2] Registrar el job programado en `PacksService.onModuleInit` con `SchedulerRegistry` y `CronJob.from` (`PACKS_STOCK_CRON`, desactivable con `PACKS_SCHEDULER_ENABLED=false`), con el mismo patrón que `QuotesService.onModuleInit`: Correlation ID propio por disparo, errores logueados sin propagar y expresión inválida logueada sin tirar la app
- [X] T038 [US2] Actualizar `back/src/modules/quotes/quotes.module.ts` (importa `PacksModule`) y `back/src/modules/quotes/quotes.service.ts`: después de `afterRunCommitted()` y después de `setReputation`/`setReputationBulk`, llamar a `packsService.syncStock()` en modo best effort (try/catch con `logger.warn`, sin fallar la operación de origen) e incrementar `packs:stock-version` tras una carga de reputación, porque cambian las rarezas publicadas (research #6, #9, #12)
- [X] T039 [US2] Implementar el catálogo en `back/src/modules/packs/packs.repository.ts` y `back/src/modules/packs/packs.service.ts`:
  - **Repositorio**: `countPacks()` (¿alguna vez se generó stock?), `countSealedByType()` y `countSealedCardsByTypeAndRarity()`, que agrupa tokens `en_sobre` de sobres sin abrir por tipo y por la rareza derivada de `player.world_reputation` con los cortes de `RARITY_THRESHOLDS` (en SQL con `case`, o trayendo los conteos por reputación y bucketeando con `rarityFromOvr`).
  - **Servicio**: `getCatalog()` arma el `PackCatalog` con precio y cartas de la configuración, `remaining`, probabilidades normalizadas (nulas si el tipo está agotado) y `stockGenerated`, y lo cachea en `packs:types:v{n}` leyendo la versión de `packs:stock-version`, con fallback a la base (research #9).
- [X] T040 [US2] Implementar la apertura en `back/src/modules/packs/packs.repository.ts` como `openPack(userId, type, price, params, correlationId)`, todo en una transacción:
  1. Sortear: contar los sobres sin abrir del tipo, elegir `k = randomInt(n)` y `select id from pack where type = ? and status = 'sin_abrir' order by id offset ? limit 1 for update skip locked`, reintentando hasta 3 veces si no devuelve fila; sin fila tras recontar 0 → `PACK_SOLD_OUT`.
  2. Débito condicional `update "user" set credits = credits - ? where id = ? and credits >= ? returning credits`; sin fila → `INSUFFICIENT_CREDITS`.
  3. Marcar el sobre `abierto` y pasar sus tokens a `de_usuario` con `owner_id`.
  4. Leer `base_value` y `world_reputation` de sus jugadores.
  5. Insertar el `credit_movement` `compra_sobre` (con `reference_id` de la apertura), la `pack_opening`, las `pack_opening_card` y los eventos `entrega_en_sobre`, todos con el Correlation ID.

  Devuelve la apertura con sus cartas (research #8)
- [X] T041 [US2] Implementar `PacksService.open(userId, type)` en `back/src/modules/packs/packs.service.ts`:
  1. Validar en el orden de la spec: tipo de la configuración (`PACK_TYPE_NOT_FOUND`), `countPacks() > 0` (`PACKS_NOT_AVAILABLE`) y sin abrir del tipo > 0 (`PACK_SOLD_OUT`).
  2. Llamar a `openPack` con el precio vigente y los parámetros aplicados (precio + los del lote del sobre).
  3. Incrementar `packs:stock-version`.
  4. Completar cada carta con `playerService.findCardsByIds`.
  5. Loguear `pack opened` con tipo, precio y cantidad de cartas.

  Los errores de dominio se lanzan con su `code`
- [X] T042 [P] [US2] Crear en `back/src/modules/packs/dto/`:
  - `open-pack.dto.ts`: `type` con `@IsString()`, `@IsNotEmpty()` y `@MaxLength(32)`, y nada más, para que `forbidNonWhitelisted` rechace un `userId`. No se usa `@IsEnum`: un tipo inexistente tiene que llegar al servicio y responder 404 `PACK_TYPE_NOT_FOUND` (US2-8).
  - `pack-catalog-response.dto.ts`, `pack-opening-response.dto.ts` (con `OpeningCardDto`, que embebe el `PlayerCardDto` del módulo `player`) y `stock-sync-result.dto.ts`, todos con `@ApiProperty` según `contracts/packs.openapi.yaml`.
- [X] T043 [US2] Agregar a `back/src/modules/packs/packs.controller.ts` `GET /packs/types` y `POST /packs/openings` (`JwtAuthGuard`, `@HttpCode(201)`, usuario de `@CurrentUser()`), y `POST /packs/stock/sync` (`ApiKeyGuard`, `@HttpCode(200)`), con sus respuestas de error documentadas

**Checkpoint**: `npm test -- pack-stock-planner` y `npm run test:e2e -- packs` en verde; quickstart S3 a S7 manuales. Con US1, es un producto usable por API.

---

## Phase 5: User Story 3 - Ver mis cartas (Priority: P2)

**Goal**: el usuario consulta los tokens que posee hoy, agrupados por jugador y ordenados por reputación, con la cotización vigente.

**Independent Test**: abrir varios sobres con un usuario y verificar que `GET /inventory` devuelve exactamente esos tokens, agrupados, ordenados y paginados, y que otro usuario no los ve.

### Tests for User Story 3

- [X] T044 [P] [US3] Crear `back/test/tokens.e2e-spec.ts` (bloque inventario), reutilizando el armado de fixtures de `packs.e2e-spec.ts` (extraerlo a `back/test/support/packs-fixtures.ts` si conviene):
  - **Contenido**: después de abrir sobres, la suma de `count` es igual a los tokens recibidos y cada ítem trae `player` (carta con `marketValue` = cotización vigente), `count` y `tokens` (`id`, `serial`) (US3-1, US3-3).
  - **Vacío**: un usuario sin cartas recibe `data: []` (US3-2).
  - **Orden**: por reputación descendente con desempate por id (US3-4).
  - **Token ajeno**: un token cuyo `owner_id` se cambia en la base deja de aparecer (US3-5).
  - **Alcance**: cada usuario ve solo lo suyo (US3-6).
  - **Paginación**: el `meta.total` permite recorrer el inventario completo (US3-8).
  - **Sin acciones**: no existen rutas para listar, vender ni transferir (US3-7).

### Implementation for User Story 3

- [X] T045 [US3] Implementar `findInventoryPage(userId, page, limit)` en `back/src/modules/tokens/tokens.repository.ts`: página de jugadores distintos con tokens `de_usuario` del usuario, ordenados por `player.world_reputation desc nulls last, player.id`, con su total, y los tokens de esos jugadores en una segunda consulta (`id`, `serial`, ordenados por `serial`)
- [X] T046 [P] [US3] Crear `back/src/modules/tokens/dto/inventory-query.dto.ts` (`page`, `limit` 1–100, por defecto 20) y `back/src/modules/tokens/dto/inventory-response.dto.ts` (`InventoryItemDto` con `player: PlayerCardDto`, `reputation`, `count`, `tokens`, más `meta`)
- [X] T047 [US3] Implementar `TokensService.getInventory(userId, query)` en `back/src/modules/tokens/tokens.service.ts` (arma los ítems con `playerService.findCardsByIds`) y agregar `GET /inventory` (`JwtAuthGuard`) en `back/src/modules/tokens/tokens.controller.ts`

**Checkpoint**: `npm run test:e2e -- tokens` (inventario) en verde; quickstart S8.

---

## Phase 6: User Story 4 - Ver el historial de una carta (Priority: P2)

**Goal**: el usuario consulta el historial de un token que posee o poseyó, sin ver a los demás dueños ni los eventos internos.

**Independent Test**: abrir un sobre y consultar el historial de uno de los tokens: emisión y entrega en sobre con fecha, tipo de sobre, cotización y rareza.

### Tests for User Story 4

- [X] T048 [P] [US4] Agregar a `back/test/tokens.e2e-spec.ts` (bloque historial):
  - **Contenido**: eventos en orden cronológico desde `emision` (US4-1); cada uno con `at`, `type`, `from`, `to`, `quotePrice`, `rarity` y `operation` (US4-2); sin `asignacion_a_sobre` (FR-031).
  - **Anonimato**: un evento sintético insertado con otro dueño se muestra como `otro_usuario` (US4-3).
  - **Acceso**: un token ajeno, uno inexistente y un uuid inválido devuelven 404/422 sin distinguir existencia (US4-4); un token que el usuario poseyó y ya no posee se puede ver (US4-5).
  - **Inmutabilidad**: un `delete from token_event` falla (US4-6).
  - **Consistencia**: el último evento coincide con el estado y el dueño actuales (US4-7, SC-014).

### Implementation for User Story 4

- [X] T049 [US4] Implementar `findHistoryVisibleTo(tokenId, userId)` en `back/src/modules/tokens/tokens.repository.ts`: devuelve los eventos del token solo si existe alguno con `to_owner_id = userId`; si no, `null`
- [X] T050 [P] [US4] Crear `back/src/modules/tokens/dto/token-history-response.dto.ts`: mapea `from_owner_id`/`to_owner_id` a `plataforma` (nulo), `yo` o `otro_usuario`, omite `asignacion_a_sobre` y arma `operation` desde `reference_type`/`reference_id`
- [X] T051 [US4] Implementar `TokensService.getHistory(tokenId, userId)` (`NotFoundException({ code: 'TOKEN_NOT_FOUND' })` si `null`) y agregar `GET /tokens/:tokenId/history` con `ParseUUIDPipe` y `JwtAuthGuard` en `back/src/modules/tokens/tokens.controller.ts`

**Checkpoint**: quickstart S9 (historial de token).

---

## Phase 7: User Story 5 - Abrir sobres desde la pantalla de sobres (Priority: P2)

**Goal**: la pantalla `/packs` muestra saldo y tipos, confirma, anima, revela las cartas y actualiza saldo y stock sin recargar; el encabezado da acceso y muestra el saldo.

**Independent Test**: con stock y créditos, abrir un sobre desde la pantalla y verificar confirmación, cartas reveladas iguales a las de la respuesta, saldo y `remaining` actualizados.

### Tests for User Story 5

- [X] T052 [P] [US5] Crear `front/src/services/__tests__/packs.service.test.ts` (mockeando `httpClient`): `getPackCatalog` y `openPack` mapean las respuestas; `openPackErrorMessage(code)` devuelve un mensaje propio para `INSUFFICIENT_CREDITS`, `PACK_SOLD_OUT`, `PACKS_NOT_AVAILABLE`, `PACK_TYPE_NOT_FOUND` e `INTERNAL_ERROR`, y uno genérico para un código desconocido (FR-060)
- [X] T053 [P] [US5] Crear `front/src/services/__tests__/pack.mapper.test.ts`: `toPackData(type, remaining)` da `name`, `tier = type`, `cardCount` y `series`; `toRevealedCard(card)` reutiliza `toPlayerCardData` con la rareza y el precio del momento cero y el `serial` en `token.serial`
- [X] T054 [P] [US5] Crear `front/src/components/__tests__/pack-type-tile.test.tsx` y `front/src/components/__tests__/app-header.test.tsx`:
  - **Tile**: muestra precio, cartas, probabilidades en % y restantes; muestra «Agotado» o «Saldo insuficiente» y deshabilita la apertura (FR-055).
  - **Encabezado**: muestra los accesos a Sobres e Inventario, el saldo y el usuario (FR-052, FR-053).
- [X] T055 [P] [US5] Crear `front/src/pages/__tests__/packs-page.test.tsx` con los servicios mockeados:
  - **Carga**: muestra el saldo y los 4 tipos (US5-1), y con `stockGenerated: false` muestra el mensaje de sin sobres (US5-7, FR-061).
  - **Confirmación**: abre el modal con el precio y el saldo resultante, y cancelar no llama a `openPack` (US5-2).
  - **Éxito**: confirmar y resolver ok monta la revelación con las cartas devueltas y actualiza el saldo del provider (US5-3, US5-4).
  - **Rechazo**: un rechazo no monta la revelación, muestra el mensaje y recarga el catálogo y el saldo (US5-9, SC-018).
  - **Bloqueo**: no se puede iniciar otra apertura mientras una está en curso (US5-8).
  - **Movimiento reducido**: con `matchMedia('(prefers-reduced-motion: reduce)')` en `true`, la revelación muestra las mismas cartas (US5-10, FR-062).

  Crear además `front/src/app/__tests__/protected-routes.test.tsx`: sin sesión, `/packs` e `/inventory` redirigen a `/login` (US5-11, US6-7).

### Implementation for User Story 5

- [X] T056 [P] [US5] Crear `front/src/services/credits.service.ts` (`getBalance(): Promise<number>` con `GET /credits`) y, como provider global en `app/` (constitución §7), `front/src/app/CreditsProvider.tsx` (Context con `balance`, `refresh()` y `setBalance(n)`; carga al haber sesión y se limpia al cerrarla, usando `useAuth`) y `front/src/app/useCredits.ts`
- [X] T057 [P] [US5] Crear `front/src/services/packs.service.ts`:
  - **Tipos** (`PackTypeKey`, `PackCatalog`, `PackOpening`, `OpeningCard`), siguiendo `contracts/packs.openapi.yaml`.
  - **Llamadas** `getPackCatalog()` y `openPack(type)`.
  - **Errores**: `openPackErrorMessage(code)`, y `extractApiErrorCode(error)`, que lee `response.data.code`.
- [X] T058 [P] [US5] Crear `front/src/services/pack.mapper.ts` con `toPackData(type, remaining): PackData`. El nombre sale de un mapa `common → 'Common'`, …; `tier` es el tipo, `series` es `${remaining} sin abrir` y `cardCount` viene del catálogo. Agregar `toRevealedCard(card): PlayerCardData`, sobre `toPlayerCardData` de `front/src/services/player-card.mapper.ts`, con `token.rarity`, `token.serial` y `price.current` del momento cero
- [X] T059 [US5] Crear `front/src/components/AppHeader.tsx` (Tailwind, sin HTTP): título con link a `/`, links a `/packs` («Sobres») e `/inventory` («Mis cartas») con estado activo, saldo recibido por props, usuario y botón de cerrar sesión. Reemplazar el `<header>` inline de `front/src/pages/HomePage.tsx` por `<AppHeader>` con el saldo de `useCredits()`
- [X] T060 [P] [US5] Crear `front/src/components/PackTypeTile.tsx`: recibe `PackData`, precio, probabilidades, restantes, `disabledReason` y `onOpenRequest`; renderiza `Pack` con `openable` según `disabledReason`, el precio, las probabilidades en % y el motivo de no disponible
- [X] T061 [P] [US5] Crear `front/src/components/PackReveal.tsx`: recibe las cartas ya mapeadas a `PlayerCardData` y muestra la grilla de `PlayerCard`, el precio cobrado, el saldo resultante y los botones «Abrir otro» (callback) e «Ir a mis cartas» (link a `/inventory`) (FR-059)
- [X] T062 [US5] Crear `front/src/pages/PacksPage.tsx`:
  - **Encabezado**: `AppHeader` con el saldo de `useCredits()` (FR-052, FR-053).
  - **Carga**: trae el catálogo; muestra error con reintento o el mensaje de sin sobres (FR-061).
  - **Tipos**: renderiza un `PackTypeTile` por tipo, con `disabledReason` según `remaining === 0` o `price > balance` (FR-055).
  - **Pedido de apertura**: `onOpenRequest` devuelve una promesa que primero abre `ConfirmModal` con tipo, precio y saldo resultante (FR-056). Si se confirma, llama a `openPack` y resuelve `true` solo con éxito, guardando la apertura; con error resuelve `false`, muestra el mensaje y recarga el catálogo y el saldo (FR-058, FR-060).
  - **Al abrir** (`onOpened`): monta `PackReveal`, llama a `setBalance(opening.balanceAfter)` y recarga el catálogo (FR-059).
  - **Bloqueo**: una bandera impide iniciar otra apertura en curso (FR-057). Estilos solo con Tailwind (§2).
- [X] T063 [US5] Actualizar `front/src/app/App.tsx`: envolver las rutas con `CreditsProvider` (dentro de `AuthProvider`) y agregar `/packs` → `PacksPage` dentro de `ProtectedRoute` (FR-052)

**Checkpoint**: `npm test` y `npm run build` en `front/` en verde; quickstart W1 a W7.

---

## Phase 8: User Story 6 - Ver mis cartas en la pantalla de inventario (Priority: P2)

**Goal**: la pantalla `/inventory` muestra las cartas del usuario ordenadas por reputación, con cantidad, números de serie, cotización vigente y paginación.

**Independent Test**: con sobres abiertos, entrar al inventario y verificar que muestra los mismos jugadores y tokens que `GET /inventory`, en el mismo orden, y que se recorre completo.

### Tests for User Story 6

- [X] T064 [P] [US6] Crear `front/src/services/__tests__/inventory.service.test.ts` (mapeo de la página) y `front/src/pages/__tests__/inventory-page.test.tsx`:
  - **Contenido**: renderiza un ítem por jugador con su carta, la cantidad y los números de serie, en el orden recibido (US6-1, US6-2).
  - **Paginación**: muestra la página actual y el total, y navega (US6-3).
  - **Vacío**: muestra el mensaje con link a `/packs` (US6-4).
  - **Error**: muestra el mensaje con reintento (US6-6).
  - **Sin acciones**: no hay botones de listar, vender ni transferir (US6-5).

### Implementation for User Story 6

- [X] T065 [P] [US6] Crear `front/src/services/inventory.service.ts` con `getInventory(page, limit)` y los tipos `InventoryItem` e `InventoryPage` según `contracts/packs.openapi.yaml`
- [X] T066 [US6] Crear `front/src/pages/InventoryPage.tsx`:
  - **Encabezado**: `AppHeader`.
  - **Lista**: un `PlayerCard` por ítem (mapeado con `toPlayerCardData`, con su cotización vigente), la cantidad y los números de serie.
  - **Paginación**: con el mismo estilo que la home.
  - **Estados**: vacío con link a `/packs` (FR-065) y error con reintento.
  - **Sin acciones**: ninguna acción sobre las cartas (FR-066).
  - **Estilos**: solo Tailwind.
- [X] T067 [US6] Agregar la ruta `/inventory` → `InventoryPage` dentro de `ProtectedRoute` en `front/src/app/App.tsx` (FR-052)

**Checkpoint**: quickstart W8 a W10.

---

## Phase 9: User Story 7 - Consultar el historial de aperturas (Priority: P3)

**Goal**: el usuario consulta sus aperturas pasadas, inmutables, de la más reciente a la más antigua.

**Independent Test**: abrir varios sobres, consultar `GET /packs/openings` y verificar que cada registro reproduce el saldo y sus cartas coinciden con los tokens entregados.

### Tests for User Story 7

- [X] T068 [P] [US7] Agregar a `back/test/packs.e2e-spec.ts` (bloque historial):
  - **Orden y contenido**: de la más reciente a la más antigua, con `type`, `price`, `balanceBefore`/`balanceAfter` y `cards` (US7-1).
  - **Saldo**: `balanceBefore − price = balanceAfter` en cada una (US7-2).
  - **Cartas**: conservan la rareza y la cotización del momento cero aunque después cambie la reputación o el `base_value` del jugador (US7-3), y siguen apareciendo aunque el token cambie de dueño (US7-4).
  - **Inmutabilidad**: un `delete from pack_opening` falla (US7-5).
  - **Alcance**: cada usuario ve solo lo suyo (US7-6).
  - **Reconstrucción**: los movimientos de créditos, sumados en orden, dan el saldo actual (US7-7, SC-012).
  - **Trazabilidad**: cada registro conserva el `correlation_id` enviado en el header (US7-8).

### Implementation for User Story 7

- [X] T069 [US7] Implementar `findOpeningsPage(userId, page, limit)` en `back/src/modules/packs/packs.repository.ts` (aperturas por `created_at desc` con su total y las cartas de esas aperturas en una segunda consulta) y `PacksService.listOpenings(userId, query)`, que completa las cartas con `playerService.findCardsByIds` y usa la rareza y el precio registrados
- [X] T070 [US7] Crear `back/src/modules/packs/dto/openings-query.dto.ts` (`page`, `limit`) y agregar `GET /packs/openings` (`JwtAuthGuard`) en `back/src/modules/packs/packs.controller.ts`, que responde la página de `PackOpeningResponseDto`

**Checkpoint**: `npm run test:e2e -- packs` completo en verde; quickstart S9 (aperturas).

---

## Phase 10: Polish & Cross-Cutting Concerns

- [X] T071 [P] Revisar en Swagger (`/api`) que los 8 endpoints nuevos coinciden con `contracts/packs.openapi.yaml` (esquemas, códigos de error y seguridad) y que la descripción de `ovr` en `/players` ya no menciona el rating
- [X] T072 [P] Agregar un test e2e en `back/test/packs.e2e-spec.ts` que verifique que ni `/packs/types` ni `/packs/stock/sync` exponen ids de tokens ni de jugadores de sobres sin abrir (FR-015)
- [X] T073 [P] Agregar a `back/src/modules/packs/pack-config.rules.spec.ts` o a un test de arranque que una `PACK_TYPES_CONFIG` inválida impide iniciar `PacksModule` con un mensaje que nombra la regla (research #11)
- [X] T074 Correr `npm run lint` y `npm test` en `back/` y en `front/`, `npm run test:e2e` completo en `back/` y `npm run build` en `front/`, y corregir lo que falle
- [X] T075 Ejecutar los escenarios manuales de `quickstart.md` (S1 a S11 y W1 a W10) contra la base local con el catálogo real, y registrar en `quickstart.md` cualquier ajuste de los resultados esperados (por ejemplo, la distribución real de rarezas del primer lote)
- [X] T076 Medir SC-001 con el escenario S12 de `quickstart.md`: 100 aperturas secuenciales contra la base local con el catálogo real, registrando el p95 del tiempo de respuesta de `POST /packs/openings`. Si supera 2 s, revisar los índices de T009 y la transacción de T040

---

## Phase 11: Revisión 6 — el Market muestra solo cartas a la venta (FR-070)

**Goal**: el listado de la home muestra solo jugadores con al menos un token a la venta; mientras no haya ninguno, la home lo explica y ofrece ir a sobres, con los filtros visibles.

**Independent Test**: sin tokens a la venta, `GET /players` devuelve vacío y la home muestra «Todavía no hay cartas a la venta» con el acceso a `/packs`; al pasar tokens de un jugador a `en_venta_plataforma`, ese jugador aparece.

- [X] T077 Agregar `FOR_SALE_TOKEN_STATUSES = [TokenStatus.PLATFORM_SALE]` en `back/src/infrastructure/database/entities/token.entity.ts`, como única definición de «a la venta» que va a ampliar la spec del mercado
- [X] T078 Agregar a `findAndCount` en `back/src/modules/player/player.repository.ts` la condición `exists (select 1 from token where player_id = p.id and status in FOR_SALE_TOKEN_STATUSES)`. `GET /players/{id}` no cambia
- [X] T079 Actualizar `back/test/players.e2e-spec.ts`: los jugadores del fixture tienen tokens `en_venta_plataforma`, uno nuevo (`Quique NoEnVenta`) no tiene ninguno, y el bloque E14 cubre que no aparece, que su detalle sigue disponible, que las cartas en sobres no cuentan y que sin cartas a la venta el listado está vacío (SC-021)
- [X] T080 [P] Agregar `hasActiveFilters(filters)` en `front/src/pages/home-filters.ts` y, en `front/src/pages/HomePage.tsx`, distinguir el listado vacío sin filtros («Todavía no hay cartas a la venta», con link a `/packs`) del vacío con filtros («Sin resultados»), sin ocultar el panel de filtros
- [X] T081 [P] Crear `front/src/pages/__tests__/home-market.test.tsx` con los dos estados vacíos, los filtros visibles y `hasActiveFilters`

---

## Phase 12: Revisión 6 — número de serie en la carta y apertura en primer plano (FR-058, FR-063)

- [X] T082 [P] Agregar `toInventoryCard(player, serial)` en `front/src/services/pack.mapper.ts` (la carta con el número de serie del token en `token.serial`, que `PlayerCard` muestra junto a la rareza) y usarlo en `toRevealedCard`
- [X] T083 [P] Cambiar `front/src/pages/InventoryPage.tsx` a una carta por token con `toInventoryCard`, sin la cantidad ni los números debajo de la carta
- [X] T084 Agregar la prop `autoOpen` a `front/src/components/pack/Pack.tsx` y, en `front/src/pages/PacksPage.tsx`, abrir el sobre comprado en un escenario fijo, grande y centrado (el sobre de la grilla queda cerrado), que al terminar monta la revelación
- [X] T085 Actualizar `front/src/pages/__tests__/packs-page.test.tsx` (escenario), `front/src/pages/__tests__/inventory-page.test.tsx` (número de serie en cada carta), `front/src/services/__tests__/pack.mapper.test.ts` y `front/src/components/__tests__/pack-type-tile.test.tsx` (`autoOpen` con el `Pack` real)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sin dependencias.
- **Foundational (Phase 2)**: depende de Setup y bloquea todas las historias. T009 (migración) depende de T003 a T008; T016 y T017 dependen de T014 y T015; T024 depende de T021 a T023.
- **US1 (Phase 3)**: depende de Foundational.
- **US2 (Phase 4)**: depende de Foundational. Sus e2e usan usuarios con créditos, así que en la práctica va después de US1 (el registro acredita); sin US1 se pueden sembrar saldos directo en la base.
- **US3 (Phase 5) y US4 (Phase 6)**: dependen de US2, porque necesitan tokens entregados. Entre sí son independientes.
- **US5 (Phase 7)**: depende de US1 (saldo) y de US2 (catálogo y apertura).
- **US6 (Phase 8)**: depende de US3 (endpoint) y de T059 (`AppHeader`, de US5).
- **US7 (Phase 9)**: depende de US2.
- **Polish (Phase 10)**: al final.

### Within Each User Story

- Los tests se escriben primero y deben fallar antes de implementar.
- Repositorio → servicio → DTOs → controlador.
- En el cliente: servicios → componentes → página → ruta.

### Parallel Opportunities

- Setup: T002 en paralelo con T001.
- Foundational: entidades T003 a T008 en paralelo; T011, T012, T013, T014 y T015 en paralelo; esqueletos T021 a T023 en paralelo.
- US2: T031, T032 y T033 en paralelo (archivos distintos); T042 en paralelo con T034 a T041.
- US3 y US4 pueden avanzar en paralelo una vez cerrada US2 (comparten `tokens.repository.ts` y `tokens.controller.ts`: coordinar o hacerlas en secuencia si las toma una sola persona).
- US5: T052 a T055 en paralelo; T056, T057, T058, T060 y T061 en paralelo.
- Backend (US3, US4, US7) y cliente (US5, US6) en paralelo entre personas distintas.

---

## Parallel Example: User Story 2

```bash
# Tests y utilidad pura juntos:
Task: "T031 pack-stock-planner.spec.ts en back/src/modules/packs/"
Task: "T032 packs.e2e-spec.ts en back/test/"
Task: "T033 pack-stock-planner.ts en back/src/modules/packs/"

# DTOs mientras se implementa el repositorio:
Task: "T042 DTOs de packs en back/src/modules/packs/dto/"
```

## Parallel Example: User Story 5

```bash
Task: "T056 credits.service.ts + CreditsProvider.tsx + useCredits.ts en front/src/services/"
Task: "T057 packs.service.ts en front/src/services/"
Task: "T058 pack.mapper.ts en front/src/services/"
Task: "T060 PackTypeTile.tsx en front/src/components/"
Task: "T061 PackReveal.tsx en front/src/components/"
```

---

## Implementation Strategy

### MVP First (User Story 1, después User Story 2)

1. Phase 1 y Phase 2: con esto la home ya muestra OVR y rareza desde la reputación.
2. Phase 3 (US1): **validar** saldo y regularización (quickstart S1, S2).
3. Phase 4 (US2): **validar** sincronización, catálogo y apertura por API (S3 a S7).
4. US1 + US2 son el MVP de la spec: créditos y apertura de sobres, usable por API.

### Incremental Delivery

1. MVP (US1 + US2).
2. US3 + US4: inventario e historial de un token (API).
3. US5: pantalla de sobres (la cara visible del MVP).
4. US6: pantalla de inventario.
5. US7: historial de aperturas.
6. Polish.

### Parallel Team Strategy

Con Foundational terminada:

- Persona A: US1 → US2 → US7 (backend de créditos y sobres).
- Persona B: US3 → US4 (backend de tokens) cuando US2 deje tokens entregados.
- Persona C: US5 → US6 (cliente), contra los contratos, con servicios mockeados hasta que el backend esté listo.

---

## Notes

- [P] = archivos distintos y sin dependencias pendientes.
- Las tareas [US#] se rastrean hasta su historia de la spec y sus escenarios de aceptación.
- Commit al terminar cada tarea o grupo lógico; frenar en cada checkpoint para validar la historia sola.
- No se implementa el rearme de sobres (FR-017, research #14) ni la devolución por cuenta eliminada (FR-043, research #15).
