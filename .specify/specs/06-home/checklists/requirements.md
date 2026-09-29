# Specification Quality Checklist: Homepage de Mercado (Striker Market)

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-09-20
**Last validated**: 2026-09-20 (contra constitución v2.2.0, tras resolver las 3 clarificaciones)
**Feature**: [spec.md](../spec.md)

## Content Quality

- [~] No implementation details (languages, frameworks, APIs) — *desviación deliberada, ver Nota 1*
- [x] Focused on user value and business needs
- [~] Written for non-technical stakeholders — *parcial, ver Nota 1*
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain — **resueltos**, ver Nota 2
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic (no implementation details)
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified
- [x] Scope is clearly bounded — sección *Fuera de Alcance*
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes defined in Success Criteria
- [~] No implementation details leak into specification — *ver Nota 1*

## Notes

**Nota 1 — Referencias a rutas y artefactos existentes.** FR-020 nombra explícitamente
`front/src/components/player-card` y la sección *Cumplimiento de la Constitución* cita las
secciones de la constitución. Es la misma desviación deliberada que aceptó la feature 05:
la constitución del proyecto fija stack y estructura de directorios como reglas de negocio
del repositorio, y el autor pidió expresamente reutilizar el componente de carta ya
implementado. Omitir esas referencias haría la spec menos accionable sin volverla más
neutral en términos de producto.

**Nota 2 — Clarificaciones resueltas por el autor (2026-09-20).** Los 3 marcadores quedaron
cerrados y convertidos en requisitos verificables:

1. **OVR (FR-027, FR-028).** Se deriva del rating de temporada de WhoScored tomando la parte
   entera y el primer decimal como entero de dos cifras: 7,42 → 74. Se descarta el resto de
   los decimales sin redondear y el resultado se acota a 99.
2. **Rareza (FR-029, FR-030, FR-031).** Cortes sobre el OVR: 85+ *Legendary*, 77–84 *Epic*,
   70–76 *Rare*, por debajo de 70 *Common*. Los jugadores sin rating quedan como *Common* y
   fuera de los filtros de rango de OVR.
3. **Compra (FR-032, FR-033).** Fuera de alcance. El panel de compra es maqueta inerte y el
   criterio de aceptación original sobre compras concurrentes se retiró junto con el resto
   del alcance de compra.

**Nota 3 — Consecuencia favorable del criterio de OVR.** Como el OVR es una función monótona
del rating persistido, filtrar por rango de OVR y por rareza se reduce a un filtro de rango
sobre el rating almacenado. Esto disuelve la objeción que se había anotado al evaluar esta
opción: no obliga a calcular el OVR en memoria para poder filtrar ni compromete la
paginación.

**Nota 4 — Decisión no incluida.** La segunda decisión pendiente del borrador original
(estrategia de invalidación de caché de Redis) no se trató como clarificación de
especificación: es una decisión de implementación y quedó registrada en la sección
*Decisiones diferidas a la planificación* para resolverse en `/speckit-plan`.

**Nota 5 — Ámbito de la maqueta.** `home_Mockup.jpg` muestra elementos deliberadamente
excluidos de esta feature: el balance en créditos del encabezado, las secciones del menú
lateral izquierdo distintas de la grilla, y el botón de compra operativo. Están listados en
*Fuera de Alcance* para que no se cuelen en la planificación.

- Items marked incomplete require spec updates before `/speckit-clarify` or `/speckit-plan`
