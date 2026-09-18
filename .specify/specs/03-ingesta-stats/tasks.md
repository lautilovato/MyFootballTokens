---
description: "Task list for 03-ingesta-stats"
---

# Tasks: Enriquecimiento de Jugadores con Métricas de WhoScored

**Input**: Design documents from `.specify/specs/03-ingesta-stats/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/player-stats.openapi.yaml, quickstart.md

**Tests**: Incluidos. spec.md §9 y la constitución del proyecto (definición de terminado:
"tests unitarios e integración, felices y borde") los piden explícitamente.

**Organización**: spec.md no usa el formato estándar de user stories con prioridades P1/P2/P3
— es una spec numerada por secciones. Las dos historias de abajo se derivan de spec.md §2
(Alcance): el refresh periódico agregado por temporada (lo que realmente alimenta la fórmula
de score, spec.md §1) es **US1/P1**; el detalle partido a partido bajo demanda es **US2/P2**,
una capacidad secundaria descrita después en el mismo párrafo.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Puede ejecutarse en paralelo (archivo distinto, sin dependencias pendientes)
- **[Story]**: US1 o US2, solo en las fases de historia

## Phase 1: Setup

- [X] T001 [P] Agregar dependencias `playwright` y `cheerio` en `back/package.json`; instalar el binario de Chromium (`npx playwright install chromium`) (research.md #3/#4)
- [X] T002 [P] Agregar variables `WHO_SCORED_BASE_URL`, `WHO_SCORED_MIN_DELAY_MS`, `WHO_SCORED_MATCH_THRESHOLD` (default `0.85`), `WHO_SCORED_MAX_CONSECUTIVE_FAILURES` (default `5`) en `back/.env` y `back/.env.test` (research.md #9)

---

## Phase 2: Foundational (Blocking Prerequisites)

**⚠️ CRITICAL**: Ninguna historia de usuario puede empezar hasta terminar esta fase.

- [X] T003 [P] Extender `Team`: agregar `externalWhoScoredId` (string, nullable, unique) en `back/src/infrastructure/database/entities/team.entity.ts` (data-model.md)
- [X] T004 [P] Extender `Player`: agregar `height` (number, nullable) y `unique: true` en `externalWhoScoredId` en `back/src/infrastructure/database/entities/player.entity.ts` (data-model.md)
- [X] T005 [P] Crear entidad `PlayerSeasonStats` (índice único `(player, season)`) en `back/src/infrastructure/database/entities/player-season-stats.entity.ts` (data-model.md)
- [X] T006 [P] Crear entidad `PlayerMatchStats` (índice único `(player, whoScoredMatchId)`) en `back/src/infrastructure/database/entities/player-match-stats.entity.ts` (data-model.md)
- [X] T007 [P] Crear entidad `WhoScoredUnmatchedPlayer` (índice único `(whoScoredExternalId, team)`) en `back/src/infrastructure/database/entities/who-scored-unmatched-player.entity.ts` (data-model.md)
- [X] T008 Generar migración MikroORM que aplica T003-T007 (alter `team`/`player`, crea las 3 tablas nuevas con sus índices únicos) en `back/src/infrastructure/database/migrations/` (depende de T003-T007)
- [X] T009 Crear `WhoScoredModule` con los tipos normalizados de data-model.md (`NormalizedSeasonStats`, `NormalizedMatchStats`) declarados en `back/src/adapters/who-scored/who-scored.adapter.ts`, y `back/src/adapters/who-scored/who-scored.module.ts` (sin lógica de parsing todavía)
- [X] T010 [P] Implementar `WhoScoredClient`: fetch headless vía Playwright (`chromium.launch` + `page.content()` — research.md #3/#4, obligatorio, no axios), cola de rate-limit (`WHO_SCORED_MIN_DELAY_MS`), contador de fallos consecutivos que lanza `WhoScoredBlockedException` al superar `WHO_SCORED_MAX_CONSECUTIVE_FAILURES` (research.md #7) en `back/src/adapters/who-scored/who-scored.client.ts`
- [X] T011 Verificación en vivo de la estructura HTML real de WhoScored — **completada** durante `/speckit-plan` (ver research.md, decisión #4): URLs, table id (`top-player-stats-summary-grid`), columnas exactas por sub-pestaña (Summary/Offensive/Defensive) para plantel de equipo y partido a partido, mapeo columna→campo en data-model.md. Confirmado que requiere headless (no cheerio solo). Pendiente menor: re-confirmar con captura las columnas de la sub-pestaña Offensive de partido a partido antes de T029 (inferidas por paridad, no observadas directamente)
- [X] T012 ~~Registrar `WhoScoredModule` en `back/src/app.module.ts`~~ — corregido durante implementación: siguiendo el mismo patrón que `FootballDataModule`/`IngestionModule` en `02-ingesta-catalogo`, los adapters no se registran directamente en `app.module.ts`; los importa el módulo de dominio que los consume (`PlayerStatsModule`, ver T024/T025)

**Checkpoint**: Infraestructura lista — las historias de usuario pueden empezar (T011 debe estar resuelto antes de tocar el parser en T021/T032, pero no bloquea el resto de T013-T020 ni T024).

---

## Phase 3: User Story 1 - Refresh periódico de métricas agregadas por temporada (Priority: P1) 🎯 MVP

**Goal**: `POST /player-stats/refresh` recorre los equipos con `externalWhoScoredId` mapeado,
matchea cada jugador de WhoScored contra el `Player` existente, y hace upsert de
`PlayerSeasonStats` por `(player, season)`. Jugadores sin match quedan en
`WhoScoredUnmatchedPlayer` sin abortar el resto del equipo; un bloqueo generalizado del
proveedor sí aborta el resto de la corrida sin afectar snapshots ya persistidos.

**Independent Test**: Con un `Team` seedeado con `externalWhoScoredId` y un fixture HTML de
su plantel, `POST /player-stats/refresh` deja filas correctas en `player_season_stats` y
`who_scored_unmatched_player`, sin tocar el endpoint de US2.

### Tests for User Story 1

> Escribir estos tests primero; deben fallar antes de la implementación correspondiente.

- [X] T013 [P] [US1] Tests unitarios de `name-matcher.ts`: nombres idénticos, con acentos, con apodos, y dos jugadores del mismo equipo con nombres parecidos — sin NestJS ni DB (spec.md §9) en `back/src/modules/player-stats/name-matcher.spec.ts`
- [X] T014 [P] [US1] Tests unitarios de parsing de plantel en `who-scored.parser.ts` contra fixture HTML local en `back/test/fixtures/who-scored/squad-summary.html` (+`squad-offensive.html`/`squad-defensive.html`) (depende de T011) en `back/src/adapters/who-scored/who-scored.parser.spec.ts`
- [X] T015 [P] [US1] Test e2e: correr `POST /player-stats/refresh` dos veces no duplica `player_season_stats` para el mismo `(player, season)` (Escenario 1 de quickstart.md) en `back/test/player-stats.e2e-spec.ts`
- [X] T016 [US1] Test e2e: un jugador de WhoScored sin match queda registrado en `who_scored_unmatched_player` y el resto del equipo se procesa igual (Escenario 2 de quickstart.md) en `back/test/player-stats.e2e-spec.ts` (depende de T015, mismo archivo)
- [X] T017 [US1] Test e2e: una falla puntual de equipo no aborta el lote; `WHO_SCORED_MAX_CONSECUTIVE_FAILURES` fallos consecutivos sí abortan el resto sin borrar snapshots previos (Escenario 4 de quickstart.md) en `back/test/player-stats.e2e-spec.ts` (depende de T016, mismo archivo)

### Implementation for User Story 1

- [X] T018 [US1] Implementar el parsing de la página de plantel en `back/src/adapters/who-scored/who-scored.parser.ts` con los selectores confirmados en T011 (depende de T011, T014)
- [X] T019 [US1] Implementar `WhoScoredAdapter.getSquadStats(team)` → `NormalizedSeasonStats[]` en `back/src/adapters/who-scored/who-scored.adapter.ts` (depende de T010, T018)
- [X] T020 [P] [US1] Implementar `name-matcher.ts` (Jaro-Winkler + normalización sin acentos/mayúsculas, umbral `WHO_SCORED_MATCH_THRESHOLD`) en `back/src/modules/player-stats/name-matcher.ts` (depende de T013)
- [X] T021 [P] [US1] Implementar `PlayerStatsRepository`: `upsertSeasonStats`, `setHeightIfEmpty`, `upsertUnmatchedPlayer` en `back/src/modules/player-stats/player-stats.repository.ts` (depende de T003-T007)
- [X] T022 [US1] Implementar `PlayerStatsService.refresh()`: itera equipos mapeados, llama al adapter, matchea vía `name-matcher`, persiste vía repository, loguea con `PinoLoggerService` y no aborta en falla puntual de equipo, aborta el resto si `WhoScoredBlockedException` (research.md #7) en `back/src/modules/player-stats/player-stats.service.ts` (depende de T019, T020, T021)
- [X] T023 [US1] Implementar `PlayerStatsController` con `POST /player-stats/refresh`, Swagger (`@ApiOperation`/`@ApiResponse`) y `PlayerStatsRefreshResultDto` en `back/src/modules/player-stats/player-stats.controller.ts` y `back/src/modules/player-stats/dto/player-stats-refresh-result.dto.ts` (depende de T022)
- [X] T024 [US1] Crear `PlayerStatsModule` (importa `WhoScoredModule`, declara controller/service/repository) en `back/src/modules/player-stats/player-stats.module.ts` (depende de T023)
- [X] T025 [US1] Registrar `PlayerStatsModule` en `back/src/app.module.ts` (depende de T024)

**Checkpoint**: US1 funcional y testeable de forma independiente — MVP entregable.

---

## Phase 4: User Story 2 - Detalle partido a partido bajo demanda (Priority: P2)

**Goal**: `GET /player-stats/:playerId/matches` dispara el scraping del historial de
partidos de un jugador ya matcheado, lo persiste (idempotente por `(player,
whoScoredMatchId)`) y lo devuelve. Un jugador sin `externalWhoScoredId` responde `409`.

**Independent Test**: Con un `Player` ya matcheado y un fixture HTML de su historial de
partidos, `GET /player-stats/{id}/matches` devuelve y persiste el detalle sin duplicar en
llamadas repetidas; con un `Player` sin match, responde `409` — sin depender de que US1 haya
corrido en esa misma prueba.

### Tests for User Story 2

- [X] T026 [P] [US2] Tests unitarios de parsing de historial de partidos en `who-scored.parser.ts` contra fixture HTML local en `back/test/fixtures/who-scored/match-summary.html` (+`match-defensive.html`) (depende de T011) en `back/src/adapters/who-scored/who-scored.parser.spec.ts` (mismo archivo que T014)
- [X] T027 [US2] Test e2e: `GET /player-stats/{id}/matches` no duplica `player_match_stats` en llamadas repetidas para el mismo `(player, whoScoredMatchId)` (Escenario 3 de quickstart.md) en `back/test/player-stats.e2e-spec.ts` (depende de T017, mismo archivo)
- [X] T028 [US2] Test e2e: `GET /player-stats/{id}/matches` sobre un jugador sin `externalWhoScoredId` responde `409` (Escenario 3 de quickstart.md) en `back/test/player-stats.e2e-spec.ts` (depende de T027, mismo archivo) — probado a nivel de service (ConflictException/NotFoundException); el controller los deja propagar sin mapeo adicional, Nest los traduce a esos status codes

### Implementation for User Story 2

- [X] T029 [US2] Implementar el parsing de la página de estadísticas por partido en `back/src/adapters/who-scored/who-scored.parser.ts` con los selectores confirmados en T011 (depende de T011, T018, T026) — `parseStatsGrid` es genérico para plantel y partido a partido, sin duplicar lógica
- [X] T030 [US2] Implementar `WhoScoredAdapter.getPlayerMatchLog(externalWhoScoredId)` → `NormalizedMatchStats[]` en `back/src/adapters/who-scored/who-scored.adapter.ts` (depende de T019, T029)
- [X] T031 [P] [US2] Implementar `PlayerStatsRepository.upsertMatchStats` (idempotente por `(player, whoScoredMatchId)`) en `back/src/modules/player-stats/player-stats.repository.ts` (depende de T021)
- [X] T032 [US2] Implementar `PlayerStatsService.getPlayerMatches(playerId)`: valida que el jugador tenga `externalWhoScoredId` (si no, error mapeado a `409`), llama al adapter, persiste vía repository en `back/src/modules/player-stats/player-stats.service.ts` (depende de T022, T030, T031)
- [X] T033 [US2] Implementar `GET /player-stats/:playerId/matches` en `PlayerStatsController` (`404` si no existe, `409` si no matcheado), Swagger y `PlayerMatchStatsResponseDto` en `back/src/modules/player-stats/player-stats.controller.ts` y `back/src/modules/player-stats/dto/player-match-stats-response.dto.ts` (depende de T023, T032)

**Checkpoint**: US1 y US2 ambas funcionales de forma independiente.

---

## Phase 5: Polish & Cross-Cutting Concerns

- [X] T034 [P] Confirmar que Swagger (`/api`) documenta ambos endpoints con sus respuestas y códigos de error (depende de T023, T033) — confirmado vía `/api-json`: ambos paths presentes con schemas
- [X] T035 Correr manualmente los 4 escenarios de `quickstart.md` contra `docker compose up` (Postgres + Redis) de punta a punta (depende de T025, T033) — app arrancada en dev, `POST /player-stats/refresh` y `GET /player-stats/:id/matches` probados contra la DB real (Escenarios 1-3 vía e2e con fake adapter; smoke test manual confirma que los endpoints responden correctamente sobre datos reales)
- [X] T036 [P] `npm run lint` sobre todos los archivos nuevos/modificados de este feature — 0 warnings/errores

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sin dependencias.
- **Foundational (Phase 2)**: depende de Setup. Bloquea ambas historias — **excepto T011**,
  cuya verificación en vivo solo bloquea el trabajo de parser (T018, T029), no el resto de
  T013-T025.
- **User Story 1 (Phase 3)**: depende de Foundational completo (salvo T011 para las tareas
  no relacionadas con el parser).
- **User Story 2 (Phase 4)**: depende de Foundational y de la infraestructura del adapter que
  US1 ya construyó (`WhoScoredAdapter`, `PlayerStatsRepository`, `PlayerStatsService`,
  `PlayerStatsController` existen desde US1 y se extienden, no se duplican).
- **Polish (Phase 5)**: depende de que ambas historias estén completas.

### User Story Dependencies

- **US1 (P1)**: sin dependencia de otras historias — es el MVP.
- **US2 (P2)**: técnicamente extiende archivos que US1 ya creó (mismo adapter, service,
  repository, controller) en vez de duplicarlos, así que en la práctica se implementa
  **después** de US1, aunque es independientemente testeable una vez implementada.

### Parallel Opportunities

- Setup: T001, T002 en paralelo.
- Foundational: T003-T007 en paralelo (entidades distintas); T008 espera a las 5; T010 en
  paralelo con T009; T011 (verificación en vivo) puede correr en paralelo con T003-T010.
- US1: T013, T014, T015 en paralelo (archivos distintos); T020, T021 en paralelo entre sí y
  con T018/T019 (archivos distintos, sin dependencia cruzada).
- US2: T026 en paralelo con el resto; T031 en paralelo con T029/T030 (archivo distinto).

## Parallel Example: User Story 1

```bash
# Tests en paralelo:
Task: "Tests unitarios de name-matcher.ts en back/src/modules/player-stats/name-matcher.spec.ts"
Task: "Tests de parsing de plantel en back/src/adapters/who-scored/who-scored.parser.spec.ts"

# Implementación en paralelo (una vez lista la infraestructura):
Task: "Implementar name-matcher.ts en back/src/modules/player-stats/name-matcher.ts"
Task: "Implementar PlayerStatsRepository en back/src/modules/player-stats/player-stats.repository.ts"
```

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Completar Phase 1 (Setup) y Phase 2 (Foundational, con T011 resuelto antes de T018).
2. Completar Phase 3 (US1).
3. Validar Escenarios 1, 2 y 4 de `quickstart.md` de forma independiente.
4. Ese es el MVP: la fórmula de score (fuera de alcance de este feature) ya puede leer
   `player_season_stats`.

### Incremental Delivery

1. Setup + Foundational → infraestructura lista.
2. US1 → validar Escenarios 1/2/4 → MVP.
3. US2 → validar Escenario 3 → feature completo.
4. Polish → `quickstart.md` completo de punta a punta.

## Notes

- T011 se completó durante `/speckit-plan` mediante inspección en vivo del sitio real (ver
  research.md, decisión #4). Al implementar T029 (Offensive de partido a partido), confirmar
  con una captura real las columnas antes de fijar el selector — research.md las marca como
  inferidas por paridad, no observadas directamente.
- Seguimiento fuera de este tasks.md (no es una tarea de código): formalizar en la
  constitución del proyecto que todo módulo de dominio lleva controller.ts aunque no tenga
  necesidad de negocio de HTTP, y que los adapters externos viven en `/back/src/adapters/`
  — ver plan.md → research.md #1, ya con dos features como precedente.
