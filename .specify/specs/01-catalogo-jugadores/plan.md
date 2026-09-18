# Implementation Plan: Catálogo de Jugadores

**Branch**: `feat/catalog-players` | **Date**: 2026-08-29 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/.specify/specs/01-catalogo-jugadores/spec.md`

## Summary

Exponer un catálogo de jugadores de solo lectura (`GET /players`, `GET /players/:id`) sobre
el esquema `Player`/`Team`/`League` de MikroORM ya existente en `/back`. El trabajo
principal no es crear la entidad desde cero (ya existe) sino: (1) migrarla para cumplir el
contrato del spec (PK `uuid`, nuevo campo `baseValue`), (2) construir el módulo
`/back/src/modules/player/` (controller, service, repository, DTOs) siguiendo el vertical
slicing de la constitución, (3) cablear piezas transversales que hoy no existen en el
proyecto: validación global (`class-validator`), documentación Swagger, caché Redis y
logging estructurado. Ver [research.md](./research.md) para el detalle de cada decisión.

## Technical Context

**Language/Version**: TypeScript 6 (`strict: true`), target ES2023 (Node.js LTS).

**Primary Dependencies**: NestJS 12, MikroORM 7 (`@mikro-orm/postgresql`). Nuevas para este
feature: `@nestjs/swagger`, `class-validator`, `class-transformer`, `@nestjs/cache-manager`
+ `cache-manager` + `keyv` + `@keyv/redis` (store Redis vía Keyv — `cache-manager-ioredis-
yet` está deprecado para cache-manager v6+), `pino` + `pino-http` con un `LoggerService`
propio (`nestjs-pino` no soporta aún `@nestjs/common@12`; ver research.md #6).

**Storage**: PostgreSQL (ya en `docker-compose.yml`, puerto 5433) + Redis (a agregar para
caché de `GET /players`).

**Testing**: Jest (`back/jest.config.ts`) para unit tests de service/controller; Jest e2e
(`back/test/jest-e2e.json`) para los escenarios de `quickstart.md`.

**Target Platform**: Servidor Node.js (API REST NestJS), directorio `/back`.

**Project Type**: web-service (backend-only; no hay frontend en este feature).

**Performance Goals**: p95 < 300ms en `GET /players` con cache hit; p95 < 800ms en cache
miss, para el dataset de escala esperada (ver Scale/Scope).

**Constraints**: `GET /players` debe pasar por caché Redis (constitución, obligatorio);
validación estricta de entrada vía DTOs; módulo estrictamente de solo lectura (sin
mutaciones).

**Scale/Scope**: 5 ligas (Premier League, Bundesliga, La Liga, Serie A, Ligue 1), del orden
de 2500-3000 jugadores en total; paginación en bloques de hasta 100.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Regla de la constitución | Cumplimiento planeado |
|---|---|
| Stack estricto (TS, NestJS, PostgreSQL, MikroORM, Redis, Swagger) | ✅ Sin desviaciones — todas las dependencias nuevas están dentro del stack permitido. |
| Capas Controller/Service/Repository/Adapter | ✅ `player.controller.ts` solo HTTP; `player.service.ts` lógica de negocio (incluye derivar `externalId`, orquestar caché a nivel de decisión, logging); `player.repository.ts` persistencia MikroORM. No se toca la capa Adapter (scraping) en este feature de solo lectura. |
| Entidades solo en `/infrastructure/database/entities/` | ✅ `player.entity.ts` se modifica in-place; no se crean entidades dentro de `/modules/`. |
| Módulo de dominio con estructura fija (`.module/.controller/.service/.repository/dto/`) | ✅ `/back/src/modules/player/` con exactamente esos archivos. |
| Documentación Swagger obligatoria en todos los endpoints | ✅ Cubierto en Phase 1 (contracts) y como tarea de implementación explícita. |
| Redis obligatorio para consultas frecuentes | ✅ `GET /players` cacheado (research #5). |
| Logs estructurados + trazabilidad | ✅ `nestjs-pino` inyectado en `PlayerService` (research #6). Nota: Correlation ID end-to-end es un requisito de sistema completo; este feature solo garantiza que `PlayerService` emite logs estructurados — la propagación de correlation id entre servicios queda fuera de alcance de un módulo de solo lectura aislado y debería resolverse como infraestructura compartida (no bloquea este feature). |
| Validación estricta de inputs vía DTOs | ✅ `GetPlayersFilterDto` + `ParseUUIDPipe` (research #7). |
| Resiliencia a fallas de APIs externas | N/A para este feature — es de solo lectura sobre datos ya persistidos, no llama APIs externas en el camino caliente. |
| No mocks si hay instrucción de usar Adapter/MikroORM | ✅ Se usa MikroORM real vía repository; no hay llamadas a adapters externos en este feature. |

**Resultado del gate:** PASA. No hay violaciones que requieran justificación en Complexity
Tracking.

## Project Structure

### Documentation (this feature)

```text
.specify/specs/01-catalogo-jugadores/
├── plan.md              # Este archivo
├── research.md          # Phase 0 output
├── data-model.md         # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── players.openapi.yaml
└── tasks.md             # Phase 2 output (/speckit-tasks, no generado por /speckit-plan)
```

### Source Code (repository root)

```text
back/
├── src/
│   ├── infrastructure/
│   │   └── database/
│   │       ├── entities/
│   │       │   ├── player.entity.ts    # MODIFICAR: id -> uuid, + baseValue
│   │       │   ├── team.entity.ts      # sin cambios
│   │       │   └── league.entity.ts    # sin cambios
│   │       └── migrations/
│   │           └── <nueva>.ts          # NUEVA: alter player (id uuid, baseValue)
│   ├── modules/
│   │   └── player/                     # NUEVO módulo (vertical slice)
│   │       ├── player.module.ts
│   │       ├── player.controller.ts
│   │       ├── player.service.ts
│   │       ├── player.repository.ts
│   │       └── dto/
│   │           ├── get-players-filter.dto.ts
│   │           └── player-response.dto.ts
│   ├── shared/                         # NUEVO (transversal, no exclusivo de player)
│   │   └── logging/                    # nestjs-pino wiring
│   ├── app.module.ts                   # MODIFICAR: importar PlayerModule, ValidationPipe global, SwaggerModule.setup
│   └── main.ts                         # MODIFICAR: ValidationPipe global, Swagger bootstrap
└── test/
    └── player.e2e-spec.ts              # NUEVO: cubre los 4 escenarios de quickstart.md
```

**Structure Decision**: Backend único dentro de `/back` (no hay frontend en este feature).
Se sigue el vertical slicing ya establecido por la constitución: el módulo de dominio vive
en `/back/src/modules/player/` y la entidad persiste en
`/back/src/infrastructure/database/entities/`. El logging estructurado se agrega como
`shared/` porque la constitución lo exige a nivel de todo el sistema, no solo para este
feature, aunque en esta iteración solo se conecta a `PlayerService`.

## Complexity Tracking

*Sin violaciones — tabla no aplica.*
