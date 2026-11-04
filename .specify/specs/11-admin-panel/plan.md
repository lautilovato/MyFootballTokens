# Implementation Plan: Rol de Administrador y Panel de Métricas de la Plataforma

**Branch**: `feat/admin-panel` | **Date**: 2026-10-31 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `.specify/specs/11-admin-panel/spec.md` (con Clarifications
del 2026-10-31)

## Summary

Las cuentas pasan a tener un rol. El administrador se crea solo con un seed y entra por el login
normal a `/admin`, un panel de solo lectura con métricas de usuarios, cartas, sobres, mercado y
créditos, con selector de fechas y conciliaciones. Las cuentas comunes se siguen creando en la web.

Enfoque técnico:

1. **Rol** (research #1, #2): columna `user.role` con CHECK, informada en las respuestas de login
   y registro. No va en el JWT: `AdminGuard` la lee de la base en cada pedido (FR-004).
2. **Seed** (research #3, #4): `npm run seed:admin` toma las credenciales del entorno y hace un
   upsert atómico. `findUsersWithoutInitialGrant` excluye a los administradores (FR-009).
3. **Backend, módulo `admin`** (research #5 a #8): `GET /admin/metrics`, con SQL agregado dentro de
   una transacción `REPEATABLE READ` de solo lectura, y caché en Redis de 60 s.
4. **Frontend**: ruta `/admin` protegida por `AdminRoute`, selector de período, tarjetas y gráficos
   con Recharts (constitución v4.2.0, §2), siempre con su tabla en texto.

## Technical Context

**Language/Version**: TypeScript en modo estricto: `typescript@6` en `/back` y `typescript@7` en
`/front`. Node.js 24 LTS.

**Primary Dependencies**:
- `/back`: NestJS, MikroORM (PostgreSQL), `@nestjs/swagger`, `class-validator`, `bcrypt` y `tsx`
  (ya presentes). No se agrega ninguna.
- `/front`: se agrega `recharts`, autorizado por la constitución v4.2.0 (§2), junto con su
  dependencia par `react-is`.

**Storage**:
- PostgreSQL: una columna nueva (`user.role`), con su CHECK y una migración (data-model.md).
- Redis: caché de las métricas por período, con TTL de 60 s (§2, FR-026).

**Testing**:
- `/back`, Jest: e2e nuevo `admin.e2e-spec.ts` (rol, seed, acceso, cada métrica, períodos,
  conciliaciones). Unitarios de `admin-period`. Modificados: `auth.service.spec.ts` y
  `credits.e2e-spec.ts` (el backfill excluye a los administradores).
- `/front`, Vitest con jsdom: `admin.service`, `admin-period`, `AdminRoute`, `AppHeader`,
  `AdminPeriodSelector`, `AdminPage`. Los gráficos se validan por su alternativa en texto, porque
  jsdom no mide tamaños.

**Target Platform**: servidor Node.js (una instancia) y SPA en navegadores actuales.

**Project Type**: web application (`/back` + `/front`).

**Performance Goals**: panel en menos de 2 s en p95 con 10.000 usuarios y 100.000 tokens (SC-007):
agregados sobre tablas chicas, y a lo sumo un cálculo por minuto y período gracias a la caché.

**Constraints**:
- Solo lectura (FR-030), sin datos personales en la respuesta (FR-031).
- Todos los números de una carga salen del mismo cálculo (FR-026).
- La autorización la decide el servidor, en cada pedido (FR-004).
- Rol y clave administrativa no se habilitan entre sí (FR-005).

**Scale/Scope**: 1 columna y 1 migración, 1 módulo nuevo con 1 endpoint, 1 guard, 1 seed. En el
front: 1 página, 1 servicio y 6 componentes nuevos.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Evaluado contra la constitución **v4.2.0**.

| Regla de la constitución | Cumplimiento planeado |
|---|---|
| Stack backend estricto (§2) | ✅ Ningún paquete nuevo. El seed es un script con `tsx`, que ya está. |
| Stack frontend estricto (§2) | ✅ `recharts`, habilitado por la enmienda v4.2.0; solo en componentes presentacionales, con datos por props y alternativa en texto. |
| TypeScript estricto (§2) | ✅ |
| Capas Controller/Service/Repository/Adapter (§3) | ✅ `admin` tiene las tres capas. Sin proveedor externo. |
| Resiliencia externa (§3) | ✅ Todo sale de datos locales. Una falla de Redis degrada a calcular sin caché. |
| Observabilidad (§4) | ✅ Correlation ID existente; cada rechazo por falta de rol se loguea con él (FR-033). |
| Auditoría financiera (§4) | ✅ No crea transacciones. La cuenta del seed no recibe créditos, así que no hay movimiento que registrar. |
| Scheduler (§4) | ✅ No aplica. |
| Validación de inputs vía DTOs (§4) | ✅ `AdminMetricsQueryDto`, más las reglas de período en una utilidad pura. |
| Manejo seguro de credenciales (§4) | ✅ El seed lee del entorno, hashea con el mismo costo que el registro y no imprime la contraseña. |
| §5 Tokens | ✅ El rol no da poder sobre tokens (FR-006); la aclaración de v4.2.0 lo fija. |
| §5 Créditos | ✅ No mueve créditos. Lo cobrado por la plataforma no se acredita al administrador. |
| §5 Precio, Cotización y Mercado | ✅ Solo lee precios ya cobrados (FR-021). |
| Swagger obligatorio (§6) | ✅ `contracts/admin.openapi.yaml` y decoradores en el controller. |
| Módulo de dominio con 5 elementos exactos (§7) | ✅ `admin/`, más la utilidad pura `admin-period.ts` (excepción de §7). |
| Entidades solo en `/infrastructure/database/entities/` (§7) | ✅ Solo cambia `user.entity.ts`. |
| Estructura del frontend (§7) | ✅ Red en `services/`, presentación en `components/`, orquestación en `pages/`. |

**Resultado del gate (pre-Phase 0):** PASA, sin violaciones que justificar.

**Re-evaluación post-Phase 1 (diseño cerrado):** el gate sigue en PASA. El guard vive en
`shared/auth/`, junto a los otros dos, porque es transversal y no pertenece a un dominio.

## Project Structure

### Documentation (this feature)

```text
.specify/specs/11-admin-panel/
├── plan.md                         # Este archivo
├── research.md                     # Phase 0 output
├── data-model.md                   # Phase 1 output
├── quickstart.md                   # Phase 1 output
├── contracts/
│   └── admin.openapi.yaml          # Phase 1 output
├── checklists/
│   └── requirements.md             # de /speckit-specify
└── tasks.md                        # Phase 2 output (/speckit-tasks)
```

### Source Code (repository root)

```text
back/
├── package.json                                       # MODIFICAR: + seed:admin
├── src/
│   ├── app.module.ts                                  # MODIFICAR: + AdminModule
│   ├── infrastructure/database/
│   │   ├── entities/user.entity.ts                    # MODIFICAR: + role
│   │   ├── migrations/Migration20261031120000.ts      # NUEVA: columna, default y CHECK
│   │   └── seeds/
│   │       ├── admin.seed.ts                          # NUEVO: validación y upsert
│   │       └── run-admin-seed.ts                      # NUEVO: entrypoint del comando
│   ├── shared/auth/
│   │   ├── admin.guard.ts                             # NUEVO: rol leído de la base
│   │   ├── auth.constants.ts                          # MODIFICAR: BCRYPT_COST, ADMIN_SEED_ENV
│   │   └── auth-shared.module.ts                      # MODIFICAR: exporta AdminGuard
│   └── modules/
│       ├── auth/                                      # MODIFICAR: role en la respuesta
│       ├── credits/credits.repository.ts              # MODIFICAR: backfill sin administradores
│       └── admin/                                     # NUEVO
│           ├── admin.module.ts
│           ├── admin.controller.ts                    # GET /admin/metrics
│           ├── admin.service.ts                       # período, caché y armado
│           ├── admin.repository.ts                    # agregados en una transacción
│           ├── admin-period.ts                        # utilidad pura + .spec.ts
│           └── dto/
│               ├── admin-metrics-query.dto.ts
│               └── admin-metrics-response.dto.ts
└── test/admin.e2e-spec.ts                             # NUEVO

front/src/
├── app/App.tsx                                        # MODIFICAR: ruta /admin
├── components/
│   ├── AdminRoute.tsx                                 # NUEVO
│   ├── AppHeader.tsx                                  # MODIFICAR: acceso al panel
│   ├── AdminPeriodSelector.tsx                        # NUEVO
│   ├── AdminStatCard.tsx                              # NUEVO
│   ├── AdminActivityChart.tsx                         # NUEVO: Recharts + tabla
│   ├── AdminBarChart.tsx                              # NUEVO: Recharts + tabla
│   └── AdminReconciliation.tsx                        # NUEVO
├── pages/
│   ├── AdminPage.tsx                                  # NUEVO
│   ├── admin-period.ts                                # NUEVO: atajos → días
│   └── {Home,Packs,Inventory,Profile}Page.tsx         # MODIFICAR: isAdmin al encabezado
└── services/
    ├── admin.service.ts                               # NUEVO
    └── session-storage.ts                             # MODIFICAR: role
```

**Structure Decision**: un módulo de dominio nuevo con vertical slicing, porque las métricas cruzan
todos los dominios y no pertenecen a ninguno. Lee las tablas con SQL propio, como `history`. En
`/front`, layout plano de §7.

## Complexity Tracking

| Desvío | Por qué hace falta | Alternativa descartada |
|---|---|---|
| Consulta a la base en cada pedido al panel, además de validar el JWT | Una cuenta que pierde el rol debe quedar afuera en su pedido siguiente (FR-004). | Rol en el JWT: seguiría vigente hasta que venza la sesión. |
| `refresh=true` para saltear la caché | «Actualizar» tiene que traer datos frescos (FR-026). | Sin parámetro: el botón devolvería lo mismo durante 60 s. |
