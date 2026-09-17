<!--
SYNC IMPACT REPORT
Version change: 1.0.0 → 1.1.0
Rationale: MINOR bump — expands section 7 with three clarifications instead of
redefining or removing anything. Triggered by /speckit-analyze findings on feature
03-ingesta-stats: (1) a domain module folder had a pure utility file (name-matcher.ts)
the previous wording didn't clearly permit; (2) two features (02-ingesta-catalogo,
03-ingesta-stats) independently resolved "does an internal batch module need a
controller?" the same way, without that decision being codified anywhere; (3) the
concrete filesystem path for the Adapters layer (named in section 3) was never spelled
out the way the entities path is in section 7.
Modified principles: 7. Estructura de Directorios y Arquitectura — expanded (not
redefined): explicit exception for pure framework-free utility files in a domain
folder; controller.ts now explicitly mandatory even without inherent HTTP need; new
"Capa de Adapters" subsection giving the concrete path convention.
Added sections: none (existing section 7 expanded in place)
Removed sections: none
Deferred placeholders / TODOs: none
Templates requiring follow-up: none checked by this command (see Scope Guard — dependent
templates read this file at runtime and are not modified here)
-->

# Constitución del Proyecto: Mercado de Jugadores de Fútbol

## 1. Contexto Global y Estándares
Este repositorio contiene el código fuente de un sistema backend diseñado para valorar jugadores de fútbol y operar un mercado de tokens[cite: 1]. El código generado debe cumplir con estrictos estándares de calidad de software y trazabilidad, preparado para la evaluación y auditoría técnica exhaustiva por parte del tribunal académico (Fernando Dodino, Susana Rosito y Feche Romero).
Todas las interacciones de la IA deben adherirse a las reglas de este documento.

## 2. Stack Tecnológico Estricto
La IA tiene prohibido sugerir, instalar o utilizar tecnologías fuera de este stack:

*   **Lenguaje:** TypeScript (modo estricto habilitado).
*   **Framework de Backend:** NestJS (dentro de la carpeta `/back`).
*   **Base de Datos Relacional:** PostgreSQL.
*   **ORM:** MikroORM (NO usar TypeORM, Prisma ni Sequelize).
*   **Caché y Memoria:** Redis (obligatorio para optimizar consultas frecuentes y mitigar latencia)[cite: 1].
*   **Documentación:** OpenAPI / Swagger (obligatorio para todos los endpoints)[cite: 1].

## 3. Reglas de Arquitectura y Patrones
El sistema debe estar organizado obligatoriamente en las siguientes capas[cite: 1]:
*   **Controllers:** Exclusivos para manejar peticiones HTTP/REST y exponer las APIs requeridas[cite: 1].
*   **Services:** Encapsulan toda la lógica de negocio (cotizaciones, validación de mercado, portfolios).
*   **Repositories:** Manejo de persistencia a través de MikroORM.
*   **Adapters (APIs externas):** Capa de aislamiento estricta para el scraping de WhoScored y el consumo de Football-Data.org[cite: 1].

**Resiliencia Externa:** 
*   El sistema debe tolerar fallas de los proveedores externos[cite: 1]. 
*   Si una API falla, la aplicación debe continuar funcionando consumiendo la información almacenada en los datos locales o la caché[cite: 1].

## 4. Requisitos No Funcionales Críticos
Cada vez que la IA genere código, debe contemplar por defecto los siguientes requerimientos:

*   **Observabilidad:**
    *   Implementar logs estructurados para facilitar el análisis[cite: 1].
    *   Es obligatorio el uso de Correlation IDs para garantizar la trazabilidad de las solicitudes entre los servicios[cite: 1].
    *   Implementar health checks y exponer métricas clave como latencia y tasa de error[cite: 1].
*   **Auditoría Financiera:**
    *   Se requiere un registro inmutable de todas las transacciones financieras (compra/venta de tokens)[cite: 1].
    *   Cada operación debe auditar: la identificación del autor de la acción, el detalle de los cambios con marca de tiempo, y el estado anterior y posterior al cambio[cite: 1].
*   **Procesos Asíncronos (Scheduler):**
    *   Se requiere la implementación de un sistema de tareas programadas (job scheduler)[cite: 1].
    *   Se utilizará para la ejecución de procesos batch, como el recálculo semanal de cotizaciones y la actualización del catálogo de jugadores[cite: 1].
*   **Seguridad:**
    *   Se exige una estricta validación de todas las entradas de datos (input validation) a través de DTOs en NestJS[cite: 1].
    *   Se debe realizar un manejo seguro de los tokens de autenticación y autorización[cite: 1].

## 5. Reglas de Dominio de Negocio
*   **Tokens:** Existen 100 tokens iniciales por jugador, con un valor de 1 crédito en el momento cero, concentrados inicialmente en un único superusuario[cite: 1].
*   **Cotización:** El modelo de valuación debe admitir estrategias configurables basadas en métricas de performance con ponderaciones variables (ej. goles, asistencias, minutos jugados)[cite: 1]. El sistema debe dejar traza de la estrategia utilizada en cada cotización periódica[cite: 1].

## 6. Reglas de Comportamiento de la IA (Claude)
*   Documentar todos los endpoints generados utilizando decoradores de `@nestjs/swagger`.
*   Si un requerimiento afecta la base de datos de jugadores, la orden de compra/venta, o el portfolio de un usuario, siempre validar disponibilidad o saldos antes de ejecutar la transacción[cite: 1].
*   No generar implementaciones "mock" si existe una instrucción clara de usar el Adapter o MikroORM.

## 7. Estructura de Directorios y Arquitectura
Dentro del directorio `/back/src/`, la arquitectura debe separar estrictamente la infraestructura de los módulos de dominio.

**Módulos de Dominio (Vertical Slicing):**
El código de negocio debe organizarse en `/modules/` agrupado por dominio (por ejemplo, `/modules/player`). La IA no debe crear carpetas globales de controladores o servicios. La carpeta de cada dominio debe contener exactamente:
*   `<nombre-dominio>.module.ts` (Orquestador del módulo)
*   `<nombre-dominio>.controller.ts` (Rutas y endpoints)
*   `<nombre-dominio>.service.ts` (Lógica de negocio)
*   `<nombre-dominio>.repository.ts` (Clase de persistencia inyectada)
*   `dto/` (Directorio exclusivo para los Data Transfer Objects de este dominio)

`<nombre-dominio>.controller.ts` es obligatorio en todo módulo de dominio, incluso cuando el
módulo no tiene una necesidad de negocio directa de exponer HTTP (por ejemplo, un proceso de
ingesta o batch). En ese caso el controller expone al menos un endpoint de disparo manual del
proceso, reusable luego por un scheduler u otro consumidor interno — no se omite el archivo ni
se invoca el service directamente desde fuera del módulo.

**Excepción — utilidades puras sin framework:** la carpeta de un dominio puede incluir, además
de los 5 elementos de arriba, archivos planos de utilidad pura: sin decoradores de NestJS, sin
inyección de dependencias, sin acceso a base de datos. Se permiten únicamente cuando la lógica
que contienen debe ser testeable sin levantar el framework ni una base de datos real (por
ejemplo, un algoritmo de comparación/matching de nombres). Estos archivos no son una capa nueva
ni reemplazan ninguno de los 5 elementos obligatorios — son la única desviación permitida de la
palabra "exactamente" de arriba.

**Capa de Adapters:**
La capa "Adapters (APIs externas)" de la sección 3 vive en una ruta propia, hermana de
`/infrastructure/` y `/modules/`, agrupada por proveedor externo:
*   `/back/src/adapters/<proveedor>/` (por ejemplo, `/back/src/adapters/football-data/`,
    `/back/src/adapters/who-scored/`)

Cada adapter aísla el cliente HTTP y la normalización de la forma cruda del proveedor externo;
los módulos de dominio que lo consumen solo conocen los tipos ya normalizados que el adapter
expone, nunca los DTOs crudos del proveedor.

**Capa de Infraestructura:**
Todas las entidades de la base de datos (modelos de MikroORM) están estrictamente separadas de los módulos de dominio. Cuando la IA genere o modifique una entidad, debe hacerlo exclusivamente en la siguiente ruta:
*   `/infrastructure/database/entities/`

Bajo ninguna circunstancia se deben crear archivos de entidades dentro de las carpetas de `/modules/` ni de `/adapters/`.

## 8. Gobernanza

*   Esta constitución prevalece sobre cualquier otra práctica, guía o preferencia individual dentro del proyecto. Ante un conflicto entre una instrucción puntual y este documento, prevalece este documento salvo enmienda explícita.
*   Toda enmienda debe documentarse indicando el motivo del cambio y su impacto en los artefactos dependientes (specs, plans, tasks).
*   Las enmiendas siguen versionado semántico (MAJOR.MINOR.PATCH):
    *   **MAJOR:** eliminación o redefinición incompatible de una regla o principio existente.
    *   **MINOR:** incorporación de un nuevo principio o sección, o ampliación material de una guía existente.
    *   **PATCH:** aclaraciones, correcciones de redacción o ajustes no semánticos.
*   Toda revisión de código (Pull Request) debe verificar el cumplimiento de esta constitución antes de ser aprobada.
*   Cualquier excepción o complejidad que se aparte de estas reglas debe justificarse explícitamente en la spec o plan correspondiente.

**Versión**: 1.1.0 | **Ratificada**: 2026-08-29 | **Última Enmienda**: 2026-09-16