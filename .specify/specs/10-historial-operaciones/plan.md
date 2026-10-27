# Implementation Plan: Historial de Operaciones y Consulta de Cotizaciones por Fecha

**Branch**: `10-historial-operaciones` | **Date**: 2026-10-26 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `.specify/specs/10-historial-operaciones/spec.md` (con
Clarifications del 2026-10-26)

## Summary

El usuario ve en «Mi perfil» las cartas que adquirió (por sobre o por compra) y las que vendió, y
en el detalle de un jugador abre un gráfico completo de cotizaciones con filtro de fechas, donde
cada cotización dice con qué estrategia y versión se calculó. Es una feature de **lectura**: no
crea operaciones ni cambia precios.

Enfoque técnico:

1. **Backend, un módulo nuevo `history`** (research #2, #3): `GET /history/operations` junta en
   una sola consulta las cartas de los sobres abiertos, las compras y las ventas del usuario,
   una entrada por carta, ordenadas y paginadas en la base. Reusa los registros inmutables de 08
   y 09; no los modifica.
2. **Backend, módulo `quotes`** (research #4, #5): `GET /quotes/players/{id}/at` devuelve la
   cotización vigente en un instante (la última calculada hasta ahí), y el nombre de la
   estrategia se suma a la referencia que ya devuelve el historial de 07. El historial completo
   del gráfico sale del endpoint de 07, paginado de a 200.
3. **Backend, vínculo compra → cotización** (research #1): una columna nueva
   `token_purchase.quote_id`, que `purchase()` completa en la misma sentencia que lee el precio,
   y una migración que la completa para las compras ya hechas. Así la estrategia de cada compra
   y venta es exacta, sin depender de relojes.
4. **Frontend**: pantalla «Mi perfil» (`/profile`) con el saldo y el historial; botón «Ver más»
   en el bloque «Price History» que abre un modal con el gráfico completo en SVG propio, el
   filtro de fechas y la lista accesible. Dos servicios nuevos, tres componentes nuevos y una
   página nueva.

## Technical Context

**Language/Version**: TypeScript en modo estricto en todo el repositorio: `typescript@6` en
`/back` y `typescript@7` en `/front`. Node.js 24 LTS.

**Primary Dependencies**: todas ya presentes, no se agrega ninguna.
- `/back`: NestJS, MikroORM (PostgreSQL), `@nestjs/swagger`, `class-validator`.
- `/front`: React 19, React Router 7, Axios, Tailwind 4 y Vite 8. El gráfico se dibuja con SVG a
  mano: no se incorpora ninguna librería de gráficos (constitución §2, research #7).

**Storage**:
- PostgreSQL, misma instancia. Una columna nueva (`token_purchase.quote_id`, FK a
  `player_quote`) y una migración con relleno de las compras existentes (data-model.md).
- Redis: no se usa. El historial es por usuario y el gráfico lee cotizaciones que deben ser las
  últimas (07 FR-021); cachear no suma (research #9).

**Testing**:
- `/back`, Jest: e2e nuevo `history.e2e-spec.ts` (US1 y US4: los tres tipos, filtros, orden,
  paginación, aislamiento entre usuarios, inmutabilidad). Modificados: `quotes.e2e-spec.ts`
  (`/at`, `strategy.name`) y `market.e2e-spec.ts` (la compra guarda `quote_id` y coincide con la
  cotización vigente). Unitarios del armado de la consulta y de la validación de `at`.
- `/front`, Vitest con jsdom: `history.service` y `quotes.service` (mapeo y mensajes por
  código), `quote.mapper` (series por estrategia), `date-filter` (día local), `QuoteChart`,
  `PriceHistoryModal`, `OperationHistory`, `PlayerDetailPanel` (botón y línea de estrategia),
  `ProfilePage` y `AppHeader`.

**Target Platform**: servidor Node.js (API REST NestJS, una instancia) y SPA en navegadores
actuales.

**Project Type**: web application (`/back` + `/front`).

**Performance Goals**:
- Primera página del historial en menos de 2 s en p95 con 1.000 entradas acumuladas (SC-005): una
  consulta con tres ramas indexadas por usuario y un `LIMIT`.
- Modal con hasta 500 cotizaciones en menos de 2 s (SC-009): 3 pedidos de 200 como máximo, el
  primero informa el total.
- `/at`: una lectura por el índice `player_quote(player_id, calculated_at desc)`.

**Constraints**:
- Solo lectura sobre registros inmutables; ninguna escritura salvo la columna `quote_id` (FR-037).
- Cada usuario ve solo lo suyo; ningún pedido indica un usuario (FR-012).
- Valores de la operación tal como se registraron, nunca recalculados (FR-011).
- Estrategia y versión en cada cotización mostrada, o «estrategia no disponible» (FR-016, SC-006).
- Formato de error `{code, message, correlationId}` en los endpoints nuevos (FR-036); el historial
  de 07 conserva el suyo (research #8).

**Scale/Scope**:
- Volumen: un usuario activo acumula decenas o cientos de entradas; el tope de diseño es 1.000.
  Un jugador acumula una cotización por corrida (semanal más manuales): hasta unos 500 puntos.
- Backend: 1 columna y 1 migración, 1 módulo nuevo, 2 modificados (`quotes`, `market`) y 2
  endpoints nuevos (`/history/operations` y `/quotes/players/{id}/at`).
- Frontend: 2 servicios, 3 componentes, 1 página y 1 hook nuevos; 4 archivos modificados.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Evaluado contra la constitución **v4.1.0**.

| Regla de la constitución | Cumplimiento planeado |
|---|---|
| Stack backend estricto (§2) | ✅ No se agrega ningún paquete. |
| Stack frontend estricto (§2) | ✅ Sin paquetes nuevos: el gráfico es SVG propio y el modal usa `<dialog>` nativo. Estilos solo con Tailwind; sin `.css` propio ni GSAP, así que no aplican la excepción de CSS ni la regla de `prefers-reduced-motion` (research #7, #8). |
| TypeScript estricto (§2) | ✅ |
| Capas Controller/Service/Repository/Adapter (§3) | ✅ `history` tiene las tres capas. No hay proveedor externo, así que no hay adapter. |
| Resiliencia externa (§3) | ✅ Todo sale de datos locales. |
| Observabilidad (§4) | ✅ Correlation ID en cada pedido (middleware existente). Las lecturas no emiten un log propio: no cambian nada (FR-037); los errores sí salen por el filtro estándar. |
| Auditoría financiera (§4) | ✅ La feature no crea transacciones. Refuerza la traza: cada compra queda atada a la cotización que fijó su precio (`quote_id`), con lo que estrategia y versión son parte del registro inmutable de la compra. |
| Scheduler (§4) | ✅ No aplica. |
| Validación de inputs vía DTOs (§4) | ✅ DTOs con `class-validator`: tipo de filtro, paginación e instante `at`. `forbidNonWhitelisted` rechaza un usuario indicado en el pedido. |
| Manejo seguro de credenciales (§4) | ✅ `JwtAuthGuard` en las dos rutas nuevas; el usuario sale del token. |
| §5 Tokens | ✅ No se mueve ningún token. |
| §5 Créditos | ✅ No se mueve ningún crédito. |
| §5 Precio y momento cero | ✅ Un jugador sin cotización, o sin cotización a una fecha, se informa como tal; nunca hay un precio por defecto (FR-030). |
| §5 Cotización | ✅ Cada cotización mostrada lleva estrategia y versión. La búsqueda por fecha devuelve una cotización existente, nunca una interpolada (FR-029). |
| §5 Mercado | ✅ La feature solo lee precios ya cobrados. |
| Swagger obligatorio (§6) | ✅ Los dos endpoints nuevos y el campo agregado, documentados según `contracts/history.openapi.yaml`, con sus códigos de error. |
| Validar disponibilidad y saldos antes de transaccionar (§6) | ✅ No aplica a lecturas. El cambio en `purchase()` no altera sus validaciones ni su orden (FR-012 de 09). |
| Sin mocks si corresponde MikroORM (§6) | ✅ Repositorio con MikroORM real y e2e contra la base de test. |
| Módulo de dominio con 5 elementos exactos (§7) | ✅ `history/` con `.module`, `.controller`, `.service`, `.repository` y `dto/`. |
| Entidades solo en `/infrastructure/database/entities/` (§7) | ✅ Solo se modifica `token-purchase.entity.ts`. `history` no define entidades: lee con SQL, como `market`. |
| Estructura del frontend (§7) | ✅ Red en `services/`, componentes sin HTTP en `components/`, orquestación en `pages/`. Los tipos de respuesta se declaran en `services/`, sin replicar entidades. |

**Resultado del gate (pre-Phase 0):** PASA, sin violaciones que justificar.

**Re-evaluación post-Phase 1 (diseño cerrado):** el gate sigue en PASA. El diseño cerró cuatro
puntos que rozaban la constitución:

- **§4, registros inmutables vs. migración de relleno**: `token_purchase` es inmutable por trigger.
  La migración lo desactiva solo dentro de su propia transacción para completar `quote_id` de las
  compras existentes, lo reactiva antes de terminar y no cambia ningún otro valor (research #1).
  Después de la migración, el trigger rechaza cualquier cambio como antes.
- **§2, lista cerrada del frontend**: un gráfico con ejes, selección y leyenda suele resolverse
  con una librería. Se resuelve con SVG propio para no tocar la lista (research #7).
- **§7, un módulo no invoca el service de otro por fuera de su API**: `history` usa
  `PlayerService.findCardsByIds`, exportado por `PlayerModule`, igual que `market` y `packs`. No
  importa `MarketModule` ni `PacksModule`: lee sus tablas con SQL propio.
- **Contratos publicados**: 05 a 07 mantienen su formato de error (08 research #10), así que el
  endpoint de historial de cotizaciones no cambia sus códigos (research #8).

## Project Structure

### Documentation (this feature)

```text
.specify/specs/10-historial-operaciones/
├── plan.md                         # Este archivo
├── research.md                     # Phase 0 output
├── data-model.md                   # Phase 1 output
├── quickstart.md                   # Phase 1 output
├── contracts/
│   └── history.openapi.yaml        # Phase 1 output
├── checklists/
│   └── requirements.md             # de /speckit-specify
└── tasks.md                        # Phase 2 output (/speckit-tasks, NO generado por /speckit-plan)
```

### Source Code (repository root)

```text
back/
├── src/
│   ├── app.module.ts                                  # MODIFICAR: + HistoryModule
│   ├── infrastructure/database/
│   │   ├── entities/
│   │   │   └── token-purchase.entity.ts               # MODIFICAR: + quote (nullable)
│   │   └── migrations/
│   │       └── Migration20261026120000.ts             # NUEVA: quote_id, FK y relleno
│   └── modules/
│       ├── market/
│       │   └── market.repository.ts                   # MODIFICAR: purchase() lee y guarda quote_id
│       ├── quotes/
│       │   ├── quotes.controller.ts                   # MODIFICAR: + GET players/:playerId/at
│       │   ├── quotes.service.ts                      # MODIFICAR: + getAt()
│       │   ├── quotes.repository.ts                   # MODIFICAR: + findAt(), findFirst()
│       │   └── dto/
│       │       ├── quote-at-query.dto.ts              # NUEVO
│       │       ├── quote-at-response.dto.ts           # NUEVO
│       │       ├── quote-run-response.dto.ts          # MODIFICAR: StrategyRefDto + name
│       │       └── current-quote-response.dto.ts      # MODIFICAR: mapea strategy.name
│       └── history/                                   # NUEVO
│           ├── history.module.ts                      # importa PlayerModule
│           ├── history.controller.ts                  # GET /history/operations
│           ├── history.service.ts                     # arma las entradas con las cartas del jugador
│           ├── history.repository.ts                  # consulta de tres ramas, filtro, orden y página
│           └── dto/
│               ├── operations-query.dto.ts
│               └── operations-response.dto.ts
└── test/
    ├── history.e2e-spec.ts                            # NUEVO: US1 y US4, aislamiento, orden, paginación
    ├── quotes.e2e-spec.ts                             # MODIFICAR: /at y strategy.name
    └── market.e2e-spec.ts                             # MODIFICAR: la compra guarda quote_id

front/
└── src/
    ├── app/
    │   └── App.tsx                                    # MODIFICAR: ruta protegida /profile
    ├── components/
    │   ├── AppHeader.tsx                              # MODIFICAR: acceso «Mi perfil»
    │   ├── PlayerDetailPanel.tsx                      # MODIFICAR: «Ver más» y línea de estrategia
    │   ├── OperationHistory.tsx                       # NUEVO: filtro, lista y paginación
    │   ├── PriceHistoryModal.tsx                      # NUEVO: <dialog> con gráfico, filtros y lista
    │   ├── QuoteChart.tsx                             # NUEVO: SVG con ejes, marcadores y leyenda
    │   └── __tests__/                                 # NUEVOS: operation-history, price-history-modal,
    │                                                  #         quote-chart; MODIFICAR: player-detail-panel,
    │                                                  #         app-header
    ├── pages/
    │   ├── ProfilePage.tsx                            # NUEVO: saldo + historial + modal
    │   ├── HomePage.tsx                               # MODIFICAR: abre el modal desde el detalle
    │   ├── usePriceHistory.ts                         # NUEVO: carga, filtros y búsqueda por día
    │   ├── date-filter.ts                             # NUEVO: día local → instante, tope de hoy
    │   └── __tests__/                                 # NUEVOS: profile-page, date-filter;
    │                                                  #         MODIFICAR: home-market
    └── services/
        ├── history.service.ts                         # NUEVO: GET /history/operations
        ├── quotes.service.ts                          # NUEVO: historial completo, /at, /current
        ├── quote.mapper.ts                            # NUEVO: series por estrategia y etiquetas
        └── __tests__/                                 # NUEVOS: history.service, quotes.service, quote.mapper
```

**Structure Decision**: la feature toca los dos árboles con la estructura de §7. En `/back`, un
módulo de dominio nuevo con vertical slicing para el historial (una lectura que cruza sobres y
mercado no pertenece a ninguno de los dos) y dos cambios acotados: el endpoint de búsqueda por
instante en `quotes`, que es de ese dominio, y una columna más en la compra. En `/front`, layout
plano: tres componentes presentacionales, una página que orquesta, un hook que concentra los
pedidos del modal para usarlo desde la home y desde el perfil, y toda la red en `services/`.
`PlayerCard` no cambia.

## Complexity Tracking

| Desvío | Por qué hace falta | Alternativa descartada |
|---|---|---|
| Migración que desactiva un trigger de inmutabilidad para rellenar `quote_id` | Sin relleno, las compras anteriores no tendrían estrategia, y la spec exige mostrarla (FR-015). El relleno es único, está dentro de la transacción de la migración y no altera ningún valor financiero. | Derivar siempre por fecha en lectura: queda una ventana de error durante cada recálculo y depende del reloj de la aplicación contra el de la base (research #1). |
| Dos formatos de error conviviendo en `QuotesController` | El endpoint nuevo `/at` sigue la spec (`VALIDATION_ERROR` 422, `PLAYER_NOT_FOUND`); el historial de 07 conserva su 400 porque su contrato está publicado y testeado. | Aplicar el filtro a todo el controlador: rompe el contrato de 07 y sus e2e (research #8). |
