# Data Model: Sistema de Score y Cotización de Jugadores

**Feature**: `07-cotizacion` | **Date**: 2026-10-03 | **Plan**: [plan.md](./plan.md)

Todas las entidades viven en `/back/src/infrastructure/database/entities/` (constitución §7).
Los nombres de tabla y columna siguen la convención `snake_case` que MikroORM ya aplica en el
proyecto.

## Resumen

```text
valuation_strategy 1 ──< valuation_strategy_version 1 ──< quote_run 1 ──< player_quote >── 1 player
                                                   └───────────────────────< player_quote
player (+ world_reputation)
```

---

## Player *(modificada)*

| Campo | Tipo | Regla |
|---|---|---|
| `worldReputation` | `smallint`, nullable | **Nuevo.** 0–100 (CHECK en la base). Nulo = sin cargar (FR-023). |
| `baseValue` | `decimal(10,2)` | **Cambia de significado**: deja de ser placeholder y pasa a ser espejo del precio de la última cotización del jugador (research #10). La reescribe solo la corrida. Jugador nunca cotizado: `0`. |

Cambiar `worldReputation` no toca ninguna cotización (FR-026).

---

## ValuationStrategy *(nueva)* — `valuation_strategy`

| Campo | Tipo | Regla |
|---|---|---|
| `id` | `uuid` PK | |
| `key` | `varchar`, único | Identificador estable: `performance`, `prestige`. Formato `^[a-z][a-z0-9-]{2,39}$`. |
| `name` | `varchar` | Nombre visible («Performance», «Prestigio»). |
| `description` | `text` | |
| `active` | `boolean` | Índice único parcial `WHERE active = true` ⇒ nunca hay dos activas (FR-013). |
| `currentVersion` | `int` | Número de la última versión creada. |
| `createdAt` | `timestamptz` | |

**Activar** (FR-013): en una transacción, `UPDATE ... SET active = false WHERE active` y luego
`SET active = true` sobre la elegida. El índice parcial hace imposible el estado con dos
activas; la migración inicial deja `performance` activa, así que nunca hay cero.

## ValuationStrategyVersion *(nueva, inmutable)* — `valuation_strategy_version`

| Campo | Tipo | Regla |
|---|---|---|
| `id` | `uuid` PK | |
| `strategy` | FK → `valuation_strategy` | |
| `version` | `int` | Único junto con `strategy`. Empieza en 1 y crece de a 1 (FR-011). |
| `weights` | `jsonb` | `{ general: Weights, byPosition: { GK?, DF?, MF?, FW?: Weights } }`. |
| `baseValue` | `int` | ≥ 0. Por defecto 100. |
| `scaleFactor` | `int` | > 0. Por defecto 900. |
| `minPrice` | `int` | ≥ 1. Por defecto 10. |
| `defaultReputation` | `smallint` | 0–100. Por defecto 20 (FR-025, research #8). |
| `createdAt` | `timestamptz` | |

`Weights` es un objeto `{ [metric]: number }` sobre el catálogo cerrado de métricas:
`goals`, `assists`, `shots`, `keyPasses`, `dribbles`, `tackles`, `rating`, `absence`,
`worldReputation`. Una métrica ausente vale 0. Un perfil por posición **reemplaza** a los
pesos generales completos (no se mezcla con ellos).

**Reglas de validación** (FR-012) — se aplican al crear una versión; si alguna falla, no se
crea nada:

- Solo claves del catálogo de métricas; posiciones solo `GK`, `DF`, `MF`, `FW`.
- Cada peso en `[-1, 1]` y con a lo sumo 4 decimales.
- Cada perfil (el general y cada uno por posición) tiene al menos un peso positivo.
- `scaleFactor > 0`, `minPrice ≥ 1`, `baseValue ≥ 0`, `defaultReputation` en 0–100, todos
  enteros.

Ninguna fila se actualiza ni se borra nunca: el repositorio solo inserta.

## QuoteRun *(nueva)* — `quote_run`

| Campo | Tipo | Regla |
|---|---|---|
| `id` | `uuid` PK | |
| `trigger` | enum `AUTOMATIC` \| `MANUAL` | |
| `strategyVersion` | FK → `valuation_strategy_version`, nullable | Nulo solo en corridas `SKIPPED` o que fallaron antes de resolver la estrategia. |
| `status` | enum `RUNNING` \| `COMPLETED` \| `FAILED` \| `SKIPPED` | Índice único parcial `WHERE status = 'RUNNING'` (research #2). |
| `season` | `varchar`, nullable | Temporada sobre la que se calculó. |
| `startedAt` | `timestamptz` | |
| `finishedAt` | `timestamptz`, nullable | |
| `quotedCount` | `int` | 0 hasta completar. |
| `skippedCount` | `int` | Jugadores del catálogo sin estadísticas de la temporada (FR-022). |
| `failureReason` | `text`, nullable | Motivo si `FAILED`; `run in progress` si `SKIPPED`; `interrupted` si quedó colgada. |
| `normalizationBounds` | `jsonb`, nullable | `{ [metric]: { p5, p95 } }` del lote (research #4). |
| `correlationId` | `varchar` | Correlation ID de la petición, o uno generado para la corrida automática (FR-035). |

**Transiciones**:

```text
           ┌──────────► COMPLETED
RUNNING ───┤
           └──────────► FAILED   (error del cálculo / de la transacción / "interrupted" al arrancar)
SKIPPED    (estado inicial y final: otro RUNNING ya existía)
```

## PlayerQuote *(nueva, inmutable)* — `player_quote`

| Campo | Tipo | Regla |
|---|---|---|
| `id` | `uuid` PK | |
| `player` | FK → `player` | |
| `run` | FK → `quote_run` | |
| `strategyVersion` | FK → `valuation_strategy_version` | Siempre presente: no hay cotizaciones provisorias. |
| `origin` | enum `AUTOMATIC` \| `MANUAL` | Igual al `trigger` de la corrida. |
| `season` | `varchar` | |
| `score` | `numeric(9,4)` | ≥ 0, sin tope superior (FR-001). Era `numeric(5,4)` con tope en 1; ensanchado por `Migration20261013144800`. |
| `rawScore` | `numeric(8,4)` | Suma de contribuciones antes del piso en 0 (negativa solo si las penalizaciones dominan). |
| `price` | `int` | Créditos enteros, ≥ `minPrice` de la versión (FR-002). |
| `positionProfile` | enum `GENERAL` \| `GK` \| `DF` \| `MF` \| `FW` | Qué perfil de pesos se aplicó. |
| `positiveWeightSum` | `numeric(6,4)` | `S⁺` del perfil aplicado (FR-007). |
| `breakdown` | `jsonb` | Arreglo de `{ metric, raw, normalized, weight, contribution }` (FR-002b). |
| `usedDefaultReputation` | `boolean` | FR-025. |
| `missingMatchesPlayed` | `boolean` | Edge case «datos incompletos». |
| `calculatedAt` | `timestamptz` | Igual para todo el lote: el instante de confirmación de la corrida. |

**Índices**: `(player_id, calculated_at DESC)` para cotización actual e historial;
`(run_id)` para el espejo de `base_value`.

**Invariantes** (cubiertos por los tests de `score-calculator.spec.ts` y e2e):

- `Σ breakdown[].contribution = rawScore` (con tolerancia 0,0001, SC-002a).
- `score = round4(clamp(rawScore, 0, 1))`.
- `price = max(minPrice, round(baseValue + score × scaleFactor))`.
- Repetir el cálculo con `breakdown` y la versión referenciada reproduce `score` y `price`
  (SC-002).

**Variación de precio** (FR-019): no se almacena; se calcula al leer comparando con la
cotización inmediatamente anterior del mismo jugador. `changePct = null` si no hay anterior.

---

## Valores sembrados

La migración crea las dos estrategias en versión 1, con `baseValue = 100`,
`scaleFactor = 900`, `minPrice = 10`, `defaultReputation = 20`, y deja `performance` activa.
Las posiciones sin perfil (`FW`, `UNKNOWN`) usan los pesos generales (research #7). Cada
perfil suma 1 en sus pesos positivos.

**Performance**

| Métrica | General (y FW) | MF | DF | GK |
|---|---|---|---|---|
| goals | 0,25 | 0,10 | 0,05 | — |
| assists | 0,15 | 0,20 | 0,05 | — |
| shots | 0,10 | 0,05 | — | — |
| keyPasses | 0,10 | 0,20 | 0,10 | 0,05 |
| dribbles | 0,10 | 0,15 | 0,05 | — |
| tackles | 0,10 | 0,10 | 0,40 | 0,05 |
| rating | 0,20 | 0,20 | 0,35 | 0,90 |
| absence | −0,10 | −0,10 | −0,10 | −0,10 |
| worldReputation | — | — | — | — |

**Prestigio**

| Métrica | General (y FW) | MF | DF | GK |
|---|---|---|---|---|
| worldReputation | 0,60 | 0,60 | 0,60 | 0,60 |
| rating | 0,15 | 0,15 | 0,20 | 0,40 |
| goals | 0,08 | 0,04 | 0,02 | — |
| assists | 0,05 | 0,07 | 0,02 | — |
| keyPasses | 0,04 | 0,08 | 0,03 | — |
| dribbles | 0,04 | 0,04 | — | — |
| tackles | 0,04 | 0,02 | 0,13 | — |
| shots | — | — | — | — |
| absence | −0,05 | −0,05 | −0,05 | −0,05 |

## Normalización por métrica

| Métrica | Fuente (`player_season_stats` / `player`) | Normalización |
|---|---|---|
| goals, assists | `goals`, `assists` (totales) | percentiles p5–p95 del lote |
| shots, keyPasses, dribbles, tackles | `shots_per_game`, `key_passes`, `dribbles`, `tackles` | p5–p95; 0 si `matches_played` es nulo |
| rating | `rating` | p5–p95 |
| absence | `1 − matches_played / max(matches_played)` de la liga | ya en [0,1]; 0 si `matches_played` es nulo |
| worldReputation | `player.world_reputation` (o `defaultReputation`) | `/ 100` |
