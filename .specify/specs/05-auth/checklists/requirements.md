# Specification Quality Checklist: Autenticación, Control de Acceso (JWT & API Key) e Interfaz de Usuario

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-09-17
**Last validated**: 2026-09-17 (contra constitución v2.0.0)
**Feature**: [spec.md](../spec.md)

## Content Quality

- [~] No implementation details (languages, frameworks, APIs) — *desviación deliberada, ver Nota 1*
- [x] Focused on user value and business needs
- [~] Written for non-technical stakeholders — *parcial, ver Nota 1*
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain — **resuelto**, ver Nota 2
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic (no implementation details)
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes defined in Success Criteria
- [~] No implementation details leak into specification — *ver Nota 1*

## Notes

### Nota 1 — Detalle de implementación presente de forma deliberada

La spec nombra `bcrypt`, JWT, Guards del framework, `localStorage`, Tailwind CSS y los nombres
concretos de variables de entorno (`JWT_SECRET`, `JWT_EXPIRATION`, `ADMIN_API_KEY`). En una spec
estrictamente agnóstica esto no correspondería.

Se mantienen porque **no son elecciones del redactor de la spec sino restricciones ya vinculantes**:

- `bcrypt`, los nombres de variables de entorno y la estética de la UI vienen impuestos por la
  versión original escrita a mano de esta spec (conservada en `spec.original.md`).
- Tailwind CSS, Axios y el resto del stack de cliente vienen impuestos por la constitución §2 (v2.0.0),
  que es una lista de prohibición: lo que no figura, está vedado.
- Swagger y la separación en capas/Guards vienen impuestos por la constitución §2, §4 y §6.
- La spec hermana `04-team-whoscored-matching` sienta el mismo precedente al nombrar
  `name-matcher.ts` y `WHO_SCORED_MATCH_THRESHOLD` dentro de sus Functional Requirements.

Los **Success Criteria sí se mantuvieron completamente agnósticos** de tecnología, que es donde
el criterio importa para validar el resultado sin conocer la implementación.

### Nota 2 — Decisiones pendientes de la spec original: ambas cerradas

1. **Almacenamiento de la credencial en el cliente** → resuelto por `localStorage` (FR-019).
   Consistente con la §7 de la constitución, que exige los interceptores de autenticación
   en `/front/src/services/`; una cookie `HttpOnly` los volvería inoperantes. La contrapartida (credencial
   legible por JavaScript, expuesta ante un XSS) queda aceptada y registrada en Assumptions.
2. **Umbral del rate limit** → resuelto con un default del orden de 5 intentos por minuto y
   origen, configurable, registrado en Assumptions.

### Nota 3 — Conflicto con la constitución: cerrado

La versión anterior de este checklist marcaba como bloqueante que las historias 3 y 4 y los
requisitos FR-016 a FR-026 describían una aplicación cliente no autorizada por la §2.

Ese bloqueo ya no existe. La constitución v1.2.0 incorporó el stack de frontend, v1.3.0 sumó
React Router y Vitest, v1.3.1 reparó la coherencia de §1/§3/§7, y v2.0.0 redefinió la
estructura de `/front/src/` al layout plano `pages/ · components/ · services/ · app/`. Las
cuatro historias de esta spec son hoy ejecutables sin enmiendas adicionales.

---

- Items marked incomplete require spec updates before `/speckit-clarify` or `/speckit-plan`
- **Estado: listo para `/speckit-plan`.**
