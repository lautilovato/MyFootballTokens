# Data Model: Enriquecimiento de Jugadores con Métricas de WhoScored

## Entidad: `Player` (extiende la existente)

| Campo | Cambio | Notas |
|---|---|---|
| `externalWhoScoredId` | Ya existe (`string`, nullable) — se le agrega `unique` vía migración | Clave de matching (research.md #1 de `02`, mismo patrón que `externalFootballDataId`). Un índice único permite múltiples `NULL`. |
| `height` | **NUEVO** (`number`, cm, nullable) | Atributo del jugador, no de temporada (spec.md §3) — se completa una sola vez, nunca se repite por snapshot. |

No se agregan las columnas "deseables" (intercepciones, faltas, despejes, tarjetas,
porcentaje de pases) hasta confirmar su disponibilidad real (spec.md §10.2, research.md
"Verificaciones pendientes").

## Entidad: `Team` (extiende la existente)

| Campo | Cambio | Notas |
|---|---|---|
| `externalWhoScoredId` | **NUEVO** (`string`, nullable, unique) | Mapeo manual equipo → página de plantel de WhoScored (research.md #5). El refresh periódico solo procesa equipos con este campo poblado. |

## Entidad: `PlayerSeasonStats` (nueva)

Snapshot agregado por jugador y temporada, con refresh periódico. Vive en
`/back/src/infrastructure/database/entities/player-season-stats.entity.ts`.

| Campo | Tipo | Notas |
|---|---|---|
| `id` | `uuid` (PK) | Igual patrón que `Player.id`. |
| `player` | `ManyToOne(Player)` | |
| `season` | `string` | Formato `"YYYY-YYYY"` (p. ej. `"2025-2026"`), igual notación que usa WhoScored. |
| `goals` | `number` | Obligatorio (spec.md §3). |
| `assists` | `number` | Obligatorio. |
| `shotsPerGame` | `decimal(4,2)` | Obligatorio. |
| `keyPasses` | `decimal(4,2)` | Obligatorio. |
| `dribbles` | `decimal(4,2)` | Obligatorio. |
| `tackles` | `decimal(4,2)` | Obligatorio. |
| `rating` | `decimal(4,2)` | Obligatorio. |
| `lastRefreshedAt` | `Date` | Timestamp del último refresh exitoso de este snapshot. |
| `createdAt` / `updatedAt` | `Date` | Igual patrón que `Player`. |

**Índice único:** `(player, season)` — un refresh sobre un (jugador, temporada) ya existente
hace `UPDATE`, nunca `INSERT` duplicado (spec.md §9, criterio de aceptación).

## Entidad: `PlayerMatchStats` (nueva)

Detalle partido a partido, poblado bajo demanda para un jugador puntual (no por el refresh
periódico). Vive en el mismo directorio que la anterior.

| Campo | Tipo | Notas |
|---|---|---|
| `id` | `uuid` (PK) | |
| `player` | `ManyToOne(Player)` | |
| `whoScoredMatchId` | `string` | Id de partido en WhoScored — clave de idempotencia. |
| `matchDate` | `date` | Necesario para poder ordenar/mostrar el historial; sin esto "partido a partido" no es utilizable. |
| `season` | `string` | Mismo formato que `PlayerSeasonStats.season`, para poder filtrar el historial por temporada. |
| `goals` | `number` | Mismas 7 métricas obligatorias, a nivel de un partido. |
| `assists` | `number` | |
| `shots` | `number` | (equivalente puntual de `shotsPerGame`, ya no es un promedio). |
| `keyPasses` | `number` | |
| `dribbles` | `number` | |
| `tackles` | `number` | |
| `rating` | `decimal(4,2)` | |
| `createdAt` | `Date` | |

**Índice único:** `(player, whoScoredMatchId)` — evita duplicar un partido si se vuelve a
pedir el detalle del mismo jugador.

## Entidad: `WhoScoredUnmatchedPlayer` (nueva)

Cola de revisión manual (spec.md §4.4: "todo jugador de WhoScored sin match automático debe
quedar registrado para revisión manual, no descartado silenciosamente"). Este feature solo
persiste el registro — no construye una pantalla ni un endpoint de revisión (fuera de
alcance, ver spec.md §2).

| Campo | Tipo | Notas |
|---|---|---|
| `id` | `uuid` (PK) | |
| `whoScoredExternalId` | `string` | Id del jugador en WhoScored. |
| `whoScoredName` | `string` | Nombre tal cual aparece en WhoScored (sin normalizar), para que quien revise lo reconozca. |
| `team` | `ManyToOne(Team)` | Equipo en el que apareció el candidato — contexto para la revisión. |
| `bestCandidateSimilarity` | `decimal(4,3)`, nullable | Score del mejor candidato encontrado, si alguno superó 0 pero no el umbral (spec.md §4.3). `null` si no hubo ningún candidato en el equipo. |
| `createdAt` | `Date` | |

**Índice único:** `(whoScoredExternalId, team)` — un refresh repetido sobre el mismo equipo
no duplica la entrada de revisión de un jugador ya registrado como sin match.

### Mapeo de `season`

WhoScored no comparte IDs con Football-Data.org ni tiene concepto de temporada en el
esquema actual. `season` se deriva en el adapter (`who-scored.adapter.ts`) a partir del
selector de temporada/torneo visible en la página (`<select>` con opciones tipo "Premier
League" que internamente referencia una temporada) — confirmado en vivo (research.md,
decisión #4) que la tabla de plantel no expone el año de temporada como columna propia, sino
que la temporada activa se toma del contexto de la página (selector superior). El adapter
fija `season` a partir de ese contexto al momento del scrape, no de una columna de la tabla.

### Columnas reales de WhoScored → campos normalizados

Confirmado en vivo (research.md, decisión #4). El parser lee las 3 sub-pestañas (Summary,
Offensive, Defensive) de la misma tabla `#top-player-stats-summary-grid` y combina sus
columnas por fila de jugador/partido:

| Campo normalizado | Columna WhoScored | Sub-pestaña |
|---|---|---|
| `goals` | `Goals` | Summary |
| `assists` | `Assists` | Summary |
| `shotsPerGame` (snapshot) / `shots` (match) | `SpG` (snapshot) / `Shots` (match) | Summary |
| `keyPasses` | `KeyP` | Offensive |
| `dribbles` | `Drb` | **Offensive** (¡no Defensive — ahí `Drb` significa "driblado en contra", la métrica opuesta!) |
| `tackles` | `Tackles` | Defensive |
| `rating` | `Rating` | Summary (idéntico en Offensive/Defensive) |
| `height` | `CM` | Summary (tabla de plantel de equipo únicamente) |

### Reglas de idempotencia (upsert)

- `PlayerSeasonStats`: upsert por `(player, season)` — refresh periódico siempre actualiza,
  nunca inserta un duplicado para la misma temporada.
- `PlayerMatchStats`: upsert por `(player, whoScoredMatchId)` — pedir el detalle del mismo
  jugador dos veces no duplica partidos ya persistidos.
- `WhoScoredUnmatchedPlayer`: upsert por `(whoScoredExternalId, team)` — no se vuelve a
  insertar la misma entrada de revisión en cada corrida mientras siga sin match.
- `Player.height`: se persiste solo si viene un valor y el campo está vacío — igual regla
  que `baseValue` en `02-ingesta-catalogo` (no se pisa un dato ya cargado por otra vía).

### Relaciones (resumen)

```
League 1──* Team 1──* Player 1──* PlayerSeasonStats
                            └──* PlayerMatchStats
                Team 1──* WhoScoredUnmatchedPlayer
```

### Transiciones de estado

- Un jugador de WhoScored pasa de "candidato sin evaluar" → "match automático" (se persiste
  `Player.externalWhoScoredId` si estaba vacío) **o** → "registrado para revisión"
  (`WhoScoredUnmatchedPlayer`), nunca ambos.
- Un `PlayerSeasonStats` no tiene estados — cada refresh es un upsert completo de las 7
  métricas obligatorias.

## DTOs

### Internos al adapter — nunca expuestos fuera de `/back/src/adapters/who-scored/`

- `WhoScoredSquadPageDto` — shape crudo de la página de plantel (definitivo recién tras la
  verificación en vivo pendiente).
- `WhoScoredMatchLogDto` — shape crudo de la página de estadísticas por partido.

### Normalizados — salida del adapter, únicos tipos que conoce `player-stats.service.ts`

```ts
interface NormalizedSeasonStats {
  whoScoredPlayerId: string;
  whoScoredName: string;
  season: string;
  goals: number;
  assists: number;
  shotsPerGame: number;
  keyPasses: number;
  dribbles: number;
  tackles: number;
  rating: number;
  height: number | null;
}

interface NormalizedMatchStats {
  whoScoredMatchId: string;
  matchDate: string; // ISO date
  season: string;
  goals: number;
  assists: number;
  shots: number;
  keyPasses: number;
  dribbles: number;
  tackles: number;
  rating: number;
}
```

### De respuesta (`/back/src/modules/player-stats/dto/`)

- `PlayerStatsRefreshResultDto`: `{ teamsProcessed: number; teamsSkipped: number; playersUpdated: number; playersUnmatched: number }`.
- `PlayerMatchStatsResponseDto`: lista de `NormalizedMatchStats` ya persistidos para el
  jugador pedido (más `playerId`, `playerName` para contexto).

## Casos límite reflejados en el modelo

- Equipo sin `externalWhoScoredId`: no genera error, se cuenta en `teamsSkipped`.
- Jugador sin match automático: no bloquea el resto del equipo, genera una fila en
  `WhoScoredUnmatchedPlayer` en vez de una excepción.
- Bloqueo generalizado (research.md #7): aborta el resto de la corrida de `POST
  /player-stats/refresh`, pero no borra ni invalida los snapshots ya persistidos en corridas
  anteriores (spec.md §6 — los datos ya persistidos siguen disponibles).
- `GET /player-stats/:playerId/matches` sobre un jugador sin `externalWhoScoredId`: 409/422
  (no se puede scrapear un jugador no matcheado) — definido en el contrato.
