# Quickstart: Validación del Enriquecimiento de Jugadores con WhoScored

## Prerrequisitos

- `02-ingesta-catalogo` ya corrida (`POST /ingestion/players`) — necesita `League`/`Team`/
  `Player` poblados.
- Al menos un `Team.externalWhoScoredId` seteado a mano en la base (ver research.md
  decisión #5 — este feature no resuelve ese mapeo automáticamente).
- Selectores reales del parser confirmados contra el sitio en vivo (research.md,
  "Verificaciones pendientes") — sin esto, `POST /player-stats/refresh` no puede tener éxito
  contra WhoScored real; los escenarios de abajo pueden validarse igual contra fixtures HTML
  locales (spec.md §9).
- `docker compose up` (Postgres + Redis, mismo `back/docker-compose.yml`).
- Variables de entorno nuevas en `.env`: `WHO_SCORED_BASE_URL`, `WHO_SCORED_MIN_DELAY_MS`,
  `WHO_SCORED_MATCH_THRESHOLD` (default `0.85`), `WHO_SCORED_MAX_CONSECUTIVE_FAILURES`
  (default `5`).

## Setup

```bash
cd back
npm install         # agrega cheerio
npm run start:dev
```

## Escenario 1: Refresh periódico sobre equipos mapeados

1. Confirmar que al menos un `Team` tiene `externalWhoScoredId` seteado.
2. `POST /player-stats/refresh`.
3. Verificar en la respuesta: `teamsProcessed` incluye ese equipo, `teamsSkipped` cuenta los
   equipos sin mapeo.
4. Verificar en base: cada jugador matcheado de ese equipo tiene una fila en
   `player_season_stats` para la temporada actual, con las 7 métricas obligatorias no nulas.
5. Repetir el mismo `POST /player-stats/refresh` — el conteo de filas en
   `player_season_stats` para esos jugadores/temporada no cambia (upsert, no duplica).

## Escenario 2: Jugador sin match queda registrado, no descartado

1. Con un equipo cuyo plantel de WhoScored incluya un jugador que no tenga contraparte
   razonable en el `Player` ya cargado (o cuya similitud caiga bajo `WHO_SCORED_MATCH_THRESHOLD`).
2. `POST /player-stats/refresh`.
3. Verificar `playersUnmatched > 0` en la respuesta.
4. Verificar en base: existe una fila en `who_scored_unmatched_player` para ese jugador y
   equipo — el resto del equipo se procesó igual (sin abortar).

## Escenario 3: Detalle partido a partido bajo demanda

1. Tomar el `id` de un `Player` ya matcheado (con `externalWhoScoredId` no nulo).
2. `GET /player-stats/{playerId}/matches`.
3. Verificar: `200`, `matches` no vacío, cada entrada con `whoScoredMatchId` único.
4. Repetir la misma llamada — no se duplican filas en `player_match_stats` para el mismo
   `(player, whoScoredMatchId)`.
5. Repetir con un `Player` sin `externalWhoScoredId` → `409`.

## Escenario 4: Resiliencia ante falla parcial y bloqueo generalizado

1. Falla puntual: simular (en test, con el fixture/mock del cliente) que un equipo puntual
   falla al obtener su plantel → el resto de los equipos de la corrida se sigue procesando,
   y la falla queda logueada con `PinoLoggerService`.
2. Bloqueo generalizado: simular `WHO_SCORED_MAX_CONSECUTIVE_FAILURES` fallos consecutivos →
   `POST /player-stats/refresh` aborta el resto de la corrida (no sigue reintentando
   indefinidamente) y lo refleja en la respuesta/logs; los `player_season_stats` de corridas
   anteriores siguen disponibles sin cambios.

## Criterio de éxito

- Los 4 escenarios pasan sin tocar la base manualmente entre pasos (solo vía los endpoints).
- Las reglas de matching (spec.md §4) están cubiertas por tests unitarios de
  `name-matcher.ts` sin NestJS ni base de datos real (spec.md §9).
- El parser se prueba contra páginas guardadas localmente, nunca contra el sitio real en
  cada corrida de tests (spec.md §9).
- Swagger (`/api` o el path configurado) documenta ambos endpoints con sus respuestas.
