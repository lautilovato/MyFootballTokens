# Tasks: Rol de Administrador y Panel de Métricas de la Plataforma

**Input**: Design documents from `.specify/specs/11-admin-panel/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/admin.openapi.yaml

**Tests**: incluidos, como en las specs 05 a 10 (constitución §1: trazabilidad para la auditoría
técnica). Los e2e corren contra la base de test.

## Phase 1: Setup

- [X] T001 Agregar `recharts` a `front/package.json`
- [X] T002 Agregar el script `seed:admin` a `back/package.json`

## Phase 2: Foundational

**Purpose**: el rol existe y se informa. Bloquea todas las historias.

- [X] T003 Agregar `UserRole` y `role` a `back/src/infrastructure/database/entities/user.entity.ts`
- [X] T004 Crear `back/src/infrastructure/database/migrations/Migration20261031120000.ts` con la columna, el default y el CHECK, y actualizar `.snapshot.json`
- [X] T005 Mover `BCRYPT_COST` y agregar `ADMIN_SEED_ENV` en `back/src/shared/auth/auth.constants.ts`
- [X] T006 Informar `role` en `back/src/modules/auth/dto/auth-response.dto.ts` y `back/src/modules/auth/auth.service.ts`
- [X] T007 [P] Sumar `role` a `StoredUser` en `front/src/services/session-storage.ts`

## Phase 3: User Story 1 - Crear la cuenta de administrador desde un seed (P1)

**Goal**: una cuenta administradora creada solo por seed.

**Independent Test**: correr el seed dos veces deja una sola cuenta; el registro no acepta un rol.

- [X] T008 [US1] Crear `back/src/infrastructure/database/seeds/admin.seed.ts` con validación y upsert
- [X] T009 [US1] Crear el entrypoint `back/src/infrastructure/database/seeds/run-admin-seed.ts`
- [X] T010 [US1] Excluir administradores de `findUsersWithoutInitialGrant` en `back/src/modules/credits/credits.repository.ts`
- [X] T011 [US1] Cubrir seed, rol en el login, rechazo en el registro y backfill en `back/test/admin.e2e-spec.ts`

## Phase 4: User Story 2 - Ver el panel con los números clave (P2)

**Goal**: el panel responde las cinco métricas pedidas, solo para administradores.

**Independent Test**: con datos conocidos, cada número coincide; sin rol no se obtiene ningún dato.

- [X] T012 [US2] Crear `back/src/shared/auth/admin.guard.ts` y exportarlo desde `auth-shared.module.ts`
- [X] T013 [US2] Crear `back/src/modules/admin/admin-period.ts` y `admin-period.spec.ts`
- [X] T014 [US2] Crear los DTO en `back/src/modules/admin/dto/`
- [X] T015 [US2] Crear `back/src/modules/admin/admin.repository.ts` con los agregados en una transacción
- [X] T016 [US2] Crear `back/src/modules/admin/admin.service.ts` con período, caché y armado
- [X] T017 [US2] Crear `back/src/modules/admin/admin.controller.ts` y `admin.module.ts`, y registrarlo en `back/src/app.module.ts`
- [X] T018 [US2] Crear `front/src/services/admin.service.ts`
- [X] T019 [P] [US2] Crear `front/src/components/AdminRoute.tsx` y la ruta en `front/src/app/App.tsx`
- [X] T020 [US2] Agregar el acceso a `front/src/components/AppHeader.tsx` y pasar `isAdmin` desde las páginas
- [X] T021 [US2] Crear `front/src/components/AdminStatCard.tsx` y `front/src/pages/AdminPage.tsx`
- [X] T022 [US2] Cubrir acceso (401, 403, clave, pérdida del rol) y métricas clave en `back/test/admin.e2e-spec.ts`

## Phase 5: User Story 3 - Ver el estado completo de cartas, sobres y mercado (P3)

**Goal**: desgloses y rankings.

**Independent Test**: cada desglose suma su total.

- [X] T023 [US3] Crear `front/src/components/AdminBarChart.tsx` con Recharts y su tabla
- [X] T024 [US3] Agregar cartas, rareza, sobres por tipo y mercado a `front/src/pages/AdminPage.tsx`
- [X] T025 [US3] Cubrir desgloses y ranking en `back/test/admin.e2e-spec.ts`

## Phase 6: User Story 4 - Ver la actividad y comprobar que la economía cierra (P4)

**Goal**: actividad en el tiempo y conciliaciones.

**Independent Test**: una base alterada a propósito muestra el aviso, sin corregir nada.

- [X] T026 [US4] Crear `front/src/components/AdminActivityChart.tsx` con Recharts y su tabla
- [X] T027 [US4] Crear `front/src/components/AdminReconciliation.tsx`
- [X] T028 [US4] Agregar actividad, créditos y conciliación a `front/src/pages/AdminPage.tsx`
- [X] T029 [US4] Cubrir conciliaciones y actividad en `back/test/admin.e2e-spec.ts`

## Phase 7: User Story 5 - Acotar el panel a un período (P5)

**Goal**: selector de fechas.

**Independent Test**: octubre y «Todo» dan promedios distintos y el mismo estado.

- [X] T030 [US5] Crear `front/src/pages/admin-period.ts`
- [X] T031 [US5] Crear `front/src/components/AdminPeriodSelector.tsx` y conectarlo en `front/src/pages/AdminPage.tsx`
- [X] T032 [US5] Cubrir períodos, zona horaria y entradas inválidas en `back/test/admin.e2e-spec.ts`

## Phase 8: Polish

- [X] T033 [P] Tests de front en `front/src/services/__tests__/admin.service.test.ts`, `front/src/pages/__tests__/admin-period.test.ts`, `front/src/pages/__tests__/admin-page.test.tsx`, `front/src/components/__tests__/admin-route.test.tsx`, `front/src/components/__tests__/admin-period-selector.test.tsx` y `front/src/components/__tests__/app-header.test.tsx`
- [X] T034 Correr tests, lint y build de `back` y `front`
- [X] T035 Validar el panel en el navegador según `quickstart.md`

## Dependencies

- Phase 2 bloquea todo. US1 no depende de otras historias.
- US2 necesita un administrador (US1). US3, US4 y US5 se apoyan en la página de US2.
- El backend de todas las historias se entrega junto en `GET /admin/metrics` (T013 a T017).

## Parallel Example

```text
T007 (front) puede ir junto con T005 y T006 (back).
T019 no depende de T018.
```

## Implementation Strategy

MVP: Phases 1 a 3. Después, US2 entrega las cinco métricas pedidas, y US3 a US5 suman sobre la
misma página.
