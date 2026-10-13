# Implementation Plan: Créditos, Sobres e Inventario

**Branch**: `08-sobres` | **Date**: 2026-10-13 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `.specify/specs/08-sobres/spec.md` (revisión 4, con
Clarifications del 2026-10-13)

## Summary

Cada cuenta recibe créditos al registrarse y los usa para abrir sobres. Los sobres reparten
los 100 tokens de cada jugador cotizado y con reputación, y lo que sale queda en el
inventario del usuario. Además, el OVR de todo el sistema pasa a ser la reputación mundial,
con nuevos cortes de rareza (88 / 80 / 70).

Enfoque técnico:

1. **Backend, tres módulos nuevos** (research #1):
   - `credits`: el saldo es una columna de `user` y cada cambio deja un movimiento inmutable.
     El débito es un `UPDATE` condicional atómico.
   - `tokens`: cada token tiene ID, número de serie, estado y dueño, más un log de eventos.
     Este módulo también sirve el inventario y el historial de un token.
   - `packs`: un planificador puro arma lotes con partición exacta (programación dinámica
     para la cantidad de sobres e IPF para repartir las rarezas). La apertura transcurre en
     una sola transacción, con sorteo uniforme y `for update skip locked`. Las probabilidades
     se calculan en vivo y se cachean con versión.
2. **Backend, módulos que cambian**:
   - `auth`: la entrega inicial ocurre en la misma transacción que el registro.
   - `player`: el OVR y la rareza salen de `world_reputation`.
   - `quotes`: después de una corrida o de una carga de reputación, dispara la sincronización
     del stock e invalida las cachés.
3. **Integridad en la base**: triggers que rechazan `UPDATE` y `DELETE` en los registros
   financieros, `CHECK` de saldo no negativo e índices únicos parciales para la idempotencia.
4. **Frontend**:
   - Páginas `/packs` y `/inventory` sobre los componentes que ya existen (`Pack`,
     `ConfirmModal`, `PlayerCard`).
   - Un `AppHeader` compartido que muestra el saldo, que vive en un `CreditsProvider` (Context
     API) en `app/`, como corresponde a un provider global (§7).
   - Se declaran `gsap` y `@gsap/react`.

## Technical Context

**Language/Version**: TypeScript en modo estricto en todo el repositorio: `typescript@6` en
`/back` y `typescript@7` en `/front`. Node.js 24 LTS.

**Primary Dependencies**:
- `/back`, todas ya presentes: NestJS 12, MikroORM 7 (PostgreSQL), `@nestjs/swagger`,
  `class-validator`, `@nestjs/schedule`, `@nestjs/cache-manager` + `@keyv/redis`.
- `/front`: React 19, React Router 7, Axios, Tailwind 4 y Vite 8. **Se declaran** `gsap` y
  `@gsap/react`, que ya importan `Pack` y `ConfirmModal` y que autoriza la constitución §2.

**Storage**:
- PostgreSQL, misma instancia. Siete tablas nuevas (`credit_movement`, `token`,
  `token_event`, `pack_batch`, `pack`, `pack_opening` y `pack_opening_card`), una columna
  nueva (`user.credits`), triggers de inmutabilidad y un índice sobre
  `player.world_reputation`.
- Redis para las probabilidades del catálogo de sobres (claves versionadas) y para la caché
  del listado de jugadores, que ya existía.

**Testing**:
- `/back`, Jest:
  - Unitarios de las utilidades puras: `pack-stock-planner`, `pack-config.rules`, `ovr` y
    `rarity`.
  - E2E con supertest contra la base de `.env.test`, con los dos schedulers desactivados:
    `credits`, `packs`, `tokens` y la actualización de `players` por FR-067.
- `/front`, Vitest con jsdom:
  - Servicios: mapeo de respuestas y de códigos de error.
  - Páginas: estados de los tipos, confirmación, revelación solo tras éxito, inventario vacío
    y error.

**Target Platform**: servidor Node.js (API REST NestJS, una instancia) y SPA en navegadores
actuales.

**Project Type**: web application (`/back` + `/front`).

**Performance Goals**:
- Apertura: menos de 2 s en p95 (SC-001), con una transacción de unas 10 sentencias
  indexadas.
- Primer lote del catálogo actual (264.400 tokens, unos 70.000 sobres): segundos.
- Catálogo de tipos: servido desde Redis entre aperturas.

**Constraints**:
- Atomicidad total de la apertura (SC-002).
- Saldo nunca negativo (FR-004), ni un sobre ni un token entregados dos veces (FR-022).
- Partición exacta del stock (FR-013).
- Registros financieros inmutables (FR-040).
- Contenido de los sobres sin abrir nunca expuesto (FR-015).
- Formato de error `{code, message, correlationId}` en los endpoints nuevos (FR-049).
- Ningún precio por defecto: un jugador sin cotización no entra al stock (§5, FR-027).

**Scale/Scope**:
- Volumen: hoy 2.644 jugadores, unos 70.000 sobres, cientos de usuarios.
- Backend: 7 tablas nuevas y 1 columna nueva; 2 migraciones (esquema y triggers en una;
  la carga de reputación ya existe); 3 módulos nuevos y 3 modificados; 8 endpoints; 1 job
  programado nuevo.
- Frontend: 2 páginas, 1 encabezado compartido, 1 provider y 3 servicios.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Evaluado contra la constitución **v4.0.0**.

| Regla de la constitución | Cumplimiento planeado |
|---|---|
| Stack backend estricto (§2) | ✅ No se agrega ningún paquete. El scheduler del stock reusa `@nestjs/schedule` (07). |
| Stack frontend estricto (§2) | ✅ Vite, React, React Router, Axios, Tailwind, Context API y Vitest. `gsap` y `@gsap/react` están autorizados (v3.3.0) y solo se usan en `components/` vía `useGSAP`, respetando `prefers-reduced-motion` (FR-062). Las páginas nuevas se estilan solo con Tailwind. |
| TypeScript estricto (§2) | ✅ |
| Capas Controller/Service/Repository/Adapter (§3) | ✅ Los tres módulos nuevos tienen las tres capas. No hay proveedor externo nuevo, así que no hay adapter. |
| Resiliencia externa (§3) | ✅ Nada depende de un proveedor externo. Si Redis falla, el catálogo se calcula desde la base (research #9). |
| Observabilidad (§4) | ✅ Logs estructurados con `PinoLoggerService` por apertura, lote, emisión y entrega. Correlation ID en cada movimiento, evento y apertura (FR-050); los procesos sin petición generan uno propio. |
| Auditoría financiera (§4) | ✅ Apertura, movimiento y eventos de tokens inmutables por trigger. Cada uno registra autor, detalle con marca de tiempo, y estado anterior y posterior (saldo antes y después; estado y dueño de origen y destino), y se referencian entre sí (FR-041). |
| Scheduler (§4) | ✅ Job de sincronización del stock (emisión y lotes), configurable y desactivable. |
| Validación de inputs vía DTOs (§4) | ✅ DTOs con `class-validator` bajo el `ValidationPipe` global. La configuración se valida al arrancar con una utilidad pura (research #11). |
| Manejo seguro de credenciales (§4) | ✅ `JwtAuthGuard` en las rutas de usuario y `ApiKeyGuard` en las administrativas. El usuario sale siempre del token, nunca del pedido (FR-025). |
| §5 Tokens | ✅ 100 por jugador, emisión idempotente. Los tokens sin dueño de usuario son de la plataforma, que no es un usuario (`owner_id` nulo). No se venden: solo salen por sobres. El estado `en_venta_plataforma` existe sin flujo (research #15). |
| §5 Créditos | ✅ Enteros y no negativos (`CHECK`). La entrega inicial es una emisión; lo cobrado sale de circulación y no se acredita a nadie (FR-007). |
| §5 Precio y momento cero | ✅ El momento cero es la apertura. Se registra la cotización vigente (`base_value`) en la carta y en el evento. Un jugador sin cotización no es elegible (research #7). |
| §5 Cotización | ✅ Sin cambios: el stock solo lee el precio vigente. |
| Swagger obligatorio (§6) | ✅ Los 8 endpoints, documentados según `contracts/packs.openapi.yaml`, con sus códigos de error. |
| Validar disponibilidad y saldos antes de transaccionar (§6) | ✅ Tipo, stock y saldo se validan antes de mover nada. El débito condicional y `skip locked` revalidan dentro de la transacción (research #8). |
| Sin mocks si corresponde MikroORM (§6) | ✅ Repositorios con MikroORM real y e2e contra la base de test. |
| Módulo de dominio con 5 elementos exactos (§7) | ✅ `credits/`, `tokens/` y `packs/` con `.module`, `.controller`, `.service`, `.repository` y `dto/`. El cron se registra en `packs.service.ts`, como en 07. |
| Excepción de utilidades puras (§7) | ✅ `pack-stock-planner.ts` y `pack-config.rules.ts` en `packs/`, más `ovr.ts` y `rarity.ts` modificados en `player/`. Ninguno usa decoradores, DI ni base. |
| Entidades solo en `/infrastructure/database/entities/` (§7) | ✅ Las 7 nuevas y `user` modificada van ahí. |
| Estructura del frontend (§7) | ✅ Páginas en `pages/`, componentes sin HTTP en `components/`, red y estado de sesión en `services/`; el provider global del saldo y las rutas en `app/`. |

**Resultado del gate (pre-Phase 0):** PASA, sin violaciones que justificar.

**Re-evaluación post-Phase 1 (diseño cerrado):** el gate sigue en PASA. El diseño cerró
cuatro puntos que rozaban la constitución:

- **§7, utilidades compartidas fuera de un módulo**: el filtro de errores va en
  `shared/http/`, junto a `shared/auth` y `shared/logging`. No es un módulo de dominio, y se
  aplica solo a los controladores nuevos para no cambiar los contratos de 05 a 07
  (research #10).
- **§7, un módulo no invoca el service de otro por fuera de su API**: `auth` usa
  `CreditsService` exportado por `CreditsModule`, y `quotes` usa `PacksService` exportado por
  `PacksModule`. No hay dependencias circulares (research #1).
- **§4, auditoría**: la inmutabilidad la garantiza la base (triggers), no solo el código
  (research #4).
- **§5, la plataforma no es un usuario**: no hay fila de usuario «plataforma». Se representa
  con `owner_id` nulo, y en los eventos con `from_owner_id` o `to_owner_id` nulos.

## Project Structure

### Documentation (this feature)

```text
.specify/specs/08-sobres/
├── plan.md                     # Este archivo
├── research.md                 # Phase 0 output
├── data-model.md               # Phase 1 output
├── quickstart.md               # Phase 1 output
├── contracts/
│   └── packs.openapi.yaml      # Phase 1 output
├── checklists/
│   └── requirements.md         # de /speckit-specify
└── tasks.md                    # Phase 2 output (/speckit-tasks, NO generado por /speckit-plan)
```

### Source Code (repository root)

```text
back/
├── .env.test                                     # MODIFICAR: PACKS_SCHEDULER_ENABLED=false
├── src/
│   ├── app.module.ts                             # MODIFICAR: + CreditsModule, TokensModule, PacksModule
│   ├── infrastructure/database/
│   │   ├── entities/
│   │   │   ├── user.entity.ts                    # MODIFICAR: + credits
│   │   │   ├── credit-movement.entity.ts         # NUEVA
│   │   │   ├── token.entity.ts                   # NUEVA
│   │   │   ├── token-event.entity.ts             # NUEVA
│   │   │   ├── pack-batch.entity.ts              # NUEVA
│   │   │   ├── pack.entity.ts                    # NUEVA
│   │   │   ├── pack-opening.entity.ts            # NUEVA
│   │   │   └── pack-opening-card.entity.ts       # NUEVA
│   │   └── migrations/
│   │       ├── Migration20261013180000.ts        # YA EXISTE: carga de reputación (EA FC 27)
│   │       └── Migration2026101XXXXXXX.ts        # NUEVA: tablas, CHECKs, índices, triggers, índice de reputación
│   ├── shared/http/
│   │   └── api-error.filter.ts                   # NUEVO: {code, message, correlationId} (research #10)
│   └── modules/
│       ├── auth/
│       │   ├── auth.module.ts                    # MODIFICAR: importa CreditsModule
│       │   └── auth.service.ts                   # MODIFICAR: registro + entrega inicial en una transacción
│       ├── player/
│       │   ├── ovr.ts                            # MODIFICAR: ovrFromReputation (FR-067)
│       │   ├── ovr.spec.ts                       # MODIFICAR
│       │   ├── rarity.ts                         # MODIFICAR: cortes 88/80/70, rangos sobre reputación
│       │   ├── rarity.spec.ts                    # MODIFICAR
│       │   ├── player.repository.ts              # MODIFICAR: filtros sobre world_reputation
│       │   ├── player.repository.spec.ts         # MODIFICAR
│       │   ├── player.service.ts                 # MODIFICAR: + findCardsByIds (research #13)
│       │   └── dto/player-response.dto.ts        # MODIFICAR: ovr/rarity desde la reputación
│       ├── quotes/
│       │   ├── quotes.module.ts                  # MODIFICAR: importa PacksModule
│       │   └── quotes.service.ts                 # MODIFICAR: tras corrida y carga de reputación → syncStock + cachés
│       ├── credits/                              # NUEVO
│       │   ├── credits.module.ts                 # exporta CreditsService
│       │   ├── credits.controller.ts             # GET /credits, POST /credits/initial-grants
│       │   ├── credits.service.ts                # grantInitial, backfill (onApplicationBootstrap), saldo
│       │   ├── credits.repository.ts
│       │   └── dto/
│       │       ├── credit-balance.dto.ts
│       │       └── initial-grants-result.dto.ts
│       ├── tokens/                               # NUEVO
│       │   ├── tokens.module.ts                  # exporta TokensService
│       │   ├── tokens.controller.ts              # GET /inventory, GET /tokens/:tokenId/history
│       │   ├── tokens.service.ts                 # emisión idempotente, inventario, historial
│       │   ├── tokens.repository.ts
│       │   └── dto/
│       │       ├── inventory-query.dto.ts
│       │       ├── inventory-response.dto.ts
│       │       └── token-history-response.dto.ts
│       └── packs/                                # NUEVO
│           ├── packs.module.ts                   # importa TokensModule, PlayerModule; exporta PacksService
│           ├── packs.controller.ts               # GET /packs/types, POST|GET /packs/openings,
│           │                                     # POST /packs/stock/sync
│           ├── packs.service.ts                  # catálogo, apertura, syncStock, registro del cron
│           ├── packs.repository.ts               # transacción de apertura, persistencia de lotes, stock
│           ├── pack-stock-planner.ts             # utilidad pura: partición exacta + IPF + armado
│           ├── pack-stock-planner.spec.ts
│           ├── pack-config.rules.ts              # utilidad pura: lectura y validación de la configuración
│           ├── pack-config.rules.spec.ts
│           └── dto/
│               ├── open-pack.dto.ts
│               ├── pack-catalog-response.dto.ts
│               ├── pack-opening-response.dto.ts
│               ├── openings-query.dto.ts
│               └── stock-sync-result.dto.ts
└── test/
    ├── credits.e2e-spec.ts                       # NUEVO: US1
    ├── packs.e2e-spec.ts                         # NUEVO: US2, US7, concurrencia, atomicidad, inmutabilidad
    ├── tokens.e2e-spec.ts                        # NUEVO: US3, US4
    └── players.e2e-spec.ts                       # MODIFICAR: OVR y rareza desde la reputación

front/
├── package.json                                  # MODIFICAR: + gsap, @gsap/react
└── src/
    ├── app/
    │   ├── App.tsx                               # MODIFICAR: rutas /packs, /inventory; CreditsProvider
    │   ├── CreditsProvider.tsx                   # NUEVO: saldo compartido, provider global (Context API, §7)
    │   ├── useCredits.ts                         # NUEVO
    │   └── __tests__/protected-routes.test.tsx   # NUEVO: /packs e /inventory sin sesión → /login
    ├── components/
    │   ├── AppHeader.tsx                         # NUEVO: accesos, saldo, usuario, cerrar sesión
    │   ├── pack/                                 # YA EXISTE: Pack (sin cambios de API)
    │   ├── confirm-modal/                        # YA EXISTE: ConfirmModal
    │   ├── player-card/                          # YA EXISTE: PlayerCard (congelado, 06 FR-020)
    │   ├── PackTypeTile.tsx                      # NUEVO: tipo con precio, probabilidades, restantes y motivo de no disponible
    │   ├── PackReveal.tsx                        # NUEVO: cartas reveladas + «Abrir otro» / «Ir a mis cartas»
    │   └── __tests__/                            # NUEVOS: pack-type-tile, pack-reveal, app-header
    ├── pages/
    │   ├── HomePage.tsx                          # MODIFICAR: usa AppHeader
    │   ├── PacksPage.tsx                         # NUEVA: US5
    │   ├── InventoryPage.tsx                     # NUEVA: US6
    │   └── __tests__/                            # NUEVOS: packs-page, inventory-page
    └── services/
        ├── credits.service.ts                    # NUEVO: GET /credits
        ├── packs.service.ts                      # NUEVO: tipos, apertura, mensajes por código de error
        ├── inventory.service.ts                  # NUEVO: GET /inventory
        ├── pack.mapper.ts                        # NUEVO: tipo de sobre → PackData; carta abierta → PlayerCardData
        └── __tests__/                            # NUEVOS: packs.service, pack.mapper, inventory.service
```

**Structure Decision**: la feature toca los dos árboles con la estructura de §7. En `/back`,
tres módulos de dominio con vertical slicing. Las dos piezas con más lógica (la partición del
stock y la validación de la configuración) son utilidades puras, testeables sin base, y el
filtro de errores es infraestructura compartida en `shared/http/`. En `/front`, layout plano:
dos páginas nuevas que componen los componentes existentes (`Pack`, `ConfirmModal` y
`PlayerCard`, sin cambiar su API) con dos componentes presentacionales nuevos. Toda la red pasa
por `services/`, y el saldo vive en un provider global de Context API en `app/`. La home solo cambia su
encabezado (FR-052, FR-053) y el origen del OVR (FR-067), tal como permite la spec.

## Complexity Tracking

No hay violaciones de la constitución que justificar.
