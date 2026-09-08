# Data Model: Catálogo de Jugadores

## Entidad: `Player` (MikroORM)

**Ubicación:** `/back/src/infrastructure/database/entities/player.entity.ts` (ya existe,
requiere modificación — ver [[research]] decisiones 1 y 4).

| Campo | Tipo | Notas |
|---|---|---|
| `id` | `uuid` | **Cambia** de `number` a `uuid` (default `v4()`). Requiere migración. |
| `fullName` | `string` | Ya existe. Corresponde a `name` del spec. |
| `position` | enum `PlayerPosition` (`GK`\|`DF`\|`MF`\|`FW`) | Ya existe. |
| `externalWhoScoredId` | `string`, nullable | Ya existe. |
| `externalFootballDataId` | `string`, nullable | Ya existe. |
| `baseValue` | `decimal(10,2)` | **Nuevo campo.** Requiere migración. No nullable. |
| `team` | `ManyToOne<Team>` | Ya existe (relación, no string plano — ver research #2). |
| `createdAt` | `Date` (`onCreate`) | Ya existe. |
| `updatedAt` | `Date`, nullable (`onUpdate`) | Ya existe. |

### Reglas de validación (a nivel de entidad / migración)
- `id`: UUID v4, generado por la base o por MikroORM al crear.
- `baseValue`: numérico positivo, precisión 10, escala 2.
- `position`: restringido al enum existente (`check` constraint ya vigente en la tabla).
- Al menos uno de `externalWhoScoredId` / `externalFootballDataId` debe estar presente
  (regla de negocio a validar en el adapter de ingestión, no en este módulo de solo
  lectura).

### Relaciones (sin cambios respecto al esquema actual)
- `Player.team` → `Team` (N:1)
- `Team.league` → `League` (N:1)
- `Team.players` → `Player[]` (1:N, inverso)
- `League.teams` → `Team[]` (1:N, inverso)

### Transiciones de estado
No aplica — este módulo es de solo lectura (no crea, actualiza ni elimina jugadores).

## DTOs (nuevos, en `/back/src/modules/player/dto/`)

### `GetPlayersFilterDto` (query params de `GET /players`)

| Campo | Tipo | Validación (`class-validator`) | Default |
|---|---|---|---|
| `league` | `string`, opcional | `@IsOptional() @IsString()` | — |
| `team` | `string`, opcional | `@IsOptional() @IsString()` | — |
| `position` | `PlayerPosition`, opcional | `@IsOptional() @IsEnum(PlayerPosition)` | — |
| `page` | `number`, opcional | `@IsOptional() @Type(() => Number) @IsInt() @Min(1)` | 1 |
| `limit` | `number`, opcional | `@IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100)` | 20 |

### `PlayerResponseDto` (forma de cada elemento en la respuesta)

| Campo | Tipo | Origen |
|---|---|---|
| `id` | `string` (uuid) | `Player.id` |
| `name` | `string` | `Player.fullName` |
| `position` | `string` | `Player.position` |
| `team` | `string` | `Player.team.name` (derivado, ver research #2) |
| `league` | `string` | `Player.team.league.name` (derivado) |
| `baseValue` | `number` | `Player.baseValue` |
| `externalId` | `string` \| `null` | `externalWhoScoredId ?? externalFootballDataId` (research #3) |
| `createdAt` | `string` (ISO) | `Player.createdAt` |
| `updatedAt` | `string` (ISO) \| `null` | `Player.updatedAt` |

### Envelope de listado paginado

```json
{
  "data": [ /* PlayerResponseDto[] */ ],
  "meta": { "total": 0, "page": 1, "limit": 20, "totalPages": 0 }
}
```

## Casos límite reflejados en el modelo
- `GET /players/:id` con `id` no-UUID → 400 (validado por `ParseUUIDPipe` en el controller,
  posible gracias al cambio de PK a `uuid`).
- `GET /players/:id` con UUID válido pero inexistente → 404 (`NotFoundException` en el
  service tras `findOne` vacío).
- `GET /players?limit=abc` → 400, manejado automáticamente por el `ValidationPipe` global
  (research #7) al fallar `@IsInt()` sobre `limit`.
