<!--
SYNC IMPACT REPORT
Version change: 2.1.0 -> 2.2.0
Rationale: MINOR bump - incorpora dos herramientas a la lista de Frontend de la seccion 2
sin redefinir ni eliminar nada. La lista sigue cerrada: solo gana dos entradas.
Disparado durante /speckit-implement de la feature 05-auth, al detectar que el andamiaje
de /front requiere jsdom para que Vitest pueda renderizar componentes (tareas T042, T056,
T057) y oxlint para el script de lint que exige la tarea T006.
Modified principles:
  - 2. Stack Tecnologico Estricto - ampliado (no redefinido): la entrada de Testing del
    Frontend precisa que Vitest corre con jsdom como entorno de DOM, y se agrega una
    entrada de Lint con oxlint, el mismo linter que ya usa el backend. La clausula de
    librerias utilitarias sigue sin aplicar al Frontend: esta lista permanece cerrada y
    todo agregado futuro sigue requiriendo enmienda explicita.
Added sections: none
Removed sections: none
Deferred placeholders / TODOs: none
Templates requiring follow-up: none checked by this command (see Scope Guard - dependent
templates read this file at runtime and are not modified here)
-->

# Constitución del Proyecto: Mercado de Jugadores de Fútbol

## 1. Contexto Global y Estándares
Este repositorio contiene el código fuente de un sistema para valorar jugadores de fútbol y operar un mercado de tokens, compuesto por un backend (`/back`) y un cliente web (`/front`). El código generado debe cumplir con estrictos estándares de calidad de software y trazabilidad, preparado para la evaluación y auditoría técnica exhaustiva por parte del tribunal académico.
Todas las interacciones de la IA deben adherirse a las reglas de este documento.

## 2. Stack Tecnológico Estricto
La IA tiene prohibido sugerir, instalar o utilizar tecnologías fuera de este stack.
El lenguaje es común a todo el repositorio; el resto se divide por capa.

*   **Lenguaje (todo el repositorio):** TypeScript (modo estricto habilitado).

**Backend (`/back`):**

*   **Framework:** NestJS.
*   **Base de Datos Relacional:** PostgreSQL.
*   **ORM:** MikroORM (NO usar TypeORM, Prisma ni Sequelize).
*   **Caché y Memoria:** Redis (obligatorio para optimizar consultas frecuentes y mitigar latencia).
*   **Documentación:** OpenAPI / Swagger (obligatorio para todos los endpoints).

**Librerías utilitarias del backend:**
La lista de arriba enumera los **pilares arquitectónicos** del backend —framework, base de
datos, ORM, caché y documentación—, no cada paquete de npm. Una librería utilitaria puede
incorporarse sin enmendar esta sección cuando se cumplen las tres condiciones a la vez:

1.  No reemplaza, duplica ni compite con ninguno de los pilares enumerados. Una librería que
    proponga otro ORM, otra base de datos, otro framework HTTP u otra capa de caché sigue
    estando prohibida.
2.  Resuelve un problema acotado que ningún pilar cubre —por ejemplo hasheo de contraseñas,
    firma de tokens, límite de peticiones, logging estructurado, scraping o validación de
    DTOs.
3.  Queda justificada explícitamente en la sección Complexity Tracking del plan de la
    feature que la incorpora, indicando la alternativa descartada y por qué.

Esta cláusula regulariza las librerías utilitarias ya en uso, incorporadas por las features
01 a 04 (`pino`, `cheerio`, `playwright`, `class-validator`, `axios`, `keyv`), y las que
incorpora la feature 05 (`@nestjs/jwt`, `bcrypt`, `@nestjs/throttler`).

**La lista de Frontend no admite esta cláusula.** Se mantiene cerrada tal como se definió:
cualquier agregado al stack de cliente —utilitario o no— requiere enmienda explícita de esta
sección.

**Frontend (`/front`):**

*   **Build tool:** Vite.
*   **Librería de UI:** React.
*   **Ruteo:** React Router.
*   **Estilos:** Tailwind CSS. No se incorporan otras librerías de estilos ni sistemas de
    componentes de terceros.
*   **Cliente HTTP:** Axios.
*   **Estado global:** se resuelve con la Context API nativa de React. No se autoriza
    ninguna librería externa de manejo de estado.
*   **Testing:** Vitest, con `jsdom` como entorno de DOM. El renderizado de componentes
    en los tests se apoya en las utilidades propias de React; no se autoriza ninguna
    librería adicional de testing.
*   **Lint:** oxlint, el mismo linter que usa el backend.

Los tests de backend continúan sobre Jest: cada capa usa su runner y no se unifican.

## 3. Reglas de Arquitectura y Patrones
El backend (`/back`) debe estar organizado obligatoriamente en las siguientes capas.
El cliente web no se rige por estas capas sino por la estructura que fija la
sección 7:
*   **Controllers:** Exclusivos para manejar peticiones HTTP/REST y exponer las APIs requeridas.
*   **Services:** Encapsulan toda la lógica de negocio (cotizaciones, validación de mercado, portfolios).
*   **Repositories:** Manejo de persistencia a través de MikroORM.
*   **Adapters (APIs externas):** Capa de aislamiento estricta para el scraping de WhoScored y el consumo de Football-Data.org.

**Resiliencia Externa:**
*   El sistema debe tolerar fallas de los proveedores externos.
*   Si una API falla, la aplicación debe continuar funcionando consumiendo la información almacenada en los datos locales o la caché.

## 4. Requisitos No Funcionales Críticos
Cada vez que la IA genere código, debe contemplar por defecto los siguientes requerimientos:

*   **Observabilidad:**
    *   Implementar logs estructurados para facilitar el análisis.
    *   Es obligatorio el uso de Correlation IDs para garantizar la trazabilidad de las solicitudes entre los servicios.
    *   Implementar health checks y exponer métricas clave como latencia y tasa de error.
*   **Auditoría Financiera:**
    *   Se requiere un registro inmutable de todas las transacciones financieras (compra/venta de tokens).
    *   Cada operación debe auditar: la identificación del autor de la acción, el detalle de los cambios con marca de tiempo, y el estado anterior y posterior al cambio.
*   **Procesos Asíncronos (Scheduler):**
    *   Se requiere la implementación de un sistema de tareas programadas (job scheduler).
    *   Se utilizará para la ejecución de procesos batch, como el recálculo semanal de cotizaciones y la actualización del catálogo de jugadores.
*   **Seguridad:**
    *   Se exige una estricta validación de todas las entradas de datos (input validation) a través de DTOs en NestJS.
    *   Se debe realizar un manejo seguro de los tokens de autenticación y autorización.

## 5. Reglas de Dominio de Negocio
*   **Tokens:** Existen 100 tokens iniciales por jugador, con un valor de 1 crédito en el momento cero, concentrados inicialmente en un único superusuario.
*   **Cotización:** El modelo de valuación debe admitir estrategias configurables basadas en métricas de performance con ponderaciones variables (ej. goles, asistencias, minutos jugados). El sistema debe dejar traza de la estrategia utilizada en cada cotización periódica.

## 6. Reglas de Comportamiento de la IA (Claude)
*   Documentar todos los endpoints generados utilizando decoradores de `@nestjs/swagger`.
*   Si un requerimiento afecta la base de datos de jugadores, la orden de compra/venta, o el portfolio de un usuario, siempre validar disponibilidad o saldos antes de ejecutar la transacción.
*   No generar implementaciones "mock" si existe una instrucción clara de usar el Adapter o MikroORM.

## 7. Estructura de Directorios y Arquitectura
Esta sección fija la estructura obligatoria de los dos árboles del repositorio:
`/back/src/` y `/front/src/`.

**Backend (`/back/src/`):**
La arquitectura debe separar estrictamente la infraestructura de los módulos de dominio.

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

**Estructura del Frontend (`/front/src/`):**
El cliente usa un layout plano, organizado por tipo de archivo. Deliberadamente **no**
replica el vertical slicing por dominio del backend: son dos árboles con criterios de
organización distintos y elegidos por separado.

*   `pages/` - una vista por ruta. Las páginas componen y orquestan; no implementan lógica
    de negocio ni hablan con la red por su cuenta.
*   `components/` - componentes de interfaz reutilizables. No acceden a HTTP ni conocen la
    forma de las respuestas del backend.
*   `services/` - la instancia única de Axios y sus interceptores, las llamadas a la API y
    el estado de sesión. Ningún componente ni página debe crear su propia instancia de
    Axios ni invocar `axios` directamente: todo el tráfico HTTP pasa por esta capa, con el
    mismo criterio de aislamiento que la capa de Adapters aplica en el backend.
*   `app/` - arranque de la aplicación, providers globales y definición de rutas.

Las entidades de MikroORM son exclusivas del backend: bajo ninguna circunstancia se
replican tipos de entidad dentro de `/front`. El cliente conoce únicamente las formas de
datos que el backend expone en sus respuestas.

## 8. Gobernanza

*   Esta constitución prevalece sobre cualquier otra práctica, guía o preferencia individual dentro del proyecto. Ante un conflicto entre una instrucción puntual y este documento, prevalece este documento salvo enmienda explícita.
*   Toda enmienda debe documentarse indicando el motivo del cambio y su impacto en los artefactos dependientes (specs, plans, tasks).
*   Las enmiendas siguen versionado semántico (MAJOR.MINOR.PATCH):
    *   **MAJOR:** eliminación o redefinición incompatible de una regla o principio existente.
    *   **MINOR:** incorporación de un nuevo principio o sección, o ampliación material de una guía existente.
    *   **PATCH:** aclaraciones, correcciones de redacción o ajustes no semánticos.
*   Toda revisión de código (Pull Request) debe verificar el cumplimiento de esta constitución antes de ser aprobada.
*   Cualquier excepción o complejidad que se aparte de estas reglas debe justificarse explícitamente en la spec o plan correspondiente.

**Versión**: 2.2.0 | **Ratificada**: 2026-08-29 | **Última Enmienda**: 2026-09-17
