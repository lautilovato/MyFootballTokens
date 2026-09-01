# Quickstart: Validación del Catálogo de Jugadores

## Prerrequisitos
- Node.js LTS instalado, dependencias del backend instaladas (`cd back && npm install`).
- Nuevas dependencias agregadas por este feature (ver [[research]] #1, #5, #6, #7):
  `@nestjs/swagger`, `class-validator`, `class-transformer`, `@nestjs/cache-manager`,
  `cache-manager`, `cache-manager-ioredis-yet`, `nestjs-pino`, `pino-http`.
- `docker-compose.yml` actualizado con el servicio `redis` (además del `postgres`
  existente en el puerto 5433).
- `.env` con `REDIS_HOST` / `REDIS_PORT` agregados junto a las variables `DATABASE_*`
  existentes.

## Setup

```bash
cd back
docker compose up -d          # levanta postgres + redis
npm install
npx mikro-orm migration:up    # aplica la migración de baseValue + id uuid (ver data-model.md)
npm run start:dev
```

## Escenario 1: Listado con filtros y paginación

```bash
curl "http://localhost:3000/players?league=Premier%20League&position=FW&page=1&limit=20"
```

**Esperado:** `200 OK`, body con forma `PlayerListResponse` (ver
`contracts/players.openapi.yaml`), solo jugadores `FW` de la Premier League, `meta.total`
reflejando el conteo real filtrado.

**Verificar caché:** repetir el mismo request y confirmar (vía logs estructurados, ver
Escenario 4) un cache-hit en la segunda llamada; cambiar cualquier query param debe producir
un cache-miss porque la clave de caché incluye el query string completo.

## Escenario 2: Detalle de jugador existente

```bash
curl "http://localhost:3000/players/<uuid-de-un-player-real>"
```

**Esperado:** `200 OK` con el objeto `Player` completo (incluye `team`, `league` y
`baseValue`).

## Escenario 3: Casos límite

```bash
# UUID con formato inválido
curl -i "http://localhost:3000/players/no-es-un-uuid"
# Esperado: 400 Bad Request

# UUID válido pero inexistente
curl -i "http://localhost:3000/players/00000000-0000-0000-0000-000000000000"
# Esperado: 404 Not Found

# Paginación inválida
curl -i "http://localhost:3000/players?limit=abc"
# Esperado: 400 Bad Request (ValidationPipe global)
```

## Escenario 4: Documentación y trazabilidad
- Navegar a `http://localhost:3000/api` (Swagger UI) y confirmar que ambos endpoints y
  `GetPlayersFilterDto` están documentados (`@ApiTags`, `@ApiOperation`, `@ApiResponse`,
  `@ApiQuery`).
- Revisar la salida de logs del proceso `start:dev`: cada request a `GET /players` debe
  emitir una línea de log estructurado (JSON) desde `PlayerService` indicando los filtros
  aplicados y si fue cache-hit o cache-miss.

## Criterio de éxito
Los 4 escenarios anteriores pasan tal cual están descriptos; esto corresponde 1:1 con la
sección "Criterios de Aceptación" y "Casos Límite" del spec (`spec.md`).
