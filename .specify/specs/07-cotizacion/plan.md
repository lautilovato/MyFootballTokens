# Implementation Plan: Sistema de Score y Cotización de Jugadores

**Branch**: `07-cotizacion` | **Date**: 2026-10-03 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `.specify/specs/07-cotizacion/spec.md`

## Summary

Reemplazar el valor placeholder de los jugadores por un precio derivado de su rendimiento. A
cada jugador con estadísticas de la temporada vigente se le calcula un **score** (≥ 0, sin tope superior):
una suma ponderada de métricas normalizadas con percentiles p5–p95, re-escalada por la suma de
pesos positivos. El score se convierte en un **precio entero** con
`max(minPrice, round(baseValue + score × scaleFactor))`. Cada cotización es inmutable y guarda
su desglose por métrica y la versión de estrategia que la produjo.

El trabajo es solo de backend y se reparte en dos módulos de dominio nuevos:

1. **`quotes`**: el motor. Corrida atómica (cálculo en memoria y persistencia en una sola
   transacción), exclusión mutua por índice único parcial, scheduler semanal con
   `@nestjs/schedule` y consultas de cotización actual (cacheada en Redis con claves
   versionadas) e historial. También expone la carga individual y en lote de la nueva
   columna `player.world_reputation`, que es un insumo del score (research #12).
2. **`valuation-strategy`**: dos estrategias sembradas (`performance` activa, `prestige`),
   versiones inmutables y activación atómica.

La corrida también reescribe `player.base_value` como espejo del precio vigente (research
#10). Así la home muestra precios reales sin tocar `/front`, que sigue fuera de alcance.

## Technical Context

**Language/Version**: TypeScript 6 (`strict: true`), Node.js 24 LTS. Solo `/back`.

**Primary Dependencies**: NestJS 12, MikroORM 7 (PostgreSQL), `@nestjs/swagger`,
`class-validator`, `@nestjs/cache-manager` + `@keyv/redis`, todas ya presentes. **Nueva**:
`@nestjs/schedule` (research #1).

**Storage**: PostgreSQL, misma instancia. Cuatro tablas nuevas (`valuation_strategy`,
`valuation_strategy_version`, `quote_run`, `player_quote`) y una columna nueva
(`player.world_reputation`). Redis para la cotización actual (research #11).

**Testing**: Jest. Unitarios para las utilidades puras (`score-calculator.spec.ts`,
`strategy-config.rules.spec.ts`) y e2e con supertest contra la base de `.env.test`
(`quotes`, `valuation-strategies`), con el scheduler desactivado.

**Target Platform**: servidor Node.js (API REST NestJS), una instancia.

**Project Type**: web service (backend del web application existente).

**Performance Goals**: recálculo de 5.000 jugadores en < 2 min (SC-001; con una consulta, un
`insertMany` y un `UPDATE ... FROM` se espera que tarde segundos); cotización actual en < 1 s
en p95 (SC-003, servida desde Redis).

**Constraints**: corrida atómica (0 cotizaciones parciales); nunca dos corridas a la vez;
cotizaciones y versiones inmutables (solo `INSERT`); sin precio por defecto para jugadores no
cotizados; el cálculo no depende de ningún proveedor externo (FR-008); la caché de la
cotización actual queda invalidada en el instante en que la corrida confirma.

**Scale/Scope**: catálogo de hasta 5.000 jugadores, 1 corrida semanal más las manuales.
Superficie: 4 entidades nuevas + 1 modificada, 1 migración (con seed), 2 módulos de dominio
nuevos, 9 endpoints, 1 job programado.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Evaluado contra la constitución **v3.1.0**.

| Regla de la constitución | Cumplimiento planeado |
|---|---|
| Stack backend estricto (§2) | ✅ Los pilares no cambian. `@nestjs/schedule` entra por la cláusula de librerías utilitarias: no compite con ningún pilar y resuelve un problema acotado (el job scheduler que exige §4). Justificada en Complexity Tracking #1. |
| Stack frontend estricto (§2) | N/A — no se toca `/front`. |
| TypeScript estricto (§2) | ✅ |
| Capas Controller/Service/Repository/Adapter (§3) | ✅ Los dos módulos tienen las cuatro capas. No hay proveedor externo, así que no interviene ningún adapter. |
| Resiliencia externa (§3) | ✅ El cálculo solo lee datos locales (FR-008). Si Redis no responde, la cotización actual se lee de la base. |
| Observabilidad: logs estructurados + Correlation IDs (§4) | ✅ `PinoLoggerService`. Las corridas manuales heredan el Correlation ID de la petición; las automáticas generan uno propio y lo registran en `quote_run.correlation_id` (FR-035). |
| Auditoría financiera (§4) | N/A en sentido estricto: no hay apertura de sobres ni compra/venta. Igual, las cotizaciones y las versiones son inmutables y trazables (FR-016, FR-017), y van a ser la base de precio de esa auditoría. |
| Scheduler (§4) | ✅ Esta feature implementa el primer job programado del proyecto: el «recálculo semanal de cotizaciones» que §4 nombra. |
| Validación de inputs vía DTOs (§4) | ✅ DTOs con `class-validator` bajo el `ValidationPipe` global. La validación semántica de pesos (al menos un positivo por perfil) va en la utilidad pura `strategy-config.rules.ts`. |
| Manejo seguro de credenciales (§4) | ✅ Se reusan `ApiKeyGuard` y `JwtAuthGuard` de `/shared/auth/`, aplicados por ruta (05-auth research #3). |
| Reglas de dominio: Cotización (§5) | ✅ Precio del jugador en créditos enteros, derivado solo del score; estrategias configurables y versionadas, con pesos ±, por posición y con reputación mundial; traza de estrategia, versión, score y desglose en cada cotización. |
| Reglas de dominio: sin precio por defecto (§5) | ✅ Un jugador no cotizado responde `quoted: false`. `base_value = 0` solo marca «sin cotización» en el espejo; la API de cotizaciones nunca lo presenta como precio. |
| Reglas de dominio: Tokens y Créditos (§5) | N/A — no se emiten, entregan ni mueven tokens ni créditos. |
| Swagger obligatorio (§6) | ✅ Los 9 endpoints, documentados según `contracts/quotes.openapi.yaml`. |
| Validar disponibilidad/saldos antes de transaccionar (§6) | N/A — no hay transacciones de mercado. |
| Sin mocks si corresponde MikroORM (§6) | ✅ Repositorios con MikroORM real; e2e contra la base de test. Esta feature reemplaza el origen del valor que alimenta `market-value.mock.ts`, aunque la variación simulada sigue siendo maqueta por decisión de la spec 06. |
| Módulo de dominio con 5 elementos exactos (§7) | ✅ `quotes/` y `valuation-strategy/` con `.module/.controller/.service/.repository/dto/`. La reputación no abre un módulo propio: sus dos rutas viven en `quotes.controller.ts`. El cron se registra dentro de `quotes.service.ts`: no hay un archivo `*.scheduler.ts` aparte. |
| Excepción de utilidades puras (§7) | ✅ `score-calculator.ts` y `strategy-config.rules.ts`: sin decoradores, sin DI y sin base. Se testean aislados. |
| Entidades solo en `/infrastructure/database/entities/` (§7) | ✅ Las 4 nuevas y la modificada van ahí. |

**Resultado del gate (pre-Phase 0):** PASA. La única anotación es la librería utilitaria
`@nestjs/schedule`, prevista por la cláusula de §2 y justificada abajo.

**Re-evaluación post-Phase 1 (diseño cerrado):** el gate sigue en PASA. El diseño cerró tres
puntos que podían rozar la constitución:

- **§7, 5 elementos exactos**: el job programado no agrega archivos. Lo registra el service
  en `onModuleInit` (research #1).
- **§5, sin precio por defecto**: se distingue «sin cotización» (`200`, `quoted: false`) de
  «no existe» (`404`) (research #13). El `0` del espejo `base_value` no es un precio de la
  API de cotizaciones.
- **§2, stack**: Phase 1 no agregó ningún paquete además de `@nestjs/schedule`. La exclusión
  mutua usa un índice parcial de PostgreSQL, no Redis ni una cola (research #2).

## Project Structure

### Documentation (this feature)

```text
.specify/specs/07-cotizacion/
├── plan.md                     # Este archivo
├── research.md                 # Phase 0 output
├── data-model.md               # Phase 1 output
├── quickstart.md               # Phase 1 output
├── contracts/
│   └── quotes.openapi.yaml     # Phase 1 output
├── checklists/
│   └── requirements.md         # de /speckit-specify
└── tasks.md                    # Phase 2 output (/speckit-tasks, NO generado por /speckit-plan)
```

### Source Code (repository root)

```text
back/
├── package.json                                  # MODIFICAR: + @nestjs/schedule
├── .env.test                                     # MODIFICAR: QUOTES_SCHEDULER_ENABLED=false
├── src/
│   ├── app.module.ts                             # MODIFICAR: + ScheduleModule.forRoot(), + 2 módulos
│   ├── infrastructure/database/
│   │   ├── entities/
│   │   │   ├── player.entity.ts                  # MODIFICAR: + worldReputation
│   │   │   ├── valuation-strategy.entity.ts      # NUEVA
│   │   │   ├── valuation-strategy-version.entity.ts # NUEVA
│   │   │   ├── quote-run.entity.ts               # NUEVA
│   │   │   └── player-quote.entity.ts            # NUEVA
│   │   └── migrations/
│   │       └── Migration2026100XXXXXXX.ts        # NUEVA: tablas, índices parciales, CHECKs, seed v1
│   └── modules/
│       ├── quotes/                               # NUEVO
│       │   ├── quotes.module.ts                  # importa ValuationStrategyModule, PlayerModule
│       │   ├── quotes.controller.ts              # POST /quotes/recalculate, GET /quotes/runs,
│       │   │                                     # GET /quotes/players/:id/{current,history},
│       │   │                                     # PUT /quotes/reputation, PUT /quotes/reputation/:playerId
│       │   ├── quotes.service.ts                 # corrida, registro del cron, caché versionada
│       │   ├── quotes.repository.ts              # lectura del lote, insertMany, espejo base_value, reputación
│       │   ├── score-calculator.ts               # utilidad pura: percentiles, ausencia, score, precio
│       │   ├── score-calculator.spec.ts
│       │   └── dto/
│       │       ├── recalculate-request.dto.ts
│       │       ├── quote-run-response.dto.ts
│       │       ├── current-quote-response.dto.ts
│       │       ├── quote-history-query.dto.ts
│       │       ├── quote-history-response.dto.ts
│       │       ├── page-meta.dto.ts                # compartido por historial y corridas (evita un ciclo de imports)
│       │       ├── list-runs-query.dto.ts
│       │       ├── set-reputation.dto.ts
│       │       ├── bulk-reputation.dto.ts
│       │       └── bulk-reputation-result.dto.ts
│       └── valuation-strategy/                   # NUEVO
│           ├── valuation-strategy.module.ts      # exporta ValuationStrategyService
│           ├── valuation-strategy.controller.ts  # GET /valuation-strategies, GET|POST /:key/versions,
│           │                                     # POST /:key/activate
│           ├── valuation-strategy.service.ts
│           ├── valuation-strategy.repository.ts
│           ├── strategy-config.rules.ts          # utilidad pura: validación semántica de pesos
│           ├── strategy-config.rules.spec.ts
│           └── dto/
│               ├── strategy-config.dto.ts
│               └── strategy-response.dto.ts
└── test/
    ├── quotes.e2e-spec.ts                        # NUEVO: US1, US2, US3 (reputación y ranking de SC-004), US5
    └── valuation-strategies.e2e-spec.ts          # NUEVO: US4
```

**Structure Decision**: solo se toca el árbol `/back`, con el vertical slicing de §7. La
feature se parte en dos módulos de dominio: `quotes` (recálculo, consultas y la carga de
reputación, que es un insumo del score) y `valuation-strategy` (configuración versionada, con
su propio ciclo de vida). La reputación no justifica un módulo propio: son dos rutas
administrativas que escriben una columna de `player` (research #12). La lógica
numérica completa vive en dos utilidades puras, bajo la excepción de §7, para que las
fórmulas de la spec (incluido su ejemplo de 724 créditos) se verifiquen sin base ni Nest.
`/front` no cambia: la home toma el precio real a través del espejo `player.base_value`
(research #10).

## Complexity Tracking

> Requerido por la cláusula de librerías utilitarias de §2, que exige justificar acá toda
> librería utilitaria nueva del backend.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| 1 librería utilitaria de backend fuera de los pilares de §2 (`@nestjs/schedule`) | §4 exige un job scheduler para el recálculo semanal de cotizaciones, y FR-027 pide día y hora configurables sin tocar código. Cumple las tres condiciones de la cláusula: no compite con ningún pilar, resuelve un problema acotado y queda justificada acá. | Un `setInterval` propio obligaría a reimplementar el parsing de cron y las zonas horarias. BullMQ agregaría colas y workers para un solo job semanal. El cron del sistema operativo sacaría el scheduler del código evaluado (research #1). |
