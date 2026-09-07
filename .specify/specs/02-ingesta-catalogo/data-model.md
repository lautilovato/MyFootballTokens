# Data Model: Ingesta de Catálogo de Jugadores

## Entidad: `League` (extiende la existente)

**Ubicación:** `/back/src/infrastructure/database/entities/league.entity.ts` (ya existe,
requiere modificación).

| Campo | Tipo | Notas |
|---|---|---|
| `id` | `number` (serial) | Ya existe. Sin cambios. |
| `name` | `string`, unique | Ya existe. Sin cambios. |
| `country` | `string` | Ya existe. Sin cambios. |
| `externalId` | `number`, unique | **Nuevo.** Id de `Competition` en Football-Data.org. |
| `code` | `string`, unique | **Nuevo.** Código de liga usado para pedir datos ("PL"/"BL1"/"PD"/"SA"/"FL1"). |
| `teams` | `OneToMany<Team>` | Ya existe. Sin cambios. |

## Entidad: `Team` (extiende la existente)

**Ubicación:** `/back/src/infrastructure/database/entities/team.entity.ts` (ya existe,
requiere modificación).

| Campo | Tipo | Notas |
|---|---|---|
| `id` | `number` (serial) | Ya existe. Sin cambios. |
| `name` | `string` | Ya existe. Sin cambios. |
| `league` | `ManyToOne<League>` | Ya existe. Sin cambios. |
| `externalId` | `number`, unique | **Nuevo.** Id de `Team` en Football-Data.org. |
| `shortName` | `string`, nullable | **Nuevo.** |
| `tla` | `string`, nullable | **Nuevo.** |
| `crestUrl` | `string`, nullable | **Nuevo.** |
| `players` | `OneToMany<Player>` | Ya existe. Sin cambios. |

## Entidad: `Player` (extiende la existente)

**Ubicación:** `/back/src/infrastructure/database/entities/player.entity.ts` (ya existe,
requiere modificación — ver [[research]] decisiones 3, 4 y 6).

| Campo | Tipo | Notas |
|---|---|---|
| `id` | `uuid` | Ya existe. Sin cambios. |
| `fullName` | `string` | Ya existe. Recibe el `name` de la API (research #3 — no se agregan `firstName`/`lastName`). |
| `position` | enum `PlayerPosition` | **Cambia:** se agrega el valor `UNKNOWN` (`GK`\|`DF`\|`MF`\|`FW`\|`UNKNOWN`). Requiere migración del check constraint. |
| `externalWhoScoredId` | `string`, nullable | Ya existe. Sin cambios — reservado para la spec de scraping de WhoScored. |
| `externalFootballDataId` | `string`, nullable | **Cambia:** se agrega índice único (research #4). Clave de idempotencia de esta feature. |
| `dateOfBirth` | `date`, nullable | **Nuevo.** |
| `nationality` | `string`, nullable | **Nuevo.** |
| `shirtNumber` | `number`, nullable | **Nuevo.** |
| `baseValue` | `decimal(10,2)` | Ya existe. Sin cambio de forma — nueva regla de negocio: default `'0.00'` solo al crear (research #6). |
| `team` | `ManyToOne<Team>` | Ya existe. Sin cambios. |
| `createdAt` / `updatedAt` | `Date` | Ya existen. Sin cambios. |

### Mapeo de `position` (API externa → enum)

| Valor de la API | `PlayerPosition` |
|---|---|
| `Goalkeeper` | `GK` |
| `Defence` | `DF` |
| `Midfield` | `MF` |
| `Offence` | `FW` |
| `null` / no reconocido | `UNKNOWN` |

### Reglas de idempotencia (upsert)

| Entidad | Clave de upsert |
|---|---|
| `League` | `code` |
| `Team` | `externalId` |
| `Player` | `externalFootballDataId` |

- `baseValue` se setea **solo** en el `create` (`'0.00'`); el `update` de un `Player` ya
  existente nunca reescribe este campo (research #6 — evita pisar una cotización futura).
- Un índice único permite múltiples `NULL` en PostgreSQL, así que `externalFootballDataId`
  puede quedar sin valor para jugadores cargados por otra vía sin romper el constraint.

### Relaciones (sin cambios respecto al esquema actual)
- `Player.team` → `Team` (N:1)
- `Team.league` → `League` (N:1)
- `Team.players` → `Player[]` (1:N, inverso)
- `League.teams` → `Team[]` (1:N, inverso)

### Transiciones de estado
No aplica a nivel de entidad. El "estado" de una corrida de ingesta (en curso / finalizada)
no se persiste — una corrida concurrente con otra queda como limitación conocida (ver
spec.md, Edge Cases).

## DTOs

### Externos — internos a la capa Adapter (`/back/src/adapters/football-data/dtos/`, nunca expuestos fuera de esa capa)

| DTO | Campos |
|---|---|
| `FootballDataCompetitionDto` | `id`, `code`, `name`, `area.name` |
| `FootballDataTeamDto` | `id`, `name`, `shortName`, `tla`, `crest`, `squad: FootballDataSquadMemberDto[]` |
| `FootballDataSquadMemberDto` | `id`, `firstName`, `lastName`, `name`, `position`, `dateOfBirth`, `nationality`, `shirtNumber` |

### `IngestionResultDto` (respuesta de `POST /ingestion/players`, en `/back/src/modules/ingestion/dto/`)

| Campo | Tipo |
|---|---|
| `leagues` | `number` |
| `teams` | `number` |
| `players` | `number` |

## Casos límite reflejados en el modelo
- `position` nulo o no reconocido → `UNKNOWN`, el jugador no se descarta (spec.md FR-004).
- Falla puntual de liga/equipo → no bloquea el resto del upsert de esa misma corrida
  (spec.md FR-010).
- Reingesta de un jugador existente → `baseValue` no se toca; el resto de los campos
  (`fullName`, `position`, `dateOfBirth`, `nationality`, `shirtNumber`, `team`) se
  actualizan con el valor más reciente de la API.
