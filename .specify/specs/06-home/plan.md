# Implementation Plan: Homepage de Mercado (Striker Market)

**Branch**: `06-home` | **Date**: 2026-09-20 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `.specify/specs/06-home/spec.md`

## Summary

Convertir la home mínima que dejó la feature 05 en el mercado de cartas: una grilla filtrable de
jugadores y un panel lateral de detalle. El trabajo se parte en tres bloques:

1. **Enriquecer el catálogo (backend)**: `GET /players` gana seis ejes de filtrado nuevos
   (multi-liga, multi-posición, rareza, rango de valor, rango de OVR y búsqueda por nombre) y
   devuelve los campos que la carta necesita. `GET /players/{id}` suma el juego completo de
   métricas de temporada. Se agrega un módulo de dominio `league` con `GET /leagues` para poblar
   el panel de filtros.
2. **Derivaciones y maqueta (backend)**: el OVR y la rareza se calculan en lectura desde el
   `rating` de temporada que ya se ingiere (research #1); el valor de mercado usa el `baseValue`
   existente, mientras que la variación y la serie de 30 días son simulación determinista
   aislada en un módulo propio (research #5), porque no existe motor de cotizaciones y la spec lo
   deja fuera de alcance.
3. **La pantalla (frontend)**: `HomePage` pasa de placeholder a la vista real, reutilizando el
   componente de carta ya implementado sin tocarlo (FR-020), con el estado de filtros en la URL
   (research #10) y el panel de detalle con su bloque de compra deshabilitado (FR-033).

El orden de entrega sigue las prioridades de la spec: US1 (grilla) es verificable por API antes de
que exista una línea de interfaz; US2 (filtros) agrega parámetros sobre esa base; US3 (detalle) es
la única que depende de los tres endpoints terminados.

**No hay entidades nuevas ni cambios de esquema.** La única migración habilita la extensión
`unaccent` y crea dos índices de apoyo.

## Technical Context

**Language/Version**: TypeScript en modo estricto en ambos árboles — Node.js LTS en `/back`,
navegador (bundle de Vite) en `/front`.

**Primary Dependencies**: ninguna nueva, en ninguno de los dos árboles. `/back` usa lo que ya
tiene: NestJS 12, MikroORM 7 (`QueryBuilder`), `@nestjs/swagger`, `class-validator`,
`class-transformer`, `@nestjs/cache-manager` sobre Redis. `/front` usa React 19, React Router 7,
Axios y Tailwind 4, todos ya presentes y todos dentro de la lista cerrada de la constitución §2.
La única incorporación es una **extensión de PostgreSQL** (`unaccent`), que no es una librería del
stack — ver Complexity Tracking #3.

**Storage**: PostgreSQL, mismo esquema. Cero tablas nuevas y cero columnas nuevas. Una migración
con `CREATE EXTENSION unaccent`, una función auxiliar `IMMUTABLE` y dos índices
(`player(unaccent(full_name))` y `player_season_stats(season, rating)`). Redis sigue cacheando el
listado, ahora con versionado de clave para poder invalidarlo tras una ingesta (research #8).

**Testing**: Jest en `/back` —specs unitarias para las funciones puras y un `players.e2e-spec.ts`
nuevo sobre el setup de e2e existente—; Vitest en `/front`, con el renderizado apoyado en
`react-dom/client` y el `act` de React, porque la constitución §2 no autoriza ninguna librería de
testing adicional (research #12).

**Target Platform**: API REST sobre Node.js + SPA servida por Vite en el navegador.

**Project Type**: web application (backend + frontend). Los dos árboles ya existen desde la
feature 05.

**Performance Goals**: SC-001 fija el objetivo observable — la primera pantalla de cartas visible
en menos de 2 segundos. El riesgo real no es el volumen sino la forma de la consulta: el filtrado
por OVR y por rareza debe resolverse en la base como rangos sobre `rating` (research #1), porque
calcularlo en memoria obligaría a leer el catálogo entero antes de paginar. El índice
`(season, rating)` sostiene ese filtro y la caché de Redis absorbe las combinaciones repetidas.

**Constraints**: el componente de carta está congelado y no se modifica (FR-020); el stack de
frontend está cerrado y no admite librerías nuevas sin enmienda de la constitución; ninguna
interacción de la pantalla puede iniciar una compra ni emitir una petición de compra (FR-032,
FR-033); las métricas ausentes deben distinguirse de un cero real (FR-015); el OVR y la rareza que
ve la grilla y los que ve el detalle deben salir del mismo cálculo (FR-031, SC-011).

**Scale/Scope**: proyecto académico, 5 ligas y del orden de miles de jugadores. La superficie es
1 módulo de dominio nuevo (`league`), 1 módulo existente ampliado (`player`), 1 migración,
4 utilidades puras nuevas en el backend, y en el frontend la `HomePage` reescrita más los
componentes de la grilla, el panel de filtros y el panel de detalle.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Regla de la constitución | Cumplimiento planeado |
|---|---|
| Stack backend estricto (§2) | ✅ Sin librerías nuevas. Los pilares no cambian. La extensión `unaccent` es una capacidad del motor PostgreSQL ya autorizado, no un paquete del stack — justificada en Complexity Tracking #3. |
| Stack frontend estricto (§2) | ✅ Sin agregados. La lista cerrada de §2 alcanza: React Router aporta `useSearchParams` para el estado de filtros (research #10) y el renderizado de tests usa utilidades propias de React. |
| Lenguaje TypeScript estricto (§2) | ✅ Ambos árboles. `npm run build` del cliente compila con `tsc -b`. |
| Capas Controller/Service/Repository/Adapter (§3) | ✅ `player` y `league` con sus cuatro capas. No interviene la capa Adapter: esta feature no consume ningún proveedor externo, solo lee lo ya persistido. |
| Resiliencia a fallas externas (§3) | ✅ Por construcción — la vista se alimenta exclusivamente de datos locales y caché. Una caída de Football-Data o WhoScored no la afecta. |
| Redis para consultas frecuentes (§2) | ✅ La caché del listado se conserva y se extiende: la clave incorpora los filtros nuevos y un número de versión que la ingesta incrementa (research #8). Resuelve la decisión que la spec difirió a esta fase. |
| Entidades solo en `/infrastructure/database/entities/` (§7) | ✅ N/A en la práctica: no se crea ni se modifica ninguna entidad. Tampoco se replica ningún tipo de entidad dentro de `/front` (§7). |
| Módulo de dominio con 5 elementos exactos (§7) | ⚠️ `league` cumple los 5 exactos. `player` suma 4 utilidades puras que entran por la **excepción explícita de §7** para archivos sin decoradores, sin inyección y sin acceso a base — Complexity Tracking #2. |
| `controller.ts` obligatorio (§7) | ✅ Ambos módulos tienen necesidad de HTTP genuina. |
| Estructura de `/front/src/` (§7) | ✅ La vista en `pages/`, las piezas nuevas en `components/`, las llamadas y el mapeo en `services/`. |
| Instancia única de Axios (§7) | ✅ Un `players.service.ts` nuevo en `services/` que usa el `httpClient` existente. Ningún componente invoca Axios. |
| Documentación Swagger obligatoria (§2, §6) | ✅ Los tres endpoints documentados con sus parámetros nuevos, sus esquemas y su requisito de sesión. Contrato en `contracts/home.openapi.yaml`, verificación en quickstart E13. |
| Validación estricta vía DTOs (§4) | ✅ `GetPlayersFilterDto` ampliado con `class-validator`, incluida la validación cruzada de rangos invertidos, bajo el `ValidationPipe` global que ya corre con `whitelist` y `forbidNonWhitelisted`. |
| Logs estructurados + Correlation IDs (§4) | ✅ Reusa `PinoLoggerService` y el middleware existente. El evento del listado se extiende con los filtros nuevos. |
| Health checks y métricas (§4) | N/A — esta feature no agrega superficie operativa nueva. |
| Registro inmutable de transacciones financieras (§4) | N/A — no ejecuta ninguna transacción. La compra está fuera de alcance (FR-032). |
| Scheduler (§4) | N/A — sin proceso periódico nuevo. |
| Tokens: 100 por jugador a 1 crédito (§5) | ✅ Es la fuente de las constantes de supply que expone el detalle (research #6). |
| Cotización con estrategias configurables y traza (§5) | N/A — el motor de cotizaciones está explícitamente fuera de alcance. Ver Complexity Tracking #1. |
| Validar saldos antes de transaccionar (§6) | N/A — sin transacciones. |
| No generar mocks si corresponde Adapter/MikroORM (§6) | ⚠️ La variación y la serie de 30 días son simuladas — Complexity Tracking #1. No sustituyen a ningún adapter ni a MikroORM: sustituyen a un motor que todavía no existe. |

**Resultado del gate:** **PASA** con tres anotaciones en Complexity Tracking, ninguna de las
cuales es una violación de una regla vigente: dos se apoyan en excepciones que la propia
constitución contempla (§7 utilidades puras, §5 tokens) y la tercera es un dato de maqueta que la
spec aprobó explícitamente.

**Re-evaluación post-Phase 1 (diseño cerrado):** el gate **sigue en PASA**. El diseño no introdujo
ninguna violación nueva y cerró tres puntos que en el gate previo eran intención y ahora son
decisión registrada:

- El filtrado por OVR y rareza quedó resuelto **dentro de la base** (research #1), así que no hay
  que traer el catálogo a memoria ni agregar una columna derivada. Desaparece el riesgo de
  desviarse de §3 metiendo lógica de persistencia en el servicio.
- La simulación de mercado quedó confinada a **un solo archivo puro y determinista**, lo que
  acota la tensión con §6 a una superficie mínima y hace que reemplazarla por el motor real sea
  cambiar una función.
- La invalidación de caché quedó definida como versionado de clave (research #8), lo que cumple la
  exigencia de Redis de §2 sin dejar la ventana de datos viejos que hoy existe.

Phase 1 no agregó ninguna dependencia a las cero con las que arrancó el plan.

## Project Structure

### Documentation (this feature)

```text
.specify/specs/06-home/
├── spec.md                     # Especificación (ya aprobada)
├── plan.md                     # Este archivo
├── research.md                 # Phase 0 output — 12 decisiones
├── data-model.md               # Phase 1 output
├── quickstart.md               # Phase 1 output — 21 escenarios
├── contracts/
│   └── home.openapi.yaml       # Phase 1 output
├── checklists/
│   └── requirements.md         # Checklist de calidad de la spec
├── home_Mockup.jpg             # Maqueta de referencia
└── tasks.md                    # Phase 2 — lo genera /speckit-tasks
```

### Source Code (repository root)

```text
back/src/
├── modules/
│   ├── player/                        # AMPLIADO
│   │   ├── player.module.ts
│   │   ├── player.controller.ts       # + parámetros nuevos y su documentación
│   │   ├── player.service.ts          # + clave de caché versionada, temporada vigente
│   │   ├── player.repository.ts       # → QueryBuilder con LEFT JOIN a stats
│   │   ├── dto/
│   │   │   ├── get-players-filter.dto.ts   # + 6 ejes de filtrado y validación cruzada
│   │   │   └── player-response.dto.ts      # → PlayerCardDto + PlayerDetailDto
│   │   ├── ovr.ts                     # NUEVO — utilidad pura (§7 excepción)
│   │   ├── rarity.ts                  # NUEVO — utilidad pura (§7 excepción)
│   │   ├── market-value.mock.ts       # NUEVO — utilidad pura, simulación determinista
│   │   └── nationality-code.ts        # NUEVO — utilidad pura, mapa país → ISO
│   └── league/                        # NUEVO — 5 elementos exactos
│       ├── league.module.ts
│       ├── league.controller.ts
│       ├── league.service.ts
│       ├── league.repository.ts
│       └── dto/league-response.dto.ts
├── infrastructure/database/migrations/
│   └── Migration<ts>.ts               # NUEVO — unaccent + 2 índices
└── app.module.ts                      # + LeagueModule

back/test/
└── players.e2e-spec.ts                # NUEVO

front/src/
├── pages/
│   └── HomePage.tsx                   # REESCRITO — orquesta, no habla con la red
├── components/
│   ├── player-card/                   # SIN TOCAR (FR-020)
│   ├── MarketFilters.tsx              # NUEVO
│   ├── PlayerGrid.tsx                 # NUEVO
│   └── PlayerDetailPanel.tsx          # NUEVO — incluye la maqueta inerte de compra
└── services/
    ├── players.service.ts             # NUEVO — usa el httpClient existente
    └── player-card.mapper.ts          # NUEVO — respuesta API → PlayerCardData
```

**Structure Decision**: web application con los dos árboles ya existentes. El backend mantiene el
vertical slicing de la constitución §7: se amplía `modules/player` porque el listado y el detalle
son del dominio de jugadores, y se crea `modules/league` en lugar de colgar un endpoint-cajón de
`players` (research #9). Las cuatro utilidades puras viven en la carpeta de `player` por la
excepción explícita de §7 y no constituyen una capa nueva. El frontend respeta el layout plano:
la vista en `pages/`, las piezas de interfaz en `components/`, y todo el tráfico HTTP y el mapeo
de respuestas en `services/`.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| **#1 — Datos de mercado simulados** (variación % y serie de 30 días), en tensión con §6 "no generar implementaciones mock" | La carta y el panel no se renderizan sin esos campos, y el motor de cotizaciones (§5) no existe ni entra en el alcance de esta feature. La spec lo aprobó explícitamente: FR-023 exige que se muestren como maqueta identificada. La simulación es determinista por jugador para que grilla y detalle coincidan (SC-011) y para que los tests puedan afirmar algo sobre ella. | *Dejar los campos vacíos*: el componente de carta quedaría a medio renderizar y la pantalla no demostraría la feature. *Implementar el motor de cotizaciones ahora*: es una feature entera —estrategias configurables, ponderaciones y traza por cotización (§5)— y multiplicaría el alcance. *Valores al azar por petición*: rompería SC-011 y haría la pantalla no testeable. La regla de §6 apunta a no mockear lo que corresponde resolver con Adapter o MikroORM; acá no hay ni adapter ni tabla que mockear. |
| **#2 — Cuatro utilidades puras en `modules/player/`**, frente al "exactamente" 5 elementos de §7 | §7 contempla la excepción de forma explícita: archivos planos, sin decoradores de NestJS, sin inyección y sin acceso a base, cuando la lógica debe ser testeable sin levantar el framework. Es exactamente el caso: el truncado del OVR, los cortes de rareza, el mapa de países y la simulación determinista son funciones puras y son el núcleo de lo que conviene cubrir con tests unitarios baratos (research #12). | *Meterlas en el service*: las volvería no testeables sin instanciar el módulo de Nest y mezclaría reglas de cálculo con orquestación. *Crear una capa `utils/` global*: §7 prohíbe carpetas globales por tipo de archivo. *Un módulo de dominio propio*: no son un dominio, son cálculo derivado del dominio de jugadores. |
| **#3 — Extensión `unaccent` de PostgreSQL** | FR-006 exige búsqueda insensible a acentos, y los nombres del catálogo vienen acentuados desde Football-Data.org. Resolverlo en la base mantiene filtro, conteo y paginación en una sola consulta. No es una ampliación del stack: PostgreSQL ya es el pilar autorizado por §2 y `unaccent` viene en el `contrib` estándar de la imagen que usa el `docker-compose` del proyecto. | *Columna `searchName` normalizada*: agrega una columna redundante, su backfill y la obligación de mantenerla en cada ingesta. *`ILIKE` a secas*: no cubre acentos, incumple FR-006. *Normalizar en la aplicación*: rompería la paginación, porque habría que traer los candidatos a memoria antes de descartar. |
