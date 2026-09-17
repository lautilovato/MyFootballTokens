# Implementation Plan: Enriquecimiento de Jugadores con Métricas de WhoScored

**Branch**: `03-ingesta-stats` | **Date**: 2026-09-16 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/.specify/specs/03-ingesta-stats/spec.md`

## Summary

Enriquecer los `Player` ya cargados (por `02-ingesta-catalogo`) con métricas de rendimiento
scrapeadas de WhoScored, para alimentar la fórmula de score del documento de visión. Dos
piezas nuevas de infraestructura: (1) la segunda capa **Adapter** del proyecto
(`/back/src/adapters/who-scored/`), con cliente HTTP + parser HTML (`cheerio`) + matching de
nombres propio (Jaro-Winkler, sin dependencia nueva), aislados detrás de tipos normalizados;
(2) el módulo de dominio `/back/src/modules/player-stats/`, que orquesta el refresh periódico
agregado por temporada y el detalle partido a partido bajo demanda. Dos preguntas que la
propia spec deja explícitamente sin resolver (estructura real del HTML de WhoScored, y cómo
ubicar la página de plantel de cada equipo) **no se inventan acá** — ver research.md,
decisiones #4 y #5, y la sección "Verificaciones pendientes antes de implementar".

## Technical Context

**Language/Version**: TypeScript 6 (`strict: true`), target ES2023 (Node.js LTS) — sin
cambios respecto a `02-ingesta-catalogo`.

**Primary Dependencies**: NestJS 12, MikroORM 7 (`@mikro-orm/postgresql`), `@nestjs/swagger`,
`@nestjs/axios` + `axios` (reusados, solo para Football-Data.org). Nuevas: `playwright`
(fetch headless de WhoScored — obligatorio, no opcional, ver research.md #3/#4: la tabla de
stats es client-side-rendered, no anti-bot) y `cheerio` (parsing del HTML ya renderizado).
Sin librería de similitud de strings (research.md #6).

**Storage**: PostgreSQL (mismo `docker-compose.yml`, puerto 5433). Redis no participa de este
feature (research.md #8 — ningún endpoint es una lectura cacheable, ambos disparan
scraping/escritura).

**Testing**: Jest (`back/jest.config.ts`, `back/test/jest-e2e.json`), mismo setup. El parser
se prueba contra fixtures HTML locales, el matching de nombres sin NestJS ni DB (spec.md §9).

**Target Platform**: Servidor Node.js (API REST NestJS), directorio `/back`.

**Project Type**: web-service (backend-only; no hay frontend en este feature).

**Performance Goals**: sin objetivo de latencia por request — gobernado por
`WHO_SCORED_MIN_DELAY_MS` entre requests a WhoScored, igual patrón que el rate limit de
Football-Data.org en `02`.

**Constraints**: una falla puntual de equipo/jugador no aborta el lote; un bloqueo
generalizado del proveedor sí lo aborta (detectable vía contador de fallos consecutivos,
research.md #7); no se duplica un `PlayerSeasonStats` por `(player, season)` ni un
`PlayerMatchStats` por `(player, whoScoredMatchId)`.

**Scale/Scope**: mismo universo que `02-ingesta-catalogo` (~2500-3000 jugadores, ~100-140
equipos), acotado en la práctica a los equipos con `Team.externalWhoScoredId` ya mapeado
(research.md #5 — el mapeo automático equipo→WhoScored queda fuera de esta spec).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Regla de la constitución | Cumplimiento planeado |
|---|---|
| Stack estricto (TS, NestJS, PostgreSQL, MikroORM, Redis, Swagger) | ✅ Dependencias nuevas son `playwright` (fetch headless, obligatorio por research #3/#4) y `cheerio` (parsing) — ninguna sustituye ni contradice el stack fijado. |
| Capas Controller/Service/Repository/Adapter | ✅ Segundo uso de la capa **Adapter** (`who-scored.client.ts` + `who-scored.parser.ts` + `who-scored.adapter.ts`), aislado de `player-stats.service.ts` (orquestación + matching) y `player-stats.repository.ts` (persistencia). |
| Entidades solo en `/infrastructure/database/entities/` | ✅ `player-season-stats.entity.ts`, `player-match-stats.entity.ts`, `who-scored-unmatched-player.entity.ts` nuevas ahí; `player.entity.ts`/`team.entity.ts` se extienden in-place. Ninguna entidad dentro de `/adapters/` ni `/modules/`. |
| Módulo de dominio con estructura fija (`.module/.controller/.service/.repository/dto/`) | ✅ `/back/src/modules/player-stats/` con exactamente esos archivos, más `name-matcher.ts` (función pura, sin Nest/DB — no es una capa nueva, documentado en research.md #6). Resuelve la pregunta abierta de spec.md §7.1 (research.md #1). |
| Documentación Swagger obligatoria en todos los endpoints | ✅ `POST /player-stats/refresh` y `GET /player-stats/:playerId/matches` documentados (Phase 1 contracts + tarea de implementación). |
| Redis obligatorio para consultas frecuentes | N/A — ver research.md #8: ningún endpoint de este feature es una lectura cacheable; ambos disparan scraping/escritura, igual razonamiento que `02-ingesta-catalogo`. |
| Resiliencia a fallas de APIs externas | ✅ Requisito central (spec.md §6): falla puntual de equipo se loguea y no aborta; datos ya persistidos en corridas anteriores siguen disponibles si WhoScored no responde. |
| Logs estructurados + trazabilidad | ✅ Se reutiliza `PinoLoggerService`, mismo patrón que `IngestionService`/`FootballDataClient`. |
| Validación estricta de inputs vía DTOs | ✅ `playerId` (path param) validado; el body de ninguno de los dos endpoints recibe input de usuario a validar. Las respuestas de WhoScored se normalizan vía el adapter, no vía `class-validator` (dato de proveedor externo, no input de usuario — mismo criterio que `02`). |
| No mocks si hay instrucción de usar Adapter/MikroORM | ✅ `WhoScoredClient` hace requests HTTP reales; `PlayerStatsRepository` usa MikroORM real. El parser se testea contra fixtures HTML locales (no contra un mock del propio parser), consistente con spec.md §9. |

**Resultado del gate:** PASA. Sin violaciones que requieran justificación en Complexity
Tracking. Dos verificaciones de datos externos (no decisiones de arquitectura) quedan
explícitamente pendientes antes de implementar el parser — ver research.md, "Verificaciones
pendientes antes de implementar".

## Project Structure

### Documentation (this feature)

```text
.specify/specs/03-ingesta-stats/
├── plan.md                          # Este archivo
├── research.md                      # Phase 0 output
├── data-model.md                    # Phase 1 output
├── quickstart.md                    # Phase 1 output
├── contracts/
│   └── player-stats.openapi.yaml
└── tasks.md                         # Phase 2 output (/speckit-tasks, no generado por /speckit-plan)
```

### Source Code (repository root)

```text
back/
├── src/
│   ├── infrastructure/
│   │   └── database/
│   │       ├── entities/
│   │       │   ├── player.entity.ts                  # MODIFICAR: + height, unique en externalWhoScoredId
│   │       │   ├── team.entity.ts                     # MODIFICAR: + externalWhoScoredId
│   │       │   ├── player-season-stats.entity.ts      # NUEVA
│   │       │   ├── player-match-stats.entity.ts       # NUEVA
│   │       │   └── who-scored-unmatched-player.entity.ts  # NUEVA
│   │       └── migrations/
│   │           └── <nueva>.ts                          # NUEVA: alter player/team + create 3 tablas
│   ├── adapters/
│   │   └── who-scored/                                 # NUEVO (segundo adapter del proyecto)
│   │       ├── who-scored.module.ts
│   │       ├── who-scored.client.ts       # Playwright headless + rate limit + contador de fallos consecutivos (research #3, #7)
│   │       ├── who-scored.parser.ts       # cheerio sobre el HTML renderizado; selectores confirmados en research #4
│   │       ├── who-scored.adapter.ts      # orquesta client+parser, expone tipos normalizados (data-model.md)
│   │       └── dtos/
│   │           ├── squad-page.dto.ts      # placeholder hasta verificación en vivo
│   │           └── match-log.dto.ts       # placeholder hasta verificación en vivo
│   ├── modules/
│   │   └── player-stats/                               # NUEVO módulo (vertical slice)
│   │       ├── player-stats.module.ts
│   │       ├── player-stats.controller.ts # POST /player-stats/refresh, GET /player-stats/:playerId/matches
│   │       ├── player-stats.service.ts    # orquesta matching + resiliencia (research #1, #7)
│   │       ├── player-stats.repository.ts # upserts vía MikroORM (data-model.md, idempotencia)
│   │       ├── name-matcher.ts            # Jaro-Winkler puro, sin Nest/DB (research #6)
│   │       └── dto/
│   │           ├── player-stats-refresh-result.dto.ts
│   │           └── player-match-stats-response.dto.ts
│   └── app.module.ts                       # MODIFICAR: importar WhoScoredModule + PlayerStatsModule
└── test/
    ├── player-stats.e2e-spec.ts            # NUEVO: cubre los 4 escenarios de quickstart.md
    └── fixtures/who-scored/                 # NUEVO: páginas HTML locales para testear el parser
```

**Structure Decision**: Mismo backend único en `/back`, mismo vertical slicing y misma
convención de `/adapters/` que `02-ingesta-catalogo` — segunda vez que se agrega un proveedor
externo, sin motivo para una estructura distinta (research.md #2). `name-matcher.ts` es el
único archivo que se sale de la lista fija `module/controller/service/repository/dto` de la
constitución; se justifica en research.md #6 (función pura, testeable sin NestJS/DB, no es
una capa ni un directorio nuevo).

## Complexity Tracking

*Sin violaciones — tabla no aplica.*
