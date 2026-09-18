# Data Model: Matching Automático de Equipos con WhoScored

## Entidad: `Team` (sin cambios de forma)

Ya tiene `externalWhoScoredId` (`string`, nullable, unique) desde `03-ingesta-stats`. Esta
feature solo completa ese campo para los registros que lo tienen vacío — nunca lo modifica
si ya tiene un valor (FR-002).

## Entidad: `League` (sin cambios de forma)

Se usa de solo lectura para agrupar los `Team` a matchear — el matching es siempre dentro de
una misma liga (research.md #1: la tabla de posiciones de WhoScored es por liga). El mapeo
`League.code` → URL de WhoScored es una constante de código (research.md #4), no una columna
nueva.

## Entidad: `WhoScoredUnmatchedTeam` (nueva)

Cola de revisión manual para equipos — mismo criterio que `WhoScoredUnmatchedPlayer` de
`03-ingesta-stats`, pero a nivel de equipo. Vive en
`/back/src/infrastructure/database/entities/who-scored-unmatched-team.entity.ts`.

| Campo | Tipo | Notas |
|---|---|---|
| `id` | `uuid` (PK) | |
| `whoScoredExternalId` | `string` | Id numérico del equipo en WhoScored (del `href`). |
| `whoScoredName` | `string` | Nombre tal cual aparece en la tabla de posiciones (sin normalizar). |
| `league` | `ManyToOne(League)` | Liga en la que apareció el candidato — contexto para la revisión. |
| `bestCandidateSimilarity` | `decimal(4,3)`, nullable | Score del mejor `Team` candidato encontrado, si alguno superó 0 pero no el umbral. `null` si no había ningún `Team` sin mapear en esa liga para comparar. |
| `createdAt` | `Date` | |

**Índice único:** `(whoScoredExternalId, league)` — una corrida repetida no duplica la
entrada de revisión de un mismo equipo de WhoScored en la misma liga (idempotencia, FR-007).

## Relación con `name-matcher.ts` (relocado, no reimplementado)

`findBestMatch(whoScoredName, candidates, threshold)` se reusa sin cambios (research.md #5).
Los `candidates` acá son los `Team` de la liga sin `externalWhoScoredId` (en vez de los
`Player` de un equipo); el resto de la firma y el comportamiento (incluyendo el desempate
"no matchear si hay ambigüedad" de spec.md §4.3) son idénticos.

## Tipos normalizados (adapter)

```ts
interface NormalizedStanding {
  whoScoredTeamId: string;
  whoScoredName: string;
}
```

Salida de `WhoScoredAdapter.getLeagueStandings(whoScoredPath: string): Promise<NormalizedStanding[]>`
— un array por liga, un elemento por fila de la tabla de posiciones (research.md #1, #3).

## DTO de respuesta (`/back/src/modules/team-whoscored-matching/dto/`)

`TeamWhoScoredMatchingResultDto`:

```ts
{
  leaguesProcessed: number; // ligas con al menos un Team sin mapear, procesadas
  leaguesSkipped: number;   // ligas donde todos los Team ya tenían externalWhoScoredId
  teamsMatched: number;     // Team con externalWhoScoredId seteado en esta corrida
  teamsUnmatched: number;   // filas de WhoScored registradas en la cola de revisión
}
```

## Reglas de idempotencia

- `Team.externalWhoScoredId`: solo se escribe si está `null` — nunca se sobrescribe
  (FR-002, SC-002).
- `WhoScoredUnmatchedTeam`: upsert por `(whoScoredExternalId, league)` — no duplica la
  entrada de revisión en corridas repetidas (FR-007, SC-003).
- Una liga con cero `Team` pendientes se salta sin generar ningún request a WhoScored
  (Edge Cases de spec.md, SC-004 aplicado a nivel liga).

## Casos límite reflejados en el modelo

- Liga sin equipos pendientes → no genera request, no genera filas nuevas en ninguna tabla.
- Falla al obtener la tabla de posiciones de una liga → se loguea, se continúa con las
  demás ligas de la corrida (no se persiste nada para esa liga en esa corrida).
- Dos filas de la tabla de posiciones de WhoScored matchean con el mismo `Team` candidato en
  la misma corrida → gana la primera fila procesada (research.md #7); la segunda fila se
  evalúa contra el resto de candidatos restantes y, si no hay otro por encima del umbral,
  esa fila (no el `Team`) va a la cola de revisión.
- Un equipo aparece más de una vez en la tabla de posiciones → no aplica en la práctica (cada
  equipo tiene exactamente una fila en una tabla de posiciones estándar), pero si ocurriera,
  el segundo intento de match para el mismo `whoScoredTeamId` no duplica nada porque el
  primero ya habría actualizado el `Team` (que sale de la lista de candidatos) o ya habría
  quedado registrado en la cola de revisión (upsert idempotente).
