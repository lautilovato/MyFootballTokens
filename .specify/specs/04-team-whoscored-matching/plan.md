# Implementation Plan: Matching Automático de Equipos con WhoScored

**Branch**: `04-team-whoscored-matching` | **Date**: 2026-09-16 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `.specify/specs/04-team-whoscored-matching/spec.md`

## Summary

Completar automáticamente `Team.externalWhoScoredId` para los equipos ya cargados desde
Football-Data.org, comparando por liga la tabla de posiciones de WhoScored contra los `Team`
de esa liga sin mapear. Reusa integralmente la infraestructura de `03-ingesta-stats`
(`WhoScoredClient`, `WhoScoredAdapter`, `WhoScoredParser`, `name-matcher.ts`) — el único
trabajo nuevo es: (1) dos métodos nuevos en el cliente/parser de WhoScored ya existentes para
la tabla de posiciones (research.md #1-#3), (2) relocar `name-matcher.ts` a
`/back/src/shared/matching/` para que un módulo de dominio nuevo pueda importarlo sin violar
el aislamiento entre módulos (research.md #5), y (3) el módulo de dominio propio
`team-whoscored-matching` (controller/service/repository/dto + la nueva cola de revisión
`WhoScoredUnmatchedTeam`). No se toca ninguna regla ni comportamiento de `03-ingesta-stats`.

## Technical Context

**Language/Version**: TypeScript 6 (`strict: true`), target ES2023 (Node.js LTS) — sin
cambios.

**Primary Dependencies**: NestJS 12, MikroORM 7, `@nestjs/swagger`, `playwright`, `cheerio`
— todas ya presentes desde `03-ingesta-stats`. **Ninguna dependencia nueva.**

**Storage**: PostgreSQL (mismo esquema/puerto). Nueva tabla `who_scored_unmatched_team`
(mismo patrón que `who_scored_unmatched_player`). Redis no aplica — mismo razonamiento que
`03-ingesta-stats` (el único endpoint dispara un proceso de escritura, no una lectura
cacheable).

**Testing**: Jest, mismo setup. `name-matcher.spec.ts` se muda de ubicación sin cambios de
contenido (research.md #5) — debe seguir pasando igual. `parseStandingsGrid` se prueba contra
un fixture HTML local, mismo criterio que el resto del parser de WhoScored.

**Target Platform**: Servidor Node.js (API REST NestJS), `/back`.

**Project Type**: web-service (backend-only).

**Performance Goals**: sin objetivo de latencia por request — hasta 5 requests a WhoScored
por corrida completa (una por liga con equipos pendientes), gobernadas por
`WHO_SCORED_MIN_DELAY_MS` ya existente.

**Constraints**: nunca sobrescribir un `Team.externalWhoScoredId` ya seteado (manual o
automático); una falla al obtener la tabla de posiciones de una liga puntual no aborta las
demás; correr el proceso repetidas veces no debe duplicar ni alterar nada ya resuelto.

**Scale/Scope**: hasta 5 ligas, ~100 equipos totales la primera vez que se corre contra un
catálogo recién cargado.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Regla de la constitución | Cumplimiento planeado |
|---|---|
| Stack estricto (TS, NestJS, PostgreSQL, MikroORM, Redis, Swagger) | ✅ Sin dependencias nuevas — reusa exactamente el stack ya usado en `03-ingesta-stats`. |
| Capas Controller/Service/Repository/Adapter | ✅ Tercer módulo de dominio del proyecto (`team-whoscored-matching`) con controller/service/repository propios; reusa la capa Adapter existente de WhoScored (`/back/src/adapters/who-scored/`), extendida con 2 métodos nuevos — no se crea un adapter nuevo para el mismo proveedor. |
| Entidades solo en `/infrastructure/database/entities/` | ✅ `who-scored-unmatched-team.entity.ts` nueva ahí; `team.entity.ts`/`league.entity.ts` no cambian de forma. |
| Módulo de dominio con estructura fija (`.module/.controller/.service/.repository/dto/`) | ✅ `/back/src/modules/team-whoscored-matching/` con exactamente esos archivos — a diferencia de `player-stats`, esta feature **no** necesita un archivo de utilidad pura propio (reusa el `name-matcher` compartido), así que ni siquiera necesita invocar la excepción de la constitución v1.1.0. |
| `controller.ts` obligatorio aunque no haya necesidad de negocio de HTTP directa | ✅ `POST /team-whoscored-matching/refresh`, mismo patrón de disparo manual que `ingestion` y `player-stats` (constitución v1.1.0, sección 7). |
| Capa de Adapters en `/back/src/adapters/<proveedor>/` | ✅ Se extiende el adapter de WhoScored ya existente — mismo proveedor, no se duplica la capa (constitución v1.1.0, "Capa de Adapters"). |
| Documentación Swagger obligatoria en todos los endpoints | ✅ `POST /team-whoscored-matching/refresh` documentado (Phase 1 contracts + tarea de implementación). |
| Redis obligatorio para consultas frecuentes | N/A — mismo razonamiento que `03-ingesta-stats`: el único endpoint dispara un proceso de escritura/matching, no una lectura cacheable. |
| Resiliencia a fallas de APIs externas | ✅ Requisito central de la spec (FR-008): falla al obtener la tabla de posiciones de una liga no aborta las demás. |
| Logs estructurados + trazabilidad | ✅ Reusa `PinoLoggerService`, mismo patrón que el resto del proyecto. |
| No mocks si hay instrucción de usar Adapter/MikroORM | ✅ `WhoScoredClient`/`WhoScoredAdapter` reales; `TeamWhoScoredMatchingRepository` usa MikroORM real. El parser se testea contra un fixture HTML local, no contra un mock del propio parser. |
| Validación estricta de inputs vía DTOs | N/A — `POST /team-whoscored-matching/refresh` no recibe body ni query params (mismo criterio que `POST /ingestion/players` y `POST /player-stats/refresh` en `03-ingesta-stats`). |

**Resultado del gate:** PASA. No hay violaciones que requieran justificación en Complexity
Tracking. Un cambio estructural en código existente (mover `name-matcher.ts`) se documenta
en research.md #5 y no altera ninguna regla de `03-ingesta-stats`.

## Project Structure

### Documentation (this feature)

```text
.specify/specs/04-team-whoscored-matching/
├── plan.md                          # Este archivo
├── research.md                      # Phase 0 output
├── data-model.md                    # Phase 1 output
├── quickstart.md                    # Phase 1 output
├── contracts/
│   └── team-whoscored-matching.openapi.yaml
└── tasks.md                         # Phase 2 output (/speckit-tasks, no generado por /speckit-plan)
```

### Source Code (repository root)

```text
back/
├── src/
│   ├── infrastructure/
│   │   └── database/
│   │       ├── entities/
│   │       │   └── who-scored-unmatched-team.entity.ts   # NUEVA
│   │       └── migrations/
│   │           └── <nueva>.ts                              # NUEVA: create who_scored_unmatched_team
│   ├── shared/
│   │   └── matching/                                       # NUEVO directorio (compartido entre módulos)
│   │       ├── name-matcher.ts                             # MOVIDO desde modules/player-stats/ (sin cambios de contenido)
│   │       └── name-matcher.spec.ts                        # MOVIDO junto con el archivo anterior
│   ├── adapters/
│   │   └── who-scored/                                     # EXISTENTE — se extiende, no se duplica
│   │       ├── who-scored.client.ts       # + fetchRenderedPage(url) (research #2)
│   │       ├── who-scored.parser.ts       # + parseStandingsGrid(html) (research #3)
│   │       └── who-scored.adapter.ts      # + getLeagueStandings(path) → NormalizedStanding[]
│   ├── modules/
│   │   ├── player-stats/
│   │   │   └── player-stats.service.ts    # MODIFICAR: import de name-matcher apunta a shared/matching/
│   │   └── team-whoscored-matching/        # NUEVO módulo (vertical slice)
│   │       ├── team-whoscored-matching.module.ts
│   │       ├── team-whoscored-matching.controller.ts # POST /team-whoscored-matching/refresh
│   │       ├── team-whoscored-matching.service.ts    # orquesta por liga (research #7)
│   │       ├── team-whoscored-matching.repository.ts # upserts vía MikroORM
│   │       └── dto/
│   │           └── team-whoscored-matching-result.dto.ts
│   └── app.module.ts                       # MODIFICAR: importar TeamWhoScoredMatchingModule
└── test/
    ├── team-whoscored-matching.e2e-spec.ts  # NUEVO: cubre los 4 escenarios de quickstart.md
    └── fixtures/who-scored/
        └── standings.html                    # NUEVO: fixture para parseStandingsGrid
```

**Structure Decision**: Tercer módulo de dominio del proyecto (`ingestion`, `player-stats`,
ahora `team-whoscored-matching`), mismo patrón vertical-slice. La capa Adapter de WhoScored
se extiende en lugar de duplicarse (es el mismo proveedor externo). `name-matcher.ts` pasa a
`/back/src/shared/` porque ahora lo usan dos módulos de dominio distintos — es la primera vez
que el proyecto necesita compartir una utilidad pura entre dominios, y `/back/src/shared/`
ya es el lugar establecido para ese tipo de código (`shared/logging/`).

## Complexity Tracking

*Sin violaciones — tabla no aplica.*
