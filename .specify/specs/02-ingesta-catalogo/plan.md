# Implementation Plan: Ingesta de Catálogo de Jugadores desde Football-Data.org

**Branch**: `02-ingesta-catalogo` | **Date**: 2026-09-07 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/.specify/specs/02-ingesta-catalogo/spec.md`

## Summary

Poblar `League`/`Team`/`Player` (ya existentes en `/back`, hoy solo consumidos de forma
read-only por `01-catalogo-jugadores`) desde Football-Data.org, vía un bootstrap manual
disparado por `POST /ingestion/players`. El trabajo principal no es modelar entidades nuevas
sino: (1) **extender** las 3 entidades existentes con los campos que la fuente externa
requiere (no redefinirlas — ver spec.md, Key Entities), (2) construir la primera capa
**Adapters** del proyecto (`/back/src/adapters/football-data/`), aislando cliente HTTP +
normalización de la API externa, (3) construir el módulo de dominio `/back/src/modules/
ingestion/` que orquesta liga → equipos → planteles con upsert idempotente. Ver
[research.md](./research.md) para el detalle de cada decisión.

## Technical Context

**Language/Version**: TypeScript 6 (`strict: true`), target ES2023 (Node.js LTS) — sin
cambios respecto a `01-catalogo-jugadores`.

**Primary Dependencies**: NestJS 12, MikroORM 7 (`@mikro-orm/postgresql`), `@nestjs/swagger`
y `class-validator`/`class-transformer` ya instalados por el feature anterior. Nueva para
este feature: `@nestjs/axios` + `axios` (cliente HTTP hacia Football-Data.org — ver
research.md #1). No se agregan `@nestjs/config`, `@nestjs/schedule` ni `uuid` (research.md
#2, #7 y spec.md Assumptions).

**Storage**: PostgreSQL (mismo `docker-compose.yml`, puerto 5433). Redis no participa de
este feature (no hay endpoint de lectura que cachear — ver Constitution Check).

**Testing**: Jest (`back/jest.config.ts`, `back/test/jest-e2e.json`), mismo setup que
`01-catalogo-jugadores`.

**Target Platform**: Servidor Node.js (API REST NestJS), directorio `/back`.

**Project Type**: web-service (backend-only; no hay frontend en este feature).

**Performance Goals**: no aplica un objetivo de latencia por request — es un proceso batch
disparado manualmente. El objetivo es de throughput controlado: completar el bootstrap de
las 5 ligas (~100+ requests a Football-Data.org) sin exceder el rate limit del plan free.

**Constraints**: el rate limit externo (10 req/min configurable) gobierna la duración total
de la corrida; toda persistencia debe ser idempotente (upsert); una falla puntual de liga o
equipo no debe abortar el resto del proceso (requisito de la constitución, sección 3).

**Scale/Scope**: 5 ligas, ~100-140 equipos, del orden de 2500-3000 jugadores totales — mismo
universo de datos que `01-catalogo-jugadores`, ahora como escritura en vez de lectura.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Regla de la constitución | Cumplimiento planeado |
|---|---|
| Stack estricto (TS, NestJS, PostgreSQL, MikroORM, Redis, Swagger) | ✅ Única dependencia nueva es `@nestjs/axios`/`axios`, dentro del framework NestJS ya permitido. |
| Capas Controller/Service/Repository/Adapter | ✅ Primera feature que usa la capa **Adapter**: `football-data.client.ts` (HTTP) + `football-data.adapter.ts` (normalización) en `/back/src/adapters/football-data/`, aislados de `ingestion.service.ts` (orquestación) e `ingestion.repository.ts` (persistencia vía MikroORM). |
| Entidades solo en `/infrastructure/database/entities/` | ✅ `league.entity.ts`, `team.entity.ts`, `player.entity.ts` se modifican in-place; ninguna entidad nueva se crea dentro de `/adapters/` ni `/modules/`. |
| Módulo de dominio con estructura fija (`.module/.controller/.service/.repository/dto/`) | ✅ `/back/src/modules/ingestion/` con exactamente esos archivos. |
| Documentación Swagger obligatoria en todos los endpoints | ✅ `POST /ingestion/players` documentado (Phase 1 contracts + tarea de implementación). |
| Redis obligatorio para consultas frecuentes | N/A — este feature no expone ningún endpoint de consulta; es un proceso de escritura disparado manualmente, no una "consulta frecuente" a cachear. |
| Resiliencia a fallas de APIs externas | ✅ Es el requisito central de este feature (User Story 3): falla puntual de equipo/liga se loguea y no aborta el resto; si Football-Data.org está caído, los datos ya persistidos siguen sirviendo al resto del sistema. |
| Logs estructurados + trazabilidad | ✅ Se reutiliza `PinoLoggerService` (`back/src/shared/logging/`, ya construido en `01-catalogo-jugadores`) en `IngestionService`, mismo patrón que `PlayerService`. |
| Validación estricta de inputs vía DTOs | N/A para el endpoint en sí (`POST /ingestion/players` no recibe body/query); las respuestas de la API externa se normalizan vía el `FootballDataAdapter`, no vía DTOs de `class-validator` (son datos de un proveedor externo de confianza, no input de usuario). |
| No mocks si hay instrucción de usar Adapter/MikroORM | ✅ `FootballDataClient` hace requests HTTP reales; `IngestionRepository` usa MikroORM real (`EntityManager`), sin mocks. |

**Resultado del gate:** PASA. No hay violaciones que requieran justificación en Complexity
Tracking.

## Project Structure

### Documentation (this feature)

```text
.specify/specs/02-ingesta-catalogo/
├── plan.md                          # Este archivo
├── research.md                      # Phase 0 output
├── data-model.md                    # Phase 1 output
├── quickstart.md                    # Phase 1 output
├── contracts/
│   └── ingestion.openapi.yaml
└── tasks.md                         # Phase 2 output (/speckit-tasks, no generado por /speckit-plan)
```

### Source Code (repository root)

```text
back/
├── src/
│   ├── infrastructure/
│   │   └── database/
│   │       ├── entities/
│   │       │   ├── league.entity.ts    # MODIFICAR: + externalId, code
│   │       │   ├── team.entity.ts      # MODIFICAR: + externalId, shortName, tla, crestUrl
│   │       │   └── player.entity.ts    # MODIFICAR: unique en externalFootballDataId, + dateOfBirth/nationality/shirtNumber, enum + UNKNOWN
│   │       └── migrations/
│   │           └── <nueva>.ts          # NUEVA: alter league/team/player
│   ├── adapters/                       # NUEVO directorio (capa Adapter de la constitución)
│   │   └── football-data/
│   │       ├── football-data.module.ts
│   │       ├── football-data.client.ts    # HTTP + rate limit + retry (research #1, #2)
│   │       ├── football-data.adapter.ts   # DTO externo -> shape normalizado (research #5)
│   │       └── dtos/
│   │           ├── competition.dto.ts
│   │           ├── team.dto.ts
│   │           └── squad-member.dto.ts
│   ├── modules/
│   │   └── ingestion/                  # NUEVO módulo (vertical slice)
│   │       ├── ingestion.module.ts
│   │       ├── ingestion.controller.ts # POST /ingestion/players
│   │       ├── ingestion.service.ts    # orquesta liga -> equipos -> planteles
│   │       ├── ingestion.repository.ts # upserts vía MikroORM (research #8)
│   │       └── dto/
│   │           └── ingestion-result.dto.ts
│   └── app.module.ts                   # MODIFICAR: importar FootballDataModule + IngestionModule
└── test/
    └── ingestion.e2e-spec.ts           # NUEVO: cubre los 4 escenarios de quickstart.md
```

**Structure Decision**: Backend único dentro de `/back`, mismo vertical slicing que
`01-catalogo-jugadores`. Se agrega un directorio de primer nivel `/back/src/adapters/`,
distinto de `/infrastructure/` y `/modules/`, porque la constitución nombra "Adapters (APIs
externas)" como una capa propia y separada — hasta este feature no existía ningún adapter
externo en el proyecto. El cliente/adapter de Football-Data.org vive ahí (no dentro de
`modules/ingestion/`) para que una spec futura (scheduler semanal, o el propio adapter de
WhoScored) pueda reutilizarlo sin acoplarse al módulo de ingestión.

## Complexity Tracking

*Sin violaciones — tabla no aplica.*
