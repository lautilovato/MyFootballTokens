# Quickstart: Validación del Matching Automático de Equipos con WhoScored

## Prerrequisitos

- `02-ingesta-catalogo` ya corrida (`POST /ingestion/players`) — necesita `League`/`Team`
  poblados con datos reales de Football-Data.org.
- `03-ingesta-stats` ya implementada — reusa `WhoScoredClient`, `WhoScoredAdapter`,
  `WhoScoredParser` y el `name-matcher` (relocado a `/back/src/shared/matching/`).
- `docker compose up` (Postgres + Redis).
- Sin variables de entorno nuevas — reusa `WHO_SCORED_MATCH_THRESHOLD` y
  `WHO_SCORED_MAX_CONSECUTIVE_FAILURES` ya definidas en `03-ingesta-stats`.

## Setup

```bash
cd back
npm run start:dev
```

## Escenario 1: Completar el mapeo de una liga con equipos sin match (User Story 1)

1. Confirmar que al menos una liga (ej. LaLiga) tiene `Team` sin `externalWhoScoredId`.
2. `POST /team-whoscored-matching/refresh`.
3. Verificar en la respuesta: `leaguesProcessed` incluye esa liga, `teamsMatched > 0`.
4. Verificar en base: los equipos cuyo nombre coincide claramente con uno de la tabla de
   posiciones de WhoScored ahora tienen `externalWhoScoredId` seteado al id real (verificable
   navegando a `https://www.whoscored.com/teams/{id}` y confirmando que es el equipo
   correcto).

## Escenario 2: No pisar un equipo ya mapeado a mano (User Story 2)

1. Confirmar que un `Team` (ej. Barcelona, id 65) ya tiene `externalWhoScoredId` seteado
   manualmente.
2. `POST /team-whoscored-matching/refresh`.
3. Verificar que el `externalWhoScoredId` de ese equipo no cambió.
4. Verificar que ese equipo no generó ninguna entrada en la cola de revisión.

## Escenario 3: Idempotencia — correrlo dos veces no rompe ni duplica nada (User Story 3)

1. `POST /team-whoscored-matching/refresh` (primera corrida).
2. Anotar `teamsMatched`, contar filas en `who_scored_unmatched_team`.
3. `POST /team-whoscored-matching/refresh` (segunda corrida, sin cambios de datos de por
   medio).
4. Verificar: `teamsMatched` en la segunda corrida es `0` (no queda nada nuevo por matchear),
   el conteo de `who_scored_unmatched_team` no cambió, y ningún `Team.externalWhoScoredId`
   cambió de valor.

## Escenario 4: Resiliencia ante falla de una liga puntual

1. Simular (en test, con un fake del adapter) que una liga falla al obtener su tabla de
   posiciones.
2. `POST /team-whoscored-matching/refresh`.
3. Verificar que las demás ligas de la corrida se procesaron igual, y la falla quedó
   logueada con `PinoLoggerService`.

## Criterio de éxito

- Los 4 escenarios pasan sin tocar la base manualmente entre pasos (solo vía el endpoint).
- `name-matcher.spec.ts` sigue pasando sin cambios desde su nueva ubicación
  (`/back/src/shared/matching/`).
- Swagger documenta `POST /team-whoscored-matching/refresh`.
