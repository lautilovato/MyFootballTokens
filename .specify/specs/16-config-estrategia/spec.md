# Feature Specification: Configuración de estrategias en el panel de administración

**Feature Branch**: `feat/ranking`

**Created**: 2026-11-01

**Status**: Implemented

**Input**: User description: "Agregá una sección en la parte de admin para configurar la estrategia. Habría que usar la API key."

**Depende de**: `07-cotizacion` (estrategias, versiones y recálculo) y `11-admin-panel`.

## Requirements

- **FR-001**: El panel MUST mostrar las estrategias, cuál está activa y su versión vigente. Verlas MUST exigir solo la sesión.
- **FR-002**: Crear versiones, activar y recalcular MUST exigir la clave administrativa, que el administrador escribe en el panel. El cliente MUST NOT incluirla en su código ni guardarla en el navegador: vive en memoria mientras la pantalla está abierta.
- **FR-003**: Una clave incorrecta MUST informarse como tal y MUST NOT cerrar la sesión.
- **FR-004**: Activar una estrategia MUST pedir confirmación y avisar que los precios no cambian hasta recalcular (07-cotizacion FR-014).
- **FR-005**: El panel MUST permitir partir de la versión vigente y guardar una versión nueva con sus pesos generales, sus pesos por posición, sus valores de precio y su reputación por defecto. Una versión existente MUST NOT modificarse.
- **FR-006**: Recalcular MUST pedir confirmación y MUST ofrecerse solo para la estrategia activa: con otra, cambiarían los precios del mercado sin que sea la activa.
- **FR-007**: El backend MUST seguir siendo el único que valida las reglas de una configuración, y el panel MUST mostrar sus motivos de rechazo.
- **FR-008**: El panel MUST tener un menú lateral con sus secciones (Resumen, Actividad, Cartas y sobres, Mercado, Economía y Estrategias) y mostrar una por vez. La sección abierta MUST quedar en la URL, cambiar de sección MUST NOT borrar la clave ni lo que se está editando, y si la conciliación no cierra MUST marcarse en el menú, para que el aviso de 11-admin-panel FR-025 no quede oculto.

## Assumptions

- **Autorización**: el rol de administrador no autoriza estas operaciones, como exigen 11-admin-panel FR-005 y FR-006: las autoriza la clave. El panel solo le da un lugar donde escribirla, sin cambios en el backend.
- **Clave en el cliente**: una clave en una variable `VITE_*` quedaría publicada en el JavaScript que descarga cualquier usuario, por eso se escribe en cada visita.
- **Spec sin plan**: usa los endpoints existentes de 07-cotizacion, así que no lleva plan ni tareas.
