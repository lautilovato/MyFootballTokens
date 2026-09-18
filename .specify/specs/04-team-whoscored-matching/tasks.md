---
description: "Task list for 04-team-whoscored-matching"
---

# Tasks: Matching Automático de Equipos con WhoScored

**Input**: Design documents from `.specify/specs/04-team-whoscored-matching/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/team-whoscored-matching.openapi.yaml, quickstart.md

**Tests**: Incluidos, mismo criterio que `03-ingesta-stats` (definición de terminado del
proyecto: tests unitarios e integración).

**Organización**: spec.md usa el formato estándar de user stories con prioridades. Las 3
historias son sucesivas garantías de correctitud sobre la **misma** operación de refresh (no
3 endpoints distintos) — por eso US2 y US3 son mayormente tests que verifican garantías ya
construidas correctamente en US1, no código nuevo.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Puede ejecutarse en paralelo (archivo distinto, sin dependencias pendientes)
- **[Story]**: US1, US2 o US3, solo en las fases de historia

## Phase 1: Foundational (Blocking Prerequisites)

**⚠️ CRITICAL**: Ninguna historia de usuario puede empezar hasta terminar esta fase. Sin
dependencias nuevas que instalar (research.md — reusa `playwright`/`cheerio` ya presentes),
así que no hay una fase de Setup separada.

- [X] T001 [P] Mover `name-matcher.ts` y `name-matcher.spec.ts` de `back/src/modules/player-stats/` a `back/src/shared/matching/`; actualizar el import en `back/src/modules/player-stats/player-stats.service.ts` al nuevo path. El algoritmo y los tests no cambian (research.md #5) — `name-matcher.spec.ts` debe seguir pasando igual desde la nueva ubicación (también se actualizó `player-stats.repository.ts`, que importaba `MatchCandidate` del mismo archivo)
- [X] T002 [P] Crear entidad `WhoScoredUnmatchedTeam` (índice único `(whoScoredExternalId, league)`) en `back/src/infrastructure/database/entities/who-scored-unmatched-team.entity.ts` (data-model.md)
- [X] T003 Generar y aplicar la migración MikroORM que crea `who_scored_unmatched_team` en `back/src/infrastructure/database/migrations/` (depende de T002)
- [X] T004 [P] Implementar `WhoScoredClient.fetchRenderedPage(url): Promise<string>` (navega, espera `table[id^="standings-"]`, devuelve `page.content()`, reusa el mismo `BrowserContext`/cola de rate-limit/contador de fallos) en `back/src/adapters/who-scored/who-scored.client.ts` (research.md #2) — refactoreado `fetchStatsTabs`/`fetchRenderedPage` sobre un `enqueue`/`guarded` común para no duplicar la lógica de cola/fallos; el selector de espera es un parámetro (`readySelector`) en vez de hardcodear "standings-" en el cliente genérico
- [X] T005 [P] Implementar `WhoScoredParser.parseStandingsGrid(html): StandingsRow[]` (descarta filas sin `<a href="/teams/...">`, extrae `href`/nombre del `<a>`) en `back/src/adapters/who-scored/who-scored.parser.ts` (research.md #3) — devuelve `{href, label}` (no un `NormalizedStanding` ya armado), consistente con cómo `parseStatsGrid` deja la extracción de id al adapter
- [X] T006 Implementar `WhoScoredAdapter.getLeagueStandings(whoScoredPath): Promise<NormalizedStanding[]>` en `back/src/adapters/who-scored/who-scored.adapter.ts` (depende de T004, T005)
- [X] T007 [P] Crear el esqueleto de `TeamWhoScoredMatchingModule` (module/controller/dto vacíos, sin lógica todavía) en `back/src/modules/team-whoscored-matching/` — implementado directo con lógica real junto con T012-T014 (repository→service→controller necesitan existir juntos para compilar; ver Notes)
- [X] T008 Registrar `TeamWhoScoredMatchingModule` en `back/src/app.module.ts` (depende de T007)

**Checkpoint**: Infraestructura lista — las historias de usuario pueden empezar.

---

## Phase 2: User Story 1 - Completar automáticamente el mapeo de una liga (Priority: P1) 🎯 MVP

**Goal**: `POST /team-whoscored-matching/refresh` recorre las ligas con al menos un `Team`
sin `externalWhoScoredId`, obtiene la tabla de posiciones de esa liga en WhoScored, matchea
por nombre contra los `Team` pendientes de esa liga, persiste el id real para los que
matchean por encima del umbral, y registra en `WhoScoredUnmatchedTeam` los que no.

**Independent Test**: Con una liga con `Team` sin mapear y un fake/fixture de la tabla de
posiciones de esa liga, `POST /team-whoscored-matching/refresh` deja los equipos con nombre
claramente coincidente mapeados, y el resto en la cola de revisión — sin tocar nada de
jugadores ni de stats.

### Tests for User Story 1

> Escribir estos tests primero; deben fallar antes de la implementación correspondiente.

- [X] T009 [P] [US1] Test unitario de `parseStandingsGrid` contra un fixture HTML local nuevo en `back/test/fixtures/who-scored/standings.html` (basado en la estructura real confirmada en research.md #1: 3 filas de encabezado sin link, filas de datos con `<a href="/teams/{id}/show/{slug}">{nombre}</a>`) en `back/src/adapters/who-scored/who-scored.parser.spec.ts` (extiende el archivo existente; depende de T005)
- [X] T010 [P] [US1] Test e2e: en una liga con `Team` sin mapear, `POST /team-whoscored-matching/refresh` deja mapeados los equipos con nombre coincidente por encima del umbral (Escenario 1 de quickstart.md) en `back/test/team-whoscored-matching.e2e-spec.ts` (nuevo, con un fake `WhoScoredAdapter` — mismo patrón que `player-stats.e2e-spec.ts`)
- [X] T011 [US1] Test e2e: un equipo de la tabla de posiciones sin ningún candidato por encima del umbral queda registrado en `who_scored_unmatched_team` (Escenario 1, segunda parte) en `back/test/team-whoscored-matching.e2e-spec.ts` (depende de T010, mismo archivo)

### Implementation for User Story 1

- [X] T012 [P] [US1] Implementar `TeamWhoScoredMatchingRepository`: `findTeamsWithoutMapping(league)` (excluye equipos con `externalWhoScoredId` no nulo — WHERE explícito, FR-002), `linkWhoScoredId(team, id)`, `upsertUnmatchedTeam(league, whoScoredExternalId, whoScoredName, bestSimilarity)` en `back/src/modules/team-whoscored-matching/team-whoscored-matching.repository.ts` (depende de T002) — se agregó además `findLinkedWhoScoredIds()` (research.md #8b, encontrado corriendo contra el catálogo real)
- [X] T013 [US1] Implementar `TeamWhoScoredMatchingService.refresh()`: constante `LEAGUE_WHOSCORED_PATHS` (research.md #4, las 5 URLs verificadas en vivo), itera ligas con `Team` pendientes (salta sin request las que no tienen — Edge Cases de spec.md), llama a `WhoScoredAdapter.getLeagueStandings`, matchea vía `name-matcher` compartido (candidatos de esa liga, sacando de la lista en memoria a los ya matcheados en esta misma corrida — research.md #7), persiste vía repository, loguea con `PinoLoggerService`, y no aborta el resto de las ligas si una falla (FR-008) en `back/src/modules/team-whoscored-matching/team-whoscored-matching.service.ts` (depende de T001, T006, T012) — se agregó un filtro por `findLinkedWhoScoredIds()` antes de matchear cada fila (research.md #8b)
- [X] T014 [US1] Implementar `POST /team-whoscored-matching/refresh` en `TeamWhoScoredMatchingController` con Swagger (`@ApiOperation`/`@ApiResponse`) y `TeamWhoScoredMatchingResultDto` en `back/src/modules/team-whoscored-matching/team-whoscored-matching.controller.ts` y `back/src/modules/team-whoscored-matching/dto/team-whoscored-matching-result.dto.ts` (depende de T013)

**Checkpoint**: US1 funcional y testeable de forma independiente — MVP entregable.

---

## Phase 3: User Story 2 - No pisar mapeos ya cargados (Priority: P2)

**Goal**: Ningún `Team` con `externalWhoScoredId` ya seteado (a mano o de una corrida
anterior) se toca, se re-evalúa, ni genera una entrada de revisión.

**Independent Test**: En una liga con una mezcla de equipos ya mapeados y sin mapear, correr
`POST /team-whoscored-matching/refresh` y verificar que los ya mapeados no cambian de valor
ni aparecen en la cola de revisión.

### Tests for User Story 2

- [X] T015 [US2] Test e2e: un `Team` con `externalWhoScoredId` ya seteado no cambia de valor ni genera entrada en `who_scored_unmatched_team` al correr `POST /team-whoscored-matching/refresh` (Escenario 2 de quickstart.md) en `back/test/team-whoscored-matching.e2e-spec.ts` (depende de T011, mismo archivo)

**Checkpoint**: US1 y US2 funcionan juntas — esta garantía ya está construida por el `WHERE`
explícito de T012 (FR-002); esta fase es solo la verificación dedicada.

---

## Phase 4: User Story 3 - Re-ejecutable sin romper ni duplicar nada (Priority: P3)

**Goal**: Correr el proceso dos veces seguidas sobre el mismo estado no duplica entradas de
revisión ni altera equipos ya matcheados; una liga que falla no aborta las demás.

**Independent Test**: Correr `POST /team-whoscored-matching/refresh` dos veces seguidas sin
cambios de datos de por medio y verificar que la segunda corrida no agrega duplicados ni
modifica nada ya resuelto.

### Tests for User Story 3

- [X] T016 [US3] Test e2e: correr `POST /team-whoscored-matching/refresh` dos veces seguidas no duplica `who_scored_unmatched_team` ni cambia ningún `Team` ya matcheado (Escenario 3 de quickstart.md) en `back/test/team-whoscored-matching.e2e-spec.ts` (depende de T015, mismo archivo)
- [X] T017 [US3] Test e2e: una falla al obtener la tabla de posiciones de una liga puntual no aborta el procesamiento de las demás ligas de la misma corrida (Escenario 4 de quickstart.md) en `back/test/team-whoscored-matching.e2e-spec.ts` (depende de T016, mismo archivo) — se agregó además un test de bloqueo generalizado, análogo a 03-ingesta-stats

**Checkpoint**: Las 3 historias pasan — igual que US2, la idempotencia y la resiliencia ya
están construidas en T012 (upsert por índice único) y T013 (try/catch por liga); esta fase es
la verificación dedicada.

---

## Phase 5: Polish & Cross-Cutting Concerns

- [X] T018 [P] Confirmar que Swagger (`/api`) documenta `POST /team-whoscored-matching/refresh` con su respuesta (depende de T014) — confirmado vía `/api-json`
- [X] T019 Correr manualmente los 4 escenarios de `quickstart.md` contra `docker compose up` (Postgres + Redis) de punta a punta (depende de T008, T014) — corrido contra el catálogo real completo (96 equipos, 5 ligas) y el WhoScored real, no solo fixtures: encontró y permitió arreglar 2 bugs reales (research.md #8) invisibles en tests con fakes. Resultado final estable en 2 corridas seguidas: 71/96 equipos mapeados, 25 en revisión (casos genuinamente ambiguos), 0 falsos positivos, `teamsMatched: 0` en la segunda corrida
- [X] T020 [P] `npm run lint` sobre todos los archivos nuevos/modificados de este feature — 0 warnings/errores

---

## Dependencies & Execution Order

### Phase Dependencies

- **Foundational (Phase 1)**: sin dependencias externas (sin deps nuevas que instalar).
  Bloquea las 3 historias.
- **User Story 1 (Phase 2)**: depende de Foundational completo. Es el único que agrega
  código de negocio nuevo — MVP.
- **User Story 2 (Phase 3)**: depende de que T012 (con su `WHERE` explícito) ya exista —
  en la práctica, depende de US1 completo, aunque conceptualmente es una garantía
  independiente que podría testear cualquiera con acceso al repository.
- **User Story 3 (Phase 4)**: depende de US1 (upsert idempotente) y del mismo archivo e2e
  que US2 extiende.
- **Polish (Phase 5)**: depende de que las 3 historias estén completas.

### Parallel Opportunities

- Foundational: T001, T002, T004, T005, T007 en paralelo (archivos distintos, sin
  dependencias cruzadas entre sí); T003 espera a T002; T006 espera a T004+T005; T008 espera
  a T007.
- US1: T009 y T010 en paralelo (archivos distintos); T012 en paralelo con T009/T010 (archivo
  propio, solo depende de Foundational).
- Polish: T018 y T020 en paralelo.

## Parallel Example: Foundational

```bash
Task: "Mover name-matcher.ts a back/src/shared/matching/"
Task: "Crear entidad WhoScoredUnmatchedTeam en back/src/infrastructure/database/entities/who-scored-unmatched-team.entity.ts"
Task: "Implementar WhoScoredClient.fetchRenderedPage en back/src/adapters/who-scored/who-scored.client.ts"
Task: "Implementar WhoScoredParser.parseStandingsGrid en back/src/adapters/who-scored/who-scored.parser.ts"
Task: "Crear el esqueleto de TeamWhoScoredMatchingModule en back/src/modules/team-whoscored-matching/"
```

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Completar Phase 1 (Foundational).
2. Completar Phase 2 (US1).
3. Validar Escenario 1 de `quickstart.md` de forma independiente — ya es un MVP útil: completa
   el mapeo de equipos sin intervención manual.

### Incremental Delivery

1. Foundational → infraestructura lista.
2. US1 → validar Escenario 1 → MVP.
3. US2 → validar Escenario 2 (no pisa lo ya cargado).
4. US3 → validar Escenarios 3 y 4 (idempotencia + resiliencia).
5. Polish → `quickstart.md` completo de punta a punta.

## Notes

- A diferencia de `03-ingesta-stats`, acá no hay una tarea de verificación en vivo pendiente
  como T011 de esa spec — research.md #1 ya la resolvió durante `/speckit-plan` (las 5 URLs
  de liga y la estructura de la tabla de posiciones están confirmadas contra el sitio real).
- T001 (mover `name-matcher.ts`) es la única tarea que toca un archivo de `03-ingesta-stats`
  — es una relocación de archivo sin cambio de contenido, no una reapertura de esa spec (ver
  research.md #5).
- Durante T019 se encontró que `back/.env`/`back/.env.test` apuntaban a la misma base
  (`player_market`) — correr `test:e2e` de punta a punta borró el catálogo real dos veces en
  esta sesión (una antes de esta feature, otra durante T010). Se separó `.env.test` a una
  base propia (`player_market_test`, creada y migrada) — el catálogo real se restauró desde
  un `pg_dump` tomado antes del segundo incidente. Los archivos e2e de `02`/`03` (que no
  limpian completo en su `afterAll`) ya no representan riesgo para datos reales gracias a
  este cambio, pero `team-whoscored-matching.e2e-spec.ts` igual limpia FK-safe completo por
  las dudas (ver su `cleanDatabase()`).
- research.md #8 documenta dos bugs reales (no cosméticos) encontrados recién al correr
  contra el catálogo completo y el sitio real — ninguno apareció en tests con fakes ni en la
  verificación en vivo de páginas aisladas durante `/speckit-plan`. Ambos ya corregidos y
  cubiertos por tests.
