---
description: "Task list template for feature implementation"
---

# Tasks: Catálogo de Jugadores

**Input**: Design documents from `.specify/specs/01-catalogo-jugadores/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/players.openapi.yaml, quickstart.md

**Tests**: Not explicitly requested in spec.md — no dedicated test tasks are generated. Story
completion is validated via the "Independent Test" criteria below and the Polish-phase
quickstart run.

**Organization**: Tasks are grouped by user story derived from spec.md's endpoint contracts:
`GET /players` (listado, P1 — mayor valor y depende de todos los filtros/caché) y
`GET /players/:id` (detalle, P2 — más simple, útil una vez existe el listado).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Puede ejecutarse en paralelo (archivos distintos, sin dependencias pendientes)
- **[Story]**: A qué historia de usuario pertenece (US1, US2)
- Se incluyen paths de archivo exactos en cada descripción

## Path Conventions

Proyecto backend único en `back/` (ver `plan.md` → Project Structure). No hay frontend en
este feature.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Instalar dependencias nuevas e infraestructura compartida (Redis) requeridas
por el resto del feature.

- [X] T001 [P] Agregar `@nestjs/swagger`, `class-validator`, `class-transformer`,
      `@nestjs/cache-manager`, `cache-manager`, `keyv`, `@keyv/redis`, `pino`, `pino-http`
      a `back/package.json` y correr `npm install` en `back/`. *(Nota: `cache-manager-
      ioredis-yet` y `nestjs-pino` se descartaron en favor de Keyv y `pino`+`pino-http`
      directos — ver research.md #5/#6, no instalan limpio contra Nest 12 / cache-manager
      v7.)*
- [X] T002 [P] Agregar servicio `redis` (imagen `redis:7-alpine`, puerto expuesto) a
      `back/docker-compose.yml`
- [X] T003 [P] Agregar `REDIS_HOST`, `REDIS_PORT` y `PLAYERS_CACHE_TTL_SECONDS` a
      `back/.env` (no existe `back/.env.test`)
- [X] T004 [P] Crear carpetas vacías `back/src/modules/player/dto/` y
      `back/src/shared/logging/`

**Checkpoint**: Dependencias instaladas y estructura de carpetas lista.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Cambios de esquema y wiring transversal que bloquean a AMBAS historias de
usuario (listado y detalle comparten la misma entidad, DTO de respuesta, repository,
módulo, validación global y caché).

**🚨 CRITICAL**: Ninguna historia de usuario puede empezar hasta completar esta fase.

- [X] T005 Modificar `back/src/infrastructure/database/entities/player.entity.ts`: cambiar
      `id` de `@PrimaryKey({ type: 'number' })` a `@PrimaryKey({ type: 'uuid' })` (default
      `randomUUID()` de `node:crypto`, no `uuid` package) y agregar
      `baseValue: @Property({ type: 'decimal', precision: 10, scale: 2 })` (ver
      `data-model.md`)
- [X] T006 Escribir a mano la migración de MikroORM (Docker no disponible para diff en
      vivo al momento de generarla) en
      `back/src/infrastructure/database/migrations/Migration20260829203938.ts`, más el
      `.snapshot.json` actualizado — refleja el cambio de PK a uuid y la nueva columna
      `base_value` (depends on T005)
- [X] T007 Aplicada la migración contra Postgres local (`npx mikro-orm migration:up` en
      `back/`) y verificado el schema resultante (`\d player`: `id uuid` PK,
      `base_value numeric(10,2) not null`) (depends on T006, T002)
- [X] T008 [P] Implementar módulo de logging estructurado compartido en
      `back/src/shared/logging/`: `pino-logger.service.ts` (`LoggerService` de Nest sobre
      `pino`), `correlation-id.store.ts` (`AsyncLocalStorage`), `correlation-id.middleware.ts`
      (`pino-http` + propagación del correlation id) y `logging.module.ts` (`@Global`,
      aplica el middleware a `'*'`). *(Nota: `nestjs-pino` descartado, ver research.md #6.)*
      (depends on T001)
- [X] T009 [P] Registrado `ValidationPipe({ whitelist: true, transform: true,
      forbidNonWhitelisted: true })` global, `app.useLogger(app.get(PinoLoggerService))` y
      bootstrap de `SwaggerModule` (`DocumentBuilder`, `SwaggerModule.setup('api', ...)`) en
      `back/src/main.ts` (depends on T001)
- [X] T010 Registrado `CacheModule.registerAsync` (store `@keyv/redis` vía `KeyvRedis`,
      host/puerto/TTL desde env) y `LoggingModule` en `back/src/app.module.ts`. **Ampliado
      más allá del alcance original**: no existía ninguna integración de MikroORM con el
      contenedor de DI de NestJS (`@mikro-orm/nestjs` no soporta aún Nest 12 — mismo
      problema que `nestjs-pino`), así que se creó
      `back/src/infrastructure/database/database.module.ts` (`@Global`, inicializa
      `MikroORM.init(config)`, expone `EntityManager`, aplica `RequestContext.create`
      como middleware para aislar cada request) y se registró también en `app.module.ts`.
      (depends on T003, T008)
- [X] T011 [P] Creado `PlayerResponseDto` (+ `PlayersPageMetaDto`/`PlayersPageDto` para el
      envelope paginado) en `back/src/modules/player/dto/player-response.dto.ts` con el
      mapeo `externalId = externalWhoScoredId ?? externalFootballDataId` y `team`/`league`
      derivados de las relaciones (ver `data-model.md`)
- [X] T012 Creado `back/src/modules/player/player.repository.ts` con `findAndCount(filter)`
      y `findOneById(id)`, populando `team`/`team.league`, inyectando `EntityManager` de
      MikroORM (depends on T005, T010)
- [X] T013 Creado `back/src/modules/player/player.module.ts` (controller + service +
      repository providers) y registrado en los imports de `back/src/app.module.ts`
      (depends on T012, T010)

**Checkpoint**: Fundación lista — el trabajo de las historias de usuario puede comenzar.

---

## Phase 3: User Story 1 - Listado paginado y filtrado de jugadores (Priority: P1) 🎯 MVP

**Goal**: `GET /players` devuelve una lista paginada de jugadores, filtrable por `league`,
`team` y `position`, con respuestas cacheadas en Redis y documentadas en Swagger.

**Independent Test**: Levantar el stack (`docker compose up` + `npm run start:dev`) y
correr `curl "http://localhost:3000/players?league=Premier%20League&position=FW&page=1&limit=20"`
dos veces seguidas: la primera respuesta debe ser `200` con el envelope
`{ data, meta }` filtrado correctamente; la segunda debe resolverse desde caché (visible en
los logs estructurados). `curl "http://localhost:3000/players?limit=abc"` debe devolver
`400`.

### Implementation for User Story 1

- [X] T014 [P] [US1] Creado `GetPlayersFilterDto` con decoradores `class-validator`
      (`league`, `team`, `position` opcionales; `page`/`limit` opcionales con
      `@Type(() => Number) @IsInt() @Min(1)`, `limit` con `@Max(100)`, default 1/20) en
      `back/src/modules/player/dto/get-players-filter.dto.ts`
- [X] T015 [US1] Implementado `PlayerService.findAll(filter: GetPlayersFilterDto)` en
      `back/src/modules/player/player.service.ts`: pagina, popula team/league vía
      `PlayerRepository`, mapea a `PlayerResponseDto[]` y arma
      `meta { total, page, limit, totalPages }` (depends on T011, T012, T014)
- [X] T016 [US1] Implementado el handler `GET /players` en
      `back/src/modules/player/player.controller.ts` con `@ApiTags('Players')`,
      `@ApiOperation`, `@ApiResponse` y `@ApiQuery` por cada filtro (depends on T015)
- [X] T017 [US1] **Cambiado de interceptor a caché manual** (ver research.md #5 — con
      `CacheInterceptor` un cache-hit nunca llega a `PlayerService`, lo que impedía
      cumplir el DoD #4 de loguear cada consulta). Implementado dentro de
      `PlayerService.findAll`: `cache.get(key)` primero, `cache.set(key, result)` en miss,
      clave derivada de filtros+paginación normalizados, TTL por default de
      `CacheModule` (`PLAYERS_CACHE_TTL_SECONDS`) (depends on T015, T010)
- [X] T018 [US1] Agregado logging estructurado en `PlayerService.findAll` (filtros
      aplicados, página/límite, `cacheHit`, cantidad de resultados y total) usando
      `PinoLoggerService.event(...)` de T008 — verificado con dos requests idénticos
      consecutivos: primero `cacheHit:false`, segundo `cacheHit:true` (depends on T008,
      T015)

**Checkpoint**: `GET /players` es funcional, cacheado, documentado y testeable de forma
independiente.

---

## Phase 4: User Story 2 - Detalle de jugador por ID (Priority: P2)

**Goal**: `GET /players/:id` devuelve el detalle completo de un jugador dado un UUID
válido, con manejo explícito de 400 (formato inválido) y 404 (no existe).

**Independent Test**: `curl http://localhost:3000/players/<uuid-existente>` → `200` con el
objeto `Player` completo; `curl -i http://localhost:3000/players/no-es-un-uuid` → `400`;
`curl -i http://localhost:3000/players/00000000-0000-0000-0000-000000000000` → `404`.

### Implementation for User Story 2

- [X] T019 [US2] Implementado `PlayerService.findOne(id: string)` en
      `back/src/modules/player/player.service.ts`, lanzando `NotFoundException` si
      `PlayerRepository.findOneById` no encuentra el registro (depends on T012)
- [X] T020 [US2] Implementado el handler `GET /players/:id` en
      `back/src/modules/player/player.controller.ts` con `ParseUUIDPipe()` (formato UUID
      genérico, no restringido a v4) en el path param `id` y decoradores
      `@ApiOperation`/`@ApiResponse` (200/400/404) (depends on T019)
- [X] T021 [US2] Agregado logging estructurado en `PlayerService.findOne` (id solicitado,
      `found: true/false`) usando `PinoLoggerService.event(...)` de T008 (depends on T008,
      T019)

**Checkpoint**: Ambas historias de usuario (listado y detalle) funcionan de forma
independiente.

---

## Phase 5: Polish & Cross-Cutting Concerns

**Purpose**: Validación end-to-end y limpieza final.

- [X] T022 Ejecutados manualmente los 4 escenarios de `quickstart.md` contra
      `docker compose up -d` (postgres+redis) + `npm run start:dev`: listado+filtros con
      dos requests idénticos (`cacheHit:false` → `cacheHit:true` en los logs), detalle por
      id, los 3 casos límite (`400` id inválido, `404` id válido inexistente, `400`
      `limit=abc`), y Swagger UI/`api-json` sirviendo ambos endpoints y los 3 schemas
      (`PlayerResponseDto`, `PlayersPageMetaDto`, `PlayersPageDto`). Servidor de dev
      detenido al terminar; contenedores de Postgres/Redis quedan arriba para desarrollo
      continuo.
- [X] T023 [P] `npm run lint` (oxlint) en `back/` — 0 hallazgos. **Hallazgo fuera de
      alcance**: `npm test` falla con `TS5011` (rootDir ambiguo entre `src/` y `test/` en
      `tsconfig.json`, usado por `ts-jest`) — es un gap de configuración preexistente (no
      tocado por este feature; `tsconfig.build.json` ya lo resuelve para el build normal,
      pero la config base que usa Jest no). No se corrigió por estar fuera del alcance de
      `tasks.md`; queda como deuda técnica a resolver aparte.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sin dependencias — puede iniciar de inmediato
- **Foundational (Phase 2)**: depende de Setup — bloquea ambas historias de usuario
- **User Story 1 (Phase 3)**: depende de Foundational — es el MVP
- **User Story 2 (Phase 4)**: depende de Foundational — independiente de US1 (no reutiliza
  código de US1, solo la fundación compartida)
- **Polish (Phase 5)**: depende de que US1 y US2 estén completas

### Parallel Opportunities

- T001-T004 (Setup) en paralelo
- T008, T009, T011 (Foundational) en paralelo entre sí una vez completado T001
- Una vez cerrada la Fase 2, US1 (Phase 3) y US2 (Phase 4) pueden trabajarse en paralelo por
  desarrolladores distintos — ambas solo dependen de la fundación, no entre sí
- T014 (US1) es paralelizable respecto al resto de su fase (archivo de DTO independiente)

---

## Parallel Example: Foundational Phase

```bash
# Una vez terminado T001 (deps instaladas), lanzar en paralelo:
Task: "Implementar logging module en back/src/shared/logging/logging.module.ts"
Task: "Registrar ValidationPipe global y bootstrap de Swagger en back/src/main.ts"
Task: "Crear PlayerResponseDto en back/src/modules/player/dto/player-response.dto.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 solamente)

1. Completar Phase 1: Setup
2. Completar Phase 2: Foundational (crítico — bloquea todo lo demás)
3. Completar Phase 3: User Story 1 (`GET /players`)
4. **Validar de forma independiente** con el "Independent Test" de US1
5. Demo/entrega parcial si corresponde

### Entrega incremental

1. Setup + Foundational → fundación lista
2. US1 → validar independientemente → demo (MVP: listado filtrado y cacheado)
3. US2 → validar independientemente → demo (detalle por id)
4. Polish → validación end-to-end completa vía `quickstart.md`

---

## Notes

- [P] = archivos distintos, sin dependencias pendientes entre sí
- [Story] mapea cada tarea a su historia de usuario para trazabilidad
- No se generan tareas de test dedicadas porque `spec.md` no las pide explícitamente; la
  cobertura de los casos límite se valida vía las pruebas manuales de Phase 5 y los
  "Independent Test" de cada historia
- Confirmar que T005-T007 (migración) se completen y verifiquen contra la base local antes
  de tocar cualquier código de las historias de usuario — es el cambio más riesgoso
  (rompe la PK existente de `player`)
