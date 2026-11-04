# Research: Rol de Administrador y Panel de Métricas de la Plataforma

Sin incógnitas abiertas: los puntos del diseño se resolvieron leyendo el código existente.

## 1. Dónde vive el rol

- **Decision**: columna `user.role` de texto, `not null default 'user'`, con CHECK (`user`, `admin`).
- **Rationale**: dos valores cerrados; el default deja las cuentas existentes y las del registro
  como usuarios sin tocar ese flujo (FR-001). Sigue el patrón de CHECK de `credits`.
- **Alternatives considered**: booleano `is_admin` (no escala a otro rol sin migrar); tabla de
  roles (sin caso de uso: un solo tipo de administrador).

## 2. Cómo se autoriza

- **Decision**: `AdminGuard` corre después de `JwtAuthGuard` y lee el rol de la base en cada pedido.
  El JWT no cambia. Sin el rol lanza `ForbiddenException` con `code: 'FORBIDDEN'` en el cuerpo.
- **Rationale**: FR-004 exige rechazar a quien perdió el rol aunque su sesión siga vigente.
  `ApiErrorFilter` convierte en 500 cualquier excepción sin código, así que el código es obligatorio.
- **Alternatives considered**: rol en el JWT (queda vigente hasta que venza); agregar 403 al filtro
  (innecesario: el filtro ya respeta los códigos de dominio).

## 3. Cómo se implementa el seed

- **Decision**: función `seedAdmin(em, env)` y un entrypoint que se corre con `tsx`
  (`npm run seed:admin`). Credenciales en `ADMIN_SEED_EMAIL`, `ADMIN_SEED_PASSWORD` y, opcional,
  `ADMIN_SEED_USERNAME`.
- **Rationale**: es una operación puntual y `tsx` ya está en el proyecto. Separar la función permite
  probarla en el e2e sin lanzar un proceso.
- **Alternatives considered**: `@mikro-orm/seeder` (agrega un paquete para una sola fila); correr al
  arrancar la app (la spec lo excluye); migración (dejaría credenciales en el repositorio).

Validación: mismas reglas que `RegisterDto`, con `isEmail` y largo mínimo de 8. Upsert atómico con
`insert ... on conflict ("email") do update set "role" = 'admin' where "user"."role" <> 'admin'`.
Sin fila devuelta significa que ya era administradora. Solo se actualiza el rol (FR-010).

## 4. Backfill de créditos

- **Decision**: `findUsersWithoutInitialGrant` agrega `u."role" <> 'admin'`.
- **Rationale**: `CreditsService.onApplicationBootstrap` corre el backfill al arrancar y le daría
  créditos a la cuenta del seed (FR-009).
- **Alternatives considered**: darle al administrador un movimiento de monto 0 (ensucia la
  conciliación y las entregas iniciales).

## 5. Consistencia y consultas

- **Decision**: todas las consultas corren en una transacción `REPEATABLE READ`, solo lectura.
- **Rationale**: FR-026 pide que los números de una carga salgan del mismo cálculo; si no, una
  apertura en el medio rompería la conciliación en falso.
- **Alternatives considered**: vistas materializadas (más piezas para datos de hasta 1 minuto).

No se agregan índices: los agregados recorren tablas chicas y la caché limita los cálculos.

## 6. Caché

- **Decision**: clave `admin:metrics:<from>:<to>:<timezone>` con TTL de 60 s. `refresh=true` la
  saltea y la reescribe. Las fallas de Redis se loguean y se calcula igual, como en `PacksService`.
- **Rationale**: constitución §2 y FR-026. Los guards corren antes de la caché: nunca se sirve a
  quien no tiene el rol.
- **Alternatives considered**: `CacheInterceptor` (no permite saltear la caché por pedido).

## 7. Período y zona horaria

- **Decision**: el cliente manda `from` y `to` como `YYYY-MM-DD` y `timezone` como nombre IANA
  (`@IsTimeZone`). Sin `from` ni `to` es «Todo». Los límites se resuelven en SQL:
  `created_at >= (?::date::timestamp at time zone ?)` y `< ((?::date + 1)::timestamp at time zone ?)`.
- **Rationale**: el servidor tiene que agrupar por día local; con instantes sueltos no sabría la
  zona. Consistente con la spec 10 (FR-038), que usa la zona del navegador.
- **Alternatives considered**: días en UTC (una venta de las 22:00 en Argentina caería al día
  siguiente).

## 8. Tramos del gráfico

- **Decision**: la consulta agrupa con `date_trunc(unidad, created_at at time zone tz)`, y una
  función pura rellena con ceros los tramos vacíos. Hasta 31 días, día; hasta 182, semana; más, mes.
- **Rationale**: los rellenos se pueden probar sin base de datos. `date_trunc('week')` arranca el
  lunes, como pide la spec.
- **Alternatives considered**: `generate_series` en SQL (más difícil de probar).

«Todo» arranca en la primera apertura o compra registrada.

## 9. Rareza

- **Decision**: reusar `raritySqlCase('p."world_reputation"', 'common')`.
- **Rationale**: spec 08, FR-069: es la única regla de rareza del sistema.

## 10. Recharts

- **Decision**: `recharts` 3, compatible con React 19. Dos componentes: actividad (barras por tramo)
  y barras por categoría (rareza y sobres). Colores con las variables de Tailwind.
- **Rationale**: autorizado por el equipo y habilitado por la constitución v4.2.0. Dibuja SVG, sin
  CSS global.
- **Alternatives considered**: seguir con SVG propio (la spec 10 lo hizo por la lista cerrada, que
  ya no aplica para esto); `chart.js` (canvas, menos accesible).
