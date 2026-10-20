# Specification Quality Checklist: Créditos, Sobres e Inventario

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-10-13
**Updated**: 2026-10-13 (revisión 3: pantallas de sobres e inventario del cliente web en alcance)
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

- Decisiones del equipo en las revisiones del 2026-10-13:
  1. **Sin superusuario** (rev. 2, FR-042): los tokens sin dueño pertenecen a la plataforma. La constitución v4.0.0 §5 ya está alineada.
  2. **Cuatro tipos de sobre con stock finito** (rev. 2, FR-008 a FR-017): `common`, `rare`, `epic` y `legendary`; cada lote reparte exactamente todos sus tokens, así que nunca hay sobres incompletos.
  3. **Pantallas de sobres e inventario en alcance** (rev. 3, User Stories 5 y 6, FR-052 a FR-066). Las pantallas de historial de una carta y de historial de aperturas siguen fuera.
- Decisiones tomadas por el autor de la spec que conviene revisar con el equipo antes de `/speckit-plan` (ninguna bloquea):
  1. **Destino de los créditos cobrados**: son ingreso de la plataforma y salen de circulación, sin acreditarse a ninguna cuenta; la suma de los saldos es igual al total emitido menos el total cobrado (FR-007, constitución v4.0.0 §5).
  2. **Valores por defecto**: 2.000 créditos iniciales y los cuatro tipos con sus precios y probabilidades (ver Assumptions), con su equilibrio económico a calibrar con la spec de venta.
  3. **Precio vigente al abrir**: si el precio de un tipo cambia entre que el usuario lo ve y confirma, se cobra el vigente y la pantalla muestra lo efectivamente cobrado (FR-046, Edge Cases "Pantalla desactualizada").
  4. **Probabilidades visibles** según la composición real del stock, en la API y en la pantalla (FR-010, FR-054).
  5. **Sin clave de idempotencia**: cada apertura enviada es una apertura; la pantalla bloquea una segunda apertura en curso (FR-057).
  6. **Saldo en el encabezado** del cliente web (FR-053): junto con los accesos a las pantallas nuevas y el origen del OVR (FR-067), son los únicos cambios sobre la home.
  7. **Configuración por entorno**, sin pantalla de administración (FR-044).
- Esta spec introduce el saldo de créditos y la emisión de 100 tokens por jugador, que la spec 07 dejó fuera de alcance y la constitución v4.0.0 (§5) ya prevé. Las pantallas de sobres e inventario se apoyan en §2 v4.0.0 (animaciones y CSS por componente) y §7 (estructura del cliente web).
- Validación: se revisó la spec contra cada ítem en una iteración; las referencias a "endpoints" y "contrato de la API" (FR-051) y a componentes ya construidos (Assumptions) se mantienen como requisitos de trazabilidad exigidos por la constitución, no como diseño.
- Validación de la revisión 3 (`/speckit-specify`, 2026-10-13), una iteración. Se corrigió: (a) las historias de las pantallas (P2) estaban después del historial de aperturas (P3); se reordenaron por prioridad y el historial pasó a ser la User Story 7; (b) la narrativa de la pantalla de sobres prometía revelar las cartas "una por una" sin requisito que lo respalde; se quitó; (c) la User Story 6 nombra el acceso al inventario al terminar una apertura, que ningún requisito cubría; se agregó a FR-059. Las columnas HTTP de la tabla de códigos de error y los nombres de componentes en Assumptions se mantienen como en las revisiones anteriores (trazabilidad).
