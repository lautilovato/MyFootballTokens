# Especificación: Catálogo de Jugadores

## 1. Contexto y Objetivo
El sistema debe exponer un catálogo de jugadores de fútbol pertenecientes a las 5 ligas principales (Premier League, Bundesliga, La Liga, Serie A y Ligue 1). Este módulo es de solo lectura para los clientes, permitiendo listar jugadores con filtros específicos y consultar el detalle individual de cada uno.

## 2. Modelo de Datos (Entidad)
Se requiere la creación de la entidad `Player` para MikroORM. 
**Ubicación estricta:** `/back/src/infrastructure/database/entities/Player.entity.ts`

**Propiedades mínimas requeridas:**
*   `id`: UUID (Primary Key).
*   `externalId`: String (ID de referencia de la API externa WhoScored/Football-Data).
*   `name`: String.
*   `position`: String (ej. FW, MF, DF, GK).
*   `team`: String.
*   `league`: String.
*   `baseValue`: Decimal/Numeric (Valor base inicial antes de cotizaciones).
*   `createdAt` y `updatedAt`: Timestamps.

## 3. Contratos de API (Endpoints)
El controlador debe exponer los siguientes endpoints bajo el prefijo `/players`:

### 3.1. Listado de Jugadores
*   **Método:** `GET /players`
*   **Query Parameters (Opcionales):** `league`, `team`, `position`, `page`, `limit`.
*   **Comportamiento:** Devuelve una lista paginada de jugadores filtrada por los parámetros enviados. 
*   **DTO:** Se debe crear un `GetPlayersFilterDto` validado con `class-validator`.

### 3.2. Detalle de Jugador
*   **Método:** `GET /players/:id`
*   **Path Parameter:** `id` (UUID válido).
*   **Comportamiento:** Devuelve la información completa del jugador solicitado.

## 4. Criterios de Aceptación (Definition of Done)
1.  **Arquitectura:** Los archivos `player.module.ts`, `player.controller.ts`, `player.service.ts`, `player.repository.ts` y los DTOs deben ubicarse exclusivamente dentro de `/back/src/modules/player/`.
2.  **Documentación:** Ambos endpoints y el DTO deben estar completamente documentados con los decoradores de `@nestjs/swagger` (`@ApiTags`, `@ApiOperation`, `@ApiResponse`, `@ApiQuery`).
3.  **Caché (Redis):** Las respuestas del endpoint `GET /players` deben estar cacheadas, utilizando el patrón adecuado en NestJS (Interceptor de caché o servicio de caché manual) para optimizar las consultas repetitivas.
4.  **Trazabilidad:** Inyectar y utilizar el logger estructurado en el `PlayerService` para registrar la consulta de datos.

## 5. Casos Límite y Manejo de Errores
*   Si se solicita un ID de jugador en `GET /players/:id` que no existe en la base de datos, retornar un HTTP 404 (Not Found).
*   Si el `id` proporcionado en la URL no tiene un formato UUID válido, retornar un HTTP 400 (Bad Request).
*   Si se envían parámetros de paginación inválidos (ej. `limit=abc`), retornar un HTTP 400 manejado automáticamente por el ValidationPipe.