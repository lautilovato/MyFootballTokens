# Implementation Plan: Mercado de Tokens (Compra y Venta)

**Branch**: `09-mercado` | **Date**: 2026-10-20 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `.specify/specs/09-mercado/spec.md` (revisión 5, con
Clarifications del 2026-10-20)

## Summary

Los usuarios ponen a la venta cartas de su inventario y otros las compran desde el detalle del
jugador. El precio lo da el score: cada carta vale la cotización vigente de su jugador, nadie lo
fija y no hay comisión. Se compra una publicación concreta, de a una carta.

Enfoque técnico:

1. **Backend, un módulo nuevo `market`** (research #1):
   - **Publicación** (`listing`): solo admite cerrarse, y lo garantiza un trigger. Un índice
     único parcial impide dos publicaciones activas del mismo token.
   - **Compra**: una transacción con `for update` sobre la publicación y bloqueo ordenado de los
     dos saldos. Débito condicional, transferencia del token y registros inmutables, todos
     referenciados entre sí (research #4, #5).
   - **Precio**: `round(player.base_value)`, el mismo espejo de la cotización que usan los sobres
     para el momento cero (research #2).
2. **Backend, módulos que cambian**:
   - `player`: el Market lista los jugadores con publicaciones activas y suma `forSaleCount`.
   - `tokens`: el inventario suma `listingId` y el historial reconoce los eventos nuevos.
   - `shared/http`: el filtro de errores traduce el 429 del throttler a `RATE_LIMITED`.
3. **Integridad en la base**: dos tablas nuevas, CHECK ampliados en `credit_movement` y
   `token_event`, y triggers de inmutabilidad y de cierre.
4. **Frontend**: un servicio `market.service.ts`; el inventario suma publicar y retirar, y el
   bloque de compra del detalle pasa de maqueta a lista de cartas con «Comprar». Los dos
   componentes nuevos son presentacionales, y las páginas orquestan.

## Technical Context

**Language/Version**: TypeScript en modo estricto en todo el repositorio: `typescript@6` en
`/back` y `typescript@7` en `/front`. Node.js 24 LTS.

**Primary Dependencies**: todas ya presentes, no se agrega ninguna.
- `/back`: NestJS, MikroORM (PostgreSQL), `@nestjs/swagger`, `class-validator`,
  `@nestjs/throttler`, `@nestjs/cache-manager` + `@keyv/redis`.
- `/front`: React 19, React Router 7, Axios, Tailwind 4 y Vite 8.

**Storage**:
- PostgreSQL, misma instancia. Dos tablas nuevas (`listing` y `token_purchase`), CHECK
  ampliados en `credit_movement.type` y `token_event.type`, triggers `listing_close_only` y
  `token_purchase_immutable`.
- Redis: la caché del listado de jugadores se invalida en cada publicación, retiro y compra
  (research #8).

**Testing**:
- `/back`, Jest: e2e `market.e2e-spec.ts` con supertest contra la base de `.env.test`.
  Modificados: `players.e2e-spec.ts` (criterio del Market y `forSaleCount`) y
  `tokens.e2e-spec.ts` (`listingId` y eventos nuevos en el historial). Unitario del filtro de
  errores para el 429. Una cota de tiempo sobre 50 compras secuenciales para SC-001.
- `/front`, Vitest con jsdom: `market.service` (mapeo y mensajes por código), `ListingControls`,
  `MarketListings`, y las páginas de inventario y home (confirmación, refresco tras comprar,
  mensajes de error).

**Target Platform**: servidor Node.js (API REST NestJS, una instancia) y SPA en navegadores
actuales.

**Project Type**: web application (`/back` + `/front`).

**Performance Goals**:
- Compra: menos de 2 s en p95 (SC-001), con una transacción de unas 10 sentencias indexadas.
- Publicar y retirar: una transacción de 3 o 4 sentencias.
- Market: el filtro por publicación activa usa `listing_player_active_index`, y el listado sigue
  cacheado en Redis entre cambios.

**Constraints**:
- Precio = cotización vigente, leída dentro de la transacción (FR-001, FR-013).
- Atomicidad total de la compra (FR-014, SC-002).
- Ninguna carta vendida dos veces y ningún saldo negativo (FR-015, SC-003, SC-004).
- Créditos conservados entre usuarios y sin comisión (FR-018, FR-021).
- Registros inmutables; la publicación solo se cierra (FR-030).
- Formato de error `{code, message, correlationId}` en los endpoints nuevos (FR-033).

**Scale/Scope**:
- Volumen: hoy 2.644 jugadores, unos 264.000 tokens y cientos de usuarios. Las publicaciones
  activas están acotadas por los tokens en poder de usuarios.
- Backend: 2 tablas nuevas, 1 migración, 1 módulo nuevo, 3 modificados (`player`, `tokens` y
  `shared/http`) y 5 endpoints nuevos.
- Frontend: 1 servicio nuevo, 2 componentes nuevos y 4 archivos modificados (`InventoryPage`,
  `HomePage`, `PlayerDetailPanel` y `PlayerGrid`).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Evaluado contra la constitución **v4.1.0**.

| Regla de la constitución | Cumplimiento planeado |
|---|---|
| Stack backend estricto (§2) | ✅ No se agrega ningún paquete. El límite de frecuencia reusa `@nestjs/throttler` (05). |
| Stack frontend estricto (§2) | ✅ Sin paquetes nuevos ni animaciones nuevas. Los componentes nuevos se estilan con Tailwind. |
| TypeScript estricto (§2) | ✅ |
| Capas Controller/Service/Repository/Adapter (§3) | ✅ `market` tiene las tres capas. No hay proveedor externo, así que no hay adapter. |
| Resiliencia externa (§3) | ✅ Nada depende de un proveedor externo. Si Redis falla, el Market se lee de la base. |
| Observabilidad (§4) | ✅ Un log estructurado por publicación, retiro y compra, con correlation ID y los tokens y movimientos afectados (FR-034). |
| Auditoría financiera (§4) | ✅ Cada compra registra autor, detalle con marca de tiempo y estado anterior y posterior: saldos antes y después de ambas partes, y dueño y estado de origen y destino en el evento. Movimientos, compra y eventos son inmutables por trigger, y la publicación solo admite su cierre (research #3). |
| Scheduler (§4) | ✅ No aplica: el mercado no tiene procesos batch. Los recálculos de cotización ya existentes cambian el precio sin tocar las publicaciones. |
| Validación de inputs vía DTOs (§4) | ✅ DTOs con `class-validator`; `forbidNonWhitelisted` rechaza precio o usuario en el pedido (research #12). |
| Manejo seguro de credenciales (§4) | ✅ `JwtAuthGuard` en todas las rutas; comprador y vendedor salen siempre del token (FR-009, FR-016). Límite de frecuencia por ruta, solo en los `POST`: los `GET` no heredan el límite global de auth (research #11). |
| §5 Tokens | ✅ 100 por jugador, sin estados nuevos. Solo se publican tokens `de_usuario`, y los de la plataforma solo se venden si volvieron de un usuario (publicación con vendedor nulo, research #10). |
| §5 Créditos | ✅ Enteros y no negativos (`CHECK`). Una venta entre usuarios transfiere sin crear créditos; lo pagado a la plataforma sale de circulación. |
| §5 Precio y momento cero | ✅ Sin precio por defecto: un jugador sin cotización no se publica ni se vende (`PRICE_NOT_AVAILABLE`). |
| §5 Cotización | ✅ El mercado solo la lee; no la calcula. |
| §5 Mercado (v4.1.0) | ✅ El precio es la cotización vigente completa, leída en el instante de la operación. Ni la publicación ni el pedido llevan un precio a fijar, y no hay comisión. |
| Swagger obligatorio (§6) | ✅ Los 5 endpoints, documentados según `contracts/market.openapi.yaml`, con sus códigos de error. |
| Validar disponibilidad y saldos antes de transaccionar (§6) | ✅ Publicación, estado, dueño, cotización, precio aceptado y saldo se validan en el orden de FR-012 antes de mover nada, con la publicación bloqueada (research #4). |
| Sin mocks si corresponde MikroORM (§6) | ✅ Repositorio con MikroORM real y e2e contra la base de test. |
| Módulo de dominio con 5 elementos exactos (§7) | ✅ `market/` con `.module`, `.controller`, `.service`, `.repository` y `dto/`. |
| Entidades solo en `/infrastructure/database/entities/` (§7) | ✅ `listing` y `token-purchase` nuevas; `credit-movement`, `token-event` y `token` modificadas. |
| Estructura del frontend (§7) | ✅ Red en `services/`, componentes nuevos sin HTTP en `components/` y orquestación en `pages/`. `PlayerCard` no se modifica (06 FR-020). |

**Resultado del gate (pre-Phase 0):** PASA, sin violaciones que justificar.

**Re-evaluación post-Phase 1 (diseño cerrado):** el gate sigue en PASA. El diseño cerró tres
puntos que rozaban la constitución:

- **§4, auditoría de algo que cambia**: la publicación tiene ciclo de vida, así que no puede
  ser inmutable como el resto. El trigger `listing_close_only` permite un único cambio (el
  cierre) y rechaza todo lo demás, incluido `DELETE` (research #3).
- **§7, un módulo no invoca el service de otro por fuera de su API**: `market` usa
  `PlayerService` exportado por `PlayerModule` (`findCardsByIds` e `invalidateListCache`).
  `tokens` lee `listing` en su propia consulta del inventario, sin importar `MarketModule`, así
  que no hay dependencia circular.
- **§5, la plataforma no es un usuario**: la plataforma vende con `seller_id` nulo, sin fila de
  usuario ni saldo, igual que en 08.

## Project Structure

### Documentation (this feature)

```text
.specify/specs/09-mercado/
├── plan.md                     # Este archivo
├── research.md                 # Phase 0 output
├── data-model.md               # Phase 1 output
├── quickstart.md               # Phase 1 output
├── contracts/
│   └── market.openapi.yaml     # Phase 1 output
├── checklists/
│   └── requirements.md         # de /speckit-specify
└── tasks.md                    # Phase 2 output (/speckit-tasks, NO generado por /speckit-plan)
```

### Source Code (repository root)

```text
back/
├── src/
│   ├── app.module.ts                             # MODIFICAR: + MarketModule
│   ├── infrastructure/database/
│   │   ├── entities/
│   │   │   ├── listing.entity.ts                 # NUEVA
│   │   │   ├── token-purchase.entity.ts          # NUEVA
│   │   │   ├── credit-movement.entity.ts         # MODIFICAR: + compra_token, venta_token
│   │   │   ├── token-event.entity.ts             # MODIFICAR: + retiro_de_venta, venta
│   │   │   └── token.entity.ts                   # MODIFICAR: se quita FOR_SALE_TOKEN_STATUSES
│   │   └── migrations/
│   │       └── Migration20261020120000.ts        # NUEVA: tablas, CHECKs, índices y triggers
│   ├── shared/http/
│   │   ├── api-error.filter.ts                   # MODIFICAR: ThrottlerException → 429 RATE_LIMITED
│   │   └── api-error.filter.spec.ts              # NUEVO
│   └── modules/
│       ├── player/
│       │   ├── player.repository.ts              # MODIFICAR: Market por publicación activa + forSaleCount
│       │   └── dto/player-response.dto.ts        # MODIFICAR: + forSaleCount
│       ├── tokens/
│       │   ├── tokens.repository.ts              # MODIFICAR: listingId en el inventario
│       │   └── dto/
│       │       ├── inventory-response.dto.ts     # MODIFICAR: + listingId
│       │       └── token-history-response.dto.ts # MODIFICAR: tipos y referencias nuevos
│       └── market/                               # NUEVO
│           ├── market.module.ts                  # importa PlayerModule
│           ├── market.controller.ts              # POST /market/listings, POST /market/listings/:id/withdraw,
│           │                                     # GET /market/players/:playerId/listings,
│           │                                     # POST /market/purchases, GET /market/operations
│           ├── market.service.ts                 # errores de dominio, logs, invalidación de caché
│           ├── market.repository.ts              # transacciones de publicar, retirar y comprar; lecturas
│           └── dto/
│               ├── create-listing.dto.ts
│               ├── listing-response.dto.ts
│               ├── player-listings-query.dto.ts
│               ├── player-listings-response.dto.ts
│               ├── purchase.dto.ts
│               ├── purchase-response.dto.ts
│               ├── operations-query.dto.ts
│               └── operations-response.dto.ts
└── test/
    ├── market.e2e-spec.ts                        # NUEVO: US1, US2, US4, concurrencia, atomicidad, invariantes
    ├── support/market-fixtures.ts                # NUEVO: publicar, comprar, publicación de la plataforma
    ├── players.e2e-spec.ts                       # MODIFICAR: Market por publicación activa, forSaleCount
    └── tokens.e2e-spec.ts                        # MODIFICAR: listingId y eventos de venta en el historial

front/
└── src/
    ├── components/
    │   ├── ListingControls.tsx                   # NUEVO: marca «A la venta» + Poner a la venta / Retirar
    │   ├── MarketListings.tsx                    # NUEVO: cartas a la venta, «Comprar» y «Tuya»
    │   ├── PlayerDetailPanel.tsx                 # MODIFICAR: el bloque de compra usa MarketListings
    │   ├── PlayerGrid.tsx                        # MODIFICAR: «N a la venta» debajo de cada carta
    │   └── __tests__/                            # NUEVOS: listing-controls, market-listings
    ├── pages/
    │   ├── InventoryPage.tsx                     # MODIFICAR: publicar y retirar con ConfirmModal
    │   ├── HomePage.tsx                          # MODIFICAR: publicaciones del detalle, compra y refrescos
    │   └── __tests__/                            # MODIFICAR: inventory-page, home
    └── services/
        ├── market.service.ts                     # NUEVO: endpoints de /market y mensajes por código
        ├── inventory.service.ts                  # MODIFICAR: + listingId
        ├── players.service.ts                    # MODIFICAR: + forSaleCount
        └── __tests__/market.service.test.ts      # NUEVO
```

**Structure Decision**: la feature toca los dos árboles con la estructura de §7. En `/back`, un
módulo de dominio nuevo con vertical slicing, que concentra la lógica financiera en su
repositorio, igual que `packs`. Los cambios en `player` y `tokens` son lecturas aditivas, y el
filtro de errores sigue siendo infraestructura compartida. En `/front`, layout plano: dos
componentes presentacionales nuevos, con las páginas existentes como orquestadoras y toda la red
en `services/`. `PlayerCard` no cambia (06 FR-020); la marca y la cantidad a la venta van fuera
de la carta.

## Complexity Tracking

No hay violaciones de la constitución que justificar.
