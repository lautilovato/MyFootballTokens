# Specification Quality Checklist: Créditos, Sobres e Inventario

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-10-13
**Updated**: 2026-10-13 (revisión: catálogo de tipos de sobre + pantalla de sobres del cliente)
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain
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
- [x] No implementation details leak into specification

## Notes

- Decisiones del equipo en la revisión del 2026-10-13:
  1. **Varios tipos de sobre** (FR-007 a FR-009, FR-020, FR-022): cada tipo con nombre, nivel visual, serie, precio, cantidad de cartas y probabilidades propias. Reemplaza la suposición anterior de un sobre único.
  2. **Pantalla de sobres en alcance** (User Story 3, FR-039 a FR-048): saldo, catálogo, confirmación, apertura animada y revelación. Las pantallas de inventario e historial siguen fuera.
- Decisiones tomadas por el autor de la spec que conviene revisar con el equipo antes de `/speckit-plan` (ninguna bloquea):
  1. **Tokens insuficientes**: el sobre se rechaza sin cobrar; no se entregan sobres incompletos (FR-013).
  2. **Destino de los créditos cobrados**: se acreditan al superusuario para conservar el total de créditos (FR-036).
  3. **Valores por defecto**: 1.000 créditos iniciales y catálogo Estándar / Premium / Élite (ver Assumptions), con su equilibrio económico a calibrar con la spec de venta.
  4. **Precio confirmado**: si el precio de un tipo cambia entre que el usuario lo ve y confirma, la apertura se rechaza sin cobrar (FR-011).
  5. **Probabilidades visibles** en el catálogo y en la pantalla (FR-008, FR-040).
  6. **Sin clave de idempotencia**: cada apertura enviada es una apertura; la pantalla bloquea una segunda apertura en curso (FR-044).
  7. **Catálogo por configuración**, sin pantalla de administración.
- Esta spec introduce el saldo de créditos y la emisión de 100 tokens por jugador, que la spec 07 dejó fuera de alcance y la constitución v3.3.0 (§5) ya prevé. La pantalla de sobres se apoya en §2 v3.3.0 (animaciones y CSS por componente).
- Validación: se revisó la spec contra cada ítem en una iteración; las referencias a "endpoints" y "contrato de la API" (FR-052) y a componentes ya construidos (Assumptions) se mantienen como requisitos de trazabilidad exigidos por la constitución, no como diseño.
