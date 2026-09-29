# Phase 1 — Data Model: 06-home

**Resumen**: esta feature **no crea ni modifica ninguna entidad**. Es de lectura pura sobre el
modelo que dejaron las features 01 a 04. El único cambio de base de datos es habilitar la
extensión `unaccent` y sus índices de apoyo (research #4).

---

## 1. Entidades existentes que participan

Ninguna cambia. Se listan solo los campos que esta feature consume.

### `Player` — `/back/src/infrastructure/database/entities/player.entity.ts`

| Campo | Tipo | Uso en esta feature |
|---|---|---|
| `id` | uuid | Identidad de la carta; semilla de la simulación de precio (research #5) |
| `fullName` | string | Nombre de la carta; objetivo de la búsqueda por texto (FR-006) |
| `position` | enum `GK/DF/MF/FW/UNKNOWN` | Filtro por posición (FR-002) y dato de la carta |
| `nationality` | string \| null | **Nombre** del país; se traduce a código ISO (research #7) |
| `height` | number \| null | Altura del panel de detalle (FR-012) |
| `baseValue` | decimal(10,2) | Valor de mercado actual y filtro por rango de valor (FR-003) |
| `team` | → `Team` | Club de la carta y camino hacia la liga |

> `externalWhoScoredId`, `externalFootballDataId`, `dateOfBirth` y `shirtNumber` no participan.

### `PlayerSeasonStats` — mismo directorio

| Campo | Tipo | Uso en esta feature |
|---|---|---|
| `player` | → `Player` | Join del listado y del detalle |
| `season` | string `"2025-2026"` | Se fija a la temporada vigente antes del join (research #2) |
| `goals` | number | Métrica de la carta y del detalle |
| `assists` | number | Métrica de la carta y del detalle |
| `shotsPerGame` | decimal(4,2) | Métrica del detalle (FR-012) |
| `keyPasses` | decimal(4,2) | Métrica del detalle (FR-012) |
| `dribbles` | decimal(4,2) | Métrica del detalle (FR-012) |
| `tackles` | decimal(4,2) | Métrica del detalle (FR-012) |
| `rating` | decimal(4,2) | **Origen del OVR y de la rareza**; soporte de los filtros (research #1) |

Relación con `Player`: 1 a 0..N en el esquema, 1 a 0..1 una vez fijada la temporada, gracias al
índice único `(player, season)`. El listado no une esta tabla: la consulta la referencia con
`EXISTS` para filtrar y la lee aparte para los jugadores de la página, de modo que la paginación
cuente jugadores sin depender de la condición de un join (research #3).

### `Team` y `League`

De `Team` se consumen `name` y `crestUrl` —que, contra lo que suponía la spec, **sí está cargado**
para los equipos del catálogo: la ingesta de Football-Data.org ya trae la URL del escudo; lo que
falta son las fotos de los jugadores—; de `League`, `name` para el
filtro (FR-001), la etiqueta del detalle (FR-013) y el endpoint de ligas (FR-011). `country` y
`code` acompañan la respuesta de `GET /leagues`.

---

## 2. Valores derivados

Ninguno se persiste. Todos se calculan al construir la respuesta.

### 2.1 OVR — FR-027, FR-028

```text
ovr(rating) = min(99, trunc(rating × 10))
```

Se descartan el segundo decimal en adelante, sin redondear.

| `rating` | OVR | Nota |
|---|---|---|
| 8,63 | 86 | |
| 8,07 | 80 | |
| 7,49 | 74 | 7,41 también da 74 — se trunca, no se redondea |
| 7,08 | 70 | Límite inferior de *Rare* |
| 6,94 | 69 | |
| 10,00 | 99 | Recorte de FR-028 |
| sin fila | `null` | Sin dato, distinto de cero (FR-015, FR-030) |

### 2.2 Rareza — FR-029, FR-030

| OVR | Rareza |
|---|---|
| ≥ 85 | `legendary` |
| 77–84 | `epic` |
| 70–76 | `rare` |
| < 70 | `common` |
| `null` (sin stats) | `common` |

Los cuatro valores coinciden exactamente con el tipo `Rarity` que el componente de carta ya
declara en `front/src/components/player-card/types.ts`.

### 2.3 Traducción de filtros a predicados — research #1

El `WHERE` nunca menciona el OVR ni la rareza; opera sobre `rating`:

| Entrada | Predicado |
|---|---|
| `ovrMin = n` | `rating >= n/10` |
| `ovrMax = n` | `rating < (n+1)/10` |
| `rarity` incluye `legendary` | `rating >= 8.5` |
| `rarity` incluye `epic` | `rating >= 7.7 AND rating < 8.5` |
| `rarity` incluye `rare` | `rating >= 7.0 AND rating < 7.7` |
| `rarity` incluye `common` | `rating < 7.0 OR rating IS NULL` |
| varias rarezas | unión (`OR`) de sus predicados |
| `ovrMin` u `ovrMax` presentes | además `rating IS NOT NULL` (FR-030) |

### 2.4 Mercado simulado — research #5

| Campo | Origen |
|---|---|
| `marketValue` | `player.baseValue` — dato real |
| `changePct` | Simulado, determinista por `player.id` |
| `history` (30 puntos) | Simulada, determinista por `player.id`, terminando en `marketValue` |
| `supply.total` | Constante 100 (constitución §5) |
| `supply.minted` | Constante 100 (constitución §5, todos en el superusuario) |

Los tres campos simulados se marcan como tales en el contrato y se aíslan en un único módulo
puro, para que el motor de cotizaciones real los reemplace tocando un solo archivo.

### 2.5 Código de nacionalidad — research #7

`nationality` (nombre del país) → `{ name, code }`, con `code` en ISO 3166-1 alpha-2 minúscula o
subdivisión de `flagcdn` para las selecciones británicas (`gb-eng`, `gb-sct`, `gb-wls`,
`gb-nir`). Un país ausente de la tabla devuelve `code: null` y la carta omite la bandera.

---

## 3. Cambio de base de datos

Una migración, sin DDL sobre tablas:

```text
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE INDEX ... ON player (unaccent(full_name));          -- búsqueda por nombre (FR-006)
CREATE INDEX ... ON player_season_stats (season, rating);  -- filtros de OVR y rareza (research #1)
```

El índice funcional exige que `unaccent` sea `IMMUTABLE`; en PostgreSQL se declara como `STABLE`,
así que la migración envuelve la llamada en una función propia marcada `IMMUTABLE`. Es el patrón
estándar para indexar `unaccent` y queda registrado acá porque es la única sutileza de la
migración.

`down()` revierte los índices y la función auxiliar. **No** elimina la extensión: puede haber sido
creada por otro motivo en el mismo esquema.

---

## 4. Contratos de datos de la respuesta

Forma normativa en [`contracts/home.openapi.yaml`](./contracts/home.openapi.yaml). Resumen:

### `PlayerCardDto` — elemento del listado (FR-009)

`id`, `name`, `position`, `ovr` (0–99 o `null`), `rarity`, `club { name, crestUrl }`,
`nationality { name, code }`, `goals`, `assists`, `marketValue`, `changePct`, `supply { minted,
total }`, `priceHistory`.

### `PlayerDetailDto` — detalle (FR-012 a FR-015)

Todo lo anterior más `league`, `height`, `shotsPerGame`, `keyPasses`, `dribbles`, `tackles`,
`rating` y `season`.

Las métricas ausentes viajan como `null`, nunca como `0` (FR-015). Es la distinción que permite al
cliente mostrar "sin dato" en lugar de un cero que parecería real.

### `LeagueDto` — `GET /leagues` (FR-011)

`id`, `name`, `country`, `code`.

---

## 5. Lo que esta feature no modela

- **Token** como entidad: el supply es presentación (research #6).
- **Cotización** e histórico de precios: simulados (research #5).
- **Billetera y saldo**: fuera de alcance por spec.
- **Portfolio y transacciones**: fuera de alcance por spec. La auditoría financiera inmutable de la
  constitución §4 no aplica porque esta feature no ejecuta ninguna transacción.
