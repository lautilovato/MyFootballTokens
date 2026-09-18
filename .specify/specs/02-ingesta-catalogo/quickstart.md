# Quickstart: Validación de la Ingesta de Catálogo

## Prerrequisitos
- Backend instalado (`cd back && npm install`).
- Nuevas dependencias de este feature (ver [[research]] #1): `@nestjs/axios`, `axios`.
- `docker-compose.yml` con `postgres` levantado (mismo servicio que `01-catalogo-jugadores`,
  puerto 5433).
- Variables de entorno nuevas en `.env`, junto a las `DATABASE_*` existentes:
  ```
  FOOTBALL_DATA_BASE_URL=https://api.football-data.org/v4
  FOOTBALL_DATA_API_KEY=<tu_api_key>
  FOOTBALL_DATA_RATE_LIMIT_PER_MINUTE=10
  ```
- Migración aplicada con los campos nuevos de `League`/`Team`/`Player` (ver data-model.md).

## Setup

```bash
cd back
docker compose up -d
npm install
npx mikro-orm migration:up
npm run start:dev
```

## Escenario 1: Bootstrap inicial completo (User Story 1)

```bash
curl -X POST http://localhost:3000/ingestion/players
```

**Esperado:** `200 OK` tras varios minutos (el proceso respeta el rate limit configurado),
body `IngestionResult` (ver `contracts/ingestion.openapi.yaml`) con `leagues: 5` y `teams`/
`players` reflejando lo cargado. Confirmar con `GET /players` (módulo `01-catalogo-
jugadores`) que devuelve resultados.

## Escenario 2: Re-ejecución idempotente (User Story 2)

```bash
curl -X POST http://localhost:3000/ingestion/players
```

**Esperado:** mismo shape de respuesta; la cantidad de filas en `leagues`, `teams` y
`players` **no aumenta** respecto a antes de esta segunda corrida (verificable por conteo
directo en la base o repitiendo `GET /players?limit=1` y comparando `meta.total`).

## Escenario 3: Resiliencia ante falla parcial (User Story 3)

Simular una falla puntual (por ejemplo, cortar la conectividad de red durante la corrida, o
apuntar temporalmente `FOOTBALL_DATA_BASE_URL` a un valor inválido antes de reiniciar el
proceso a mitad de una corrida real).

**Esperado:** los logs muestran el error de ese equipo/liga puntual y el proceso continúa
con el resto; los datos de las ligas/equipos que sí se procesaron correctamente en esa misma
corrida quedan persistidos (no hay rollback total — spec.md SC-003).

## Escenario 4: Documentación y trazabilidad

- Navegar a `http://localhost:3000/api` (Swagger UI, ya montado por `01-catalogo-jugadores`)
  y confirmar que `POST /ingestion/players` está documentado.
- Revisar la salida de logs del proceso `start:dev` durante una corrida: debe verse una línea
  de log estructurado (JSON, vía `PinoLoggerService`) por cada liga y equipo procesado, y una
  línea de error por cada falla puntual.

## Criterio de éxito
Los 4 escenarios anteriores pasan tal cual están descriptos; corresponden 1:1 a las User
Stories y Edge Cases de `spec.md`.
