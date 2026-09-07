---

description: "Task list template for feature implementation"
---

# Tasks: Ingesta de Catálogo de Jugadores desde Football-Data.org

**Input**: Design documents from `/.specify/specs/02-ingesta-catalogo/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/ingestion.openapi.yaml, quickstart.md

**Tests**: `plan.md` ya prevé `back/test/ingestion.e2e-spec.ts`; se incluyen tareas de test acotadas a los escenarios de `quickstart.md` (idempotencia y resiliencia), no una suite exhaustiva.

**Organization**: Tareas agrupadas por user story (`spec.md`) para permitir implementación y prueba independiente de cada una.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Puede correr en paralelo (archivos distintos, sin dependencias pendientes)
- **[Story]**: A qué user story pertenece (US1, US2, US3)
- Cada tarea incluye el path exacto del archivo

## Path Conventions

Proyecto backend único en `/back` (sin frontend en este feature). Paths reales según
`plan.md` → Project Structure.

---

## Phase 1: Setup

**Purpose**: Preparar dependencias y configuración antes de tocar código de dominio.

- [X] T001 Instalar `@nestjs/axios` y `axios` en `back/package.json` (ver research.md #1)
- [X] T002 [P] Agregar `FOOTBALL_DATA_BASE_URL`, `FOOTBALL_DATA_API_KEY`,
      `FOOTBALL_DATA_RATE_LIMIT_PER_MINUTE` a `back/.env` (ver quickstart.md, Prerrequisitos)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Esquema de datos y capa Adapter — bloquean el trabajo de las 3 user stories.

**⚠️ CRITICAL**: Ninguna user story puede empezar hasta que esta fase esté completa.

- [X] T003 [P] Extender `League` en `back/src/infrastructure/database/entities/league.entity.ts`
      (+ `externalId` unique, `code` unique — ver data-model.md)
- [X] T004 [P] Extender `Team` en `back/src/infrastructure/database/entities/team.entity.ts`
      (+ `externalId` unique, `shortName`, `tla`, `crestUrl` — ver data-model.md)
- [X] T005 [P] Extender `Player` en `back/src/infrastructure/database/entities/player.entity.ts`
      (agregar `UNKNOWN` a `PlayerPosition`, índice único en `externalFootballDataId`, +
      `dateOfBirth`, `nationality`, `shirtNumber` — ver data-model.md)
- [X] T006 Generar y revisar la migración de MikroORM (`npx mikro-orm migration:create`) en
      `back/src/infrastructure/database/migrations/` cubriendo T003-T005 (depende de T003,
      T004, T005)
- [X] T007 [P] Crear DTOs externos `FootballDataCompetitionDto`, `FootballDataTeamDto`,
      `FootballDataSquadMemberDto` en `back/src/adapters/football-data/dtos/` (ver
      data-model.md, DTOs externos)
- [X] T008 Crear `FootballDataClient` (HTTP vía `@nestjs/axios`, cola de rate limit en
      memoria — research.md #2) en `back/src/adapters/football-data/football-data.client.ts`
      (depende de T001, T002)
- [X] T009 Crear `FootballDataModule` registrando `HttpModule` + `FootballDataClient` como
      provider exportado en `back/src/adapters/football-data/football-data.module.ts`
      (depende de T008)
- [X] T010 [P] Crear `IngestionResultDto` en
      `back/src/modules/ingestion/dto/ingestion-result.dto.ts` (ver data-model.md)
- [X] T011 Cablear `FootballDataModule` en `back/src/app.module.ts` (depende de T009)

**Checkpoint**: Entidades migradas y cliente HTTP hacia Football-Data.org disponible como
provider inyectable — las 3 user stories pueden empezar.

---

## Phase 3: User Story 1 - Bootstrap manual del catálogo completo (Priority: P1) 🎯 MVP

**Goal**: `POST /ingestion/players` puebla `League`/`Team`/`Player` desde cero para las 5
ligas configuradas.

**Independent Test**: Invocar el endpoint contra una base vacía y verificar que
`leagues`/`teams`/`players` queden pobladas y el response tenga la forma `IngestionResult`.

### Implementation for User Story 1

- [X] T012 [US1] Implementar `FootballDataAdapter.getLeague/getTeamsByLeague/
      getTeamWithSquad` (normalización DTO externo → shape de dominio, incluye mapeo de
      `position` — research.md #3, #5) en
      `back/src/adapters/football-data/football-data.adapter.ts` (depende de T007, T008)
- [X] T013 [US1] Registrar `FootballDataAdapter` como provider exportado de
      `FootballDataModule` (`back/src/adapters/football-data/football-data.module.ts`)
      (depende de T012)
- [X] T014 [US1] Implementar `IngestionRepository.upsertLeague/upsertTeam/upsertPlayer`
      (persistencia vía `EntityManager`, `baseValue = '0.00'` solo al crear — research.md #6,
      #8) en `back/src/modules/ingestion/ingestion.repository.ts` — implementado directamente
      con upsert real (T019/T020 incluidas), no como create-only
- [X] T015 [US1] Implementar `IngestionService.run()` orquestando liga → equipos → planteles
      (las 5 ligas fijas: PL, BL1, PD, SA, FL1) en
      `back/src/modules/ingestion/ingestion.service.ts` (depende de T013, T014)
- [X] T016 [US1] Implementar `IngestionController` con `POST /ingestion/players` documentado
      con `@nestjs/swagger` (`@ApiTags`, `@ApiOperation`, `@ApiResponse` — ver
      contracts/ingestion.openapi.yaml) en
      `back/src/modules/ingestion/ingestion.controller.ts` (depende de T015)
- [X] T017 [US1] Completar `IngestionModule` registrando controller/service/repository en
      `back/src/modules/ingestion/ingestion.module.ts`, e importarlo en `back/src/app.module.ts`
      (depende de T014, T015, T016)

**Checkpoint**: User Story 1 funcional y testeable de forma independiente (Escenario 1 de
quickstart.md).

---

## Phase 4: User Story 2 - Re-ejecución idempotente (Priority: P2)

**Goal**: Volver a correr la ingesta sobre una base ya poblada no duplica ligas, equipos ni
jugadores.

**Independent Test**: Correr `POST /ingestion/players` dos veces seguidas y verificar que la
cantidad de filas en `leagues`/`teams`/`players` no cambia en la segunda corrida.

### Tests for User Story 2

- [X] T018 [P] [US2] Test e2e de idempotencia (correr la ingesta dos veces sobre el mismo
      fixture, comparar conteos antes/después) en `back/test/ingestion.e2e-spec.ts`

### Implementation for User Story 2

- [X] T019 [US2] Convertir `IngestionRepository` de create-only a upsert real: buscar por
      `code` (League) / `externalId` (Team) / `externalFootballDataId` (Player) antes de
      crear, actualizar si ya existe (data-model.md, Reglas de idempotencia) en
      `back/src/modules/ingestion/ingestion.repository.ts` (depende de T014)
- [X] T020 [US2] Excluir `baseValue` del payload de actualización en el upsert de `Player`
      para no pisar una cotización futura (research.md #6) en
      `back/src/modules/ingestion/ingestion.repository.ts` (depende de T019)

**Checkpoint**: User Stories 1 y 2 funcionan juntas de forma independiente (Escenario 2 de
quickstart.md).

---

## Phase 5: User Story 3 - Resiliencia ante falla parcial de la fuente externa (Priority: P3)

**Goal**: Ante la falla de un equipo o liga puntual, el resto de la ingesta se sigue
procesando y persistiendo.

**Independent Test**: Simular la falla de un equipo puntual durante una corrida y verificar
que el resto de equipos/ligas igual queda persistido, con el error logueado.

### Tests for User Story 3

- [X] T021 [P] [US3] Test e2e de resiliencia (mockear falla de un equipo puntual, verificar
      persistencia parcial del resto) en `back/test/ingestion.e2e-spec.ts` (depende de T018
      por compartir el mismo archivo — no correr en paralelo con T018)

### Implementation for User Story 3

- [X] T022 [US3] Reintento con backoff incremental ante 429 (hasta 3 intentos) en
      `FootballDataClient.get()` (`back/src/adapters/football-data/football-data.client.ts`)
      (depende de T008)
- [X] T023 [US3] Try/catch por equipo y por liga en `IngestionService.run()`, logueando con
      `PinoLoggerService` (`back/src/shared/logging/`) y continuando con el resto en
      `back/src/modules/ingestion/ingestion.service.ts` (depende de T015)

**Checkpoint**: Las 3 user stories funcionan de forma independiente (Escenario 3 de
quickstart.md).

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Verificación final transversal a las 3 user stories.

- [X] T024 [P] Revisar que la documentación Swagger de `IngestionController`
      (`back/src/modules/ingestion/ingestion.controller.ts`) coincide con
      `contracts/ingestion.openapi.yaml`
- [X] T025 Ejecutar manualmente los 4 escenarios de `quickstart.md` contra un backend real
      (bootstrap, idempotencia, resiliencia, documentación/trazabilidad) — Escenario 1 corrido
      contra Football-Data.org real: `{"leagues":5,"teams":96,"players":2636}`, 0 fallas
      parciales, verificado también desde `GET /players` (módulo `01-catalogo-jugadores`)
- [X] T026 [P] Revisar que los logs estructurados de una corrida completa siguen el mismo
      formato JSON que `PlayerService` (correlation id incluido)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sin dependencias — arranca de inmediato
- **Foundational (Phase 2)**: depende de Setup — bloquea las 3 user stories
- **User Stories (Phase 3-5)**: dependen todas de Foundational
  - US2 depende de que `IngestionRepository` exista (T014, de US1) — no es independiente en
    el sentido de "se puede construir en paralelo desde cero", pero sí es independientemente
    testeable una vez construida (Escenario 2 de quickstart.md no requiere tocar US3)
  - US3 depende de `FootballDataClient` (T008, Foundational) e `IngestionService.run()`
    (T015, de US1)
- **Polish (Phase 6)**: depende de que US1, US2 y US3 estén completas

### Dentro de cada User Story

- US1: repository → service → controller → module (orden de dependencia real de NestJS DI)
- US2: modifica el mismo `ingestion.repository.ts` de US1, endureciendo create-only a upsert
- US3: modifica `football-data.client.ts` (retry) e `ingestion.service.ts` (try/catch) de
  Foundational/US1, sin tocar el controller

### Parallel Opportunities

- T003, T004, T005 (extender las 3 entidades) en paralelo — archivos distintos
- T007 (DTOs externos) en paralelo con T008 (cliente HTTP) — archivos distintos
- T010 (DTO de resultado) en paralelo con cualquier tarea de Foundational — archivo propio
- T018 y T021 tocan el mismo archivo de test (`ingestion.e2e-spec.ts`) — no correr en
  paralelo entre sí, sí en paralelo con tareas de otras fases que no compartan archivo

---

## Parallel Example: Foundational

```bash
# Lanzar juntas las extensiones de entidad (Phase 2):
Task: "Extender League en back/src/infrastructure/database/entities/league.entity.ts"
Task: "Extender Team en back/src/infrastructure/database/entities/team.entity.ts"
Task: "Extender Player en back/src/infrastructure/database/entities/player.entity.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 únicamente)

1. Completar Phase 1: Setup
2. Completar Phase 2: Foundational (crítico — bloquea todas las stories)
3. Completar Phase 3: User Story 1
4. **Parar y validar**: correr Escenario 1 de `quickstart.md` contra una base vacía
5. Con esto ya hay un catálogo poblado utilizable por `01-catalogo-jugadores`

### Incremental Delivery

1. Setup + Foundational → esquema y cliente HTTP listos
2. User Story 1 → catálogo poblable de cero (MVP)
3. User Story 2 → corridas repetidas dejan de romper por constraint único / duplicar datos
4. User Story 3 → una corrida sobrevive a fallas puntuales de la fuente externa
5. Polish → verificación cruzada de Swagger, logs y los 4 escenarios de quickstart.md

## Notes

- [P] = archivos distintos, sin dependencias pendientes entre sí
- Cada user story es incrementalmente testeable sobre la anterior (no se rompen entre sí)
- Confirmar que T018/T021 (tests e2e) fallan antes de implementar T019/T020/T022/T023
- Evitar: tareas vagías, dos tareas [P] tocando el mismo archivo, dependencias cruzadas entre
  stories que rompan la independencia de prueba

## Notas de implementación (post-ejecución)

- `back/tsconfig.json` recibió `"rootDir": "."` — bug preexistente (`TS5011`) que rompía
  **todo** el test runner del repo (`npm test` y `npm run test:e2e`), no introducido por este
  feature.
- El bloqueo repo-wide de interop ESM/CJS entre Jest y los paquetes ESM-only del proyecto
  (`@nestjs/*`, `@mikro-orm/*`, `axios`, `keyv`, `@keyv/redis`, `cache-manager` — algunos,
  como `@nestjs/common`, usan `import.meta.url`, sin equivalente en CommonJS) **se resolvió**:
  Jest corre ahora en modo ESM real (`node --experimental-vm-modules`, `useESM: true`,
  `module: 'esnext'` + `moduleResolution: 'bundler'` vía override de `ts-jest`, ver
  `back/jest.config.ts` / `back/test/jest-e2e.json`). También se ajustó
  `back/src/infrastructure/database/database.config.ts` (usaba `__dirname`, inexistente bajo
  ESM) y se creó `back/.env.test` (no existía; sin él, `NODE_ENV=test` de Jest hacía que
  `database.config.ts` no cargara ninguna variable de entorno). `back/package.json` agrega
  `--forceExit` a `test:e2e` porque `ObserveModule` (`@nestjs/observe`, con credenciales
  placeholder `YOUR_APP_KEY`/`YOUR_APP_SECRET`) deja un worker reintentando conexión en
  background que no cierra solo — cosmético, no afecta el resultado de los tests.
- `back/test/ingestion.e2e-spec.ts` corre en verde (4 tests) junto con el
  `app.e2e-spec.ts` original (1 test) — 5/5 tests, `npm run build` y `npm run lint` limpios.
- T025: bootstrap real corrido contra Football-Data.org (`.env` con `FOOTBALL_DATA_API_KEY`
  real) — `{"leagues":5,"teams":96,"players":2636}`, 0 fallas parciales, ~11 minutos por el
  rate limit (10 req/min). Confirmado también desde `GET /players` (`01-catalogo-jugadores`).
