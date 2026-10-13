<!--
SYNC IMPACT REPORT
Version change: 3.3.0 -> 4.0.0
Rationale: MAJOR bump - redefinicion incompatible de la regla "Tokens" de la seccion 5: se
elimina la figura del superusuario. Disparado por /speckit-constitution al detectar que la spec
08-sobres (revision 2, 2026-10-13) elimina el superusuario y pide explicitamente alinear la
redaccion del §5 (Assumptions, "Sin superusuario"; FR-042, FR-043).
Modified principles:
  - 5. Reglas de Dominio de Negocio - "Tokens": los tokens sin dueno de usuario pertenecen a la
    plataforma, que no es un usuario (sin credenciales, saldo ni inventario). La prohibicion de
    comprar o vender tokens en poder de la plataforma admite una unica excepcion: los tokens que
    vuelven desde un usuario (p. ej. cuenta eliminada) MAY ponerse a la venta segun la spec del
    mercado y MUST NOT volver a los sobres. Se fija que la cantidad de 100 por jugador es
    invariante (no se emiten de mas ni se destruyen).
  - 5. Reglas de Dominio de Negocio - "Creditos": el saldo MUST NOT ser negativo; la entrega
    inicial es una emision; lo cobrado por la plataforma sale de circulacion.
Added sections: none
Removed sections: none (se elimina el concepto "superusuario" dentro de §5)
Deferred placeholders / TODOs: none
Impact on dependent artifacts:
  - 08-sobres/spec.md: ya cumple. Su linea "Depende de" cita la constitucion v3.2.0; debe pasar
    a citar v4.0.0 (fuera del alcance de este comando - ver Next Actions). El supuesto "Sin
    superusuario" queda resuelto.
  - 08-sobres/checklists/requirements.md (linea 40): dice que los creditos cobrados "se
    acreditan al superusuario"; contradice la spec rev. 2 y esta version - actualizar.
  - Mencionan el superusuario solo en prosa (ninguna lo modela ni lo persiste); conviene
    actualizar la redaccion a "plataforma" sin cambios de comportamiento:
    07-cotizacion/spec.md (lineas 17, 19, 243, 245), 06-home (research.md, data-model.md,
    contracts/home.openapi.yaml), 05-auth (spec.md linea 167, data-model.md linea 96) y el
    comentario de back/src/modules/player/dto/player-response.dto.ts. El valor `supply.minted`
    = 100 de la home sigue siendo correcto.
  - front/package.json: sigue sin declarar `gsap` ni `@gsap/react` (pendiente de 3.3.0).
  - Templates: none checked by this command (see Scope Guard).

PREVIOUS AMENDMENT (3.3.0)
Version change: 3.2.0 -> 3.3.0
Rationale: MINOR bump - ampliacion explicita de la lista cerrada del stack de Frontend (seccion
2), como esa lista exige, y ampliacion material de la regla de estilos. No se elimina ni
redefine nada de forma incompatible. Disparado por /speckit-constitution al detectar en la rama
feat/packs que los componentes Pack y ConfirmModal importan `gsap` y `@gsap/react` (fuera del
stack) y traen hojas CSS propias junto a Tailwind. Decision del equipo (2026-10-13): autorizar
GSAP y permitir CSS propio por componente con alcance acotado.
Modified principles:
  - 2. Stack Tecnologico Estricto / Frontend - "Estilos": Tailwind pasa a ser el mecanismo por
    defecto. Se agrega la excepcion "CSS propio por componente" (un .css co-ubicado, importado
    solo por su componente, clases con prefijo exclusivo, variables en la clase raiz). Las
    paginas y el layout siguen siendo solo Tailwind. Regulariza PlayerCard.css (ya en main).
  - 2. Stack Tecnologico Estricto / Frontend - nuevo item "Animaciones: GSAP" (`gsap` y
    `@gsap/react`), solo en componentes presentacionales, via `useGSAP`, sin acceso a red ni a
    services/, respetando `prefers-reduced-motion`.
Added sections: none (se agrega el item "Animaciones" dentro de la lista de Frontend)
Removed sections: none
Deferred placeholders / TODOs: none
Impact on dependent artifacts:
  - front/package.json: NO declara `gsap` ni `@gsap/react`; deben agregarse para que el
    build de feat/packs funcione (fuera del alcance de este comando - ver Next Actions).
  - Pack.tsx, opening.ts, ConfirmModal.tsx y sus .css: ya cumplen las nuevas reglas (useGSAP,
    reduced-motion, prefijos pk-/cm, sin :root).
  - 08-sobres: su plan (aun no generado) debe referenciar esta version para el uso de GSAP.
  - Specs 01 a 07: sin cambios requeridos.
  - Templates: none checked by this command (see Scope Guard).

PREVIOUS AMENDMENT (3.2.0)
Version change: 3.1.0 -> 3.2.0
Rationale: MINOR bump - ampliacion material de la regla "Cotizacion" de la seccion 5: el score
deja de estar acotado a [0,1]. Pasa a ser no negativo y sin tope superior, y por lo tanto el
precio del jugador no tiene maximo. Es una relajacion: todo score entre 0 y 1 producido bajo
3.0.0 o 3.1.0 sigue siendo valido. Motivo (decision del equipo, 2026-10-13): con el tope, los
mejores jugadores quedaban empatados en el precio maximo y no se distinguian entre si.
Modified principles:
  - 5. Reglas de Dominio de Negocio - "Cotizacion": el score ya no es "de 0 a 1"; es >= 0, sin
    tope superior. La escala 0-1 queda como referencia de normalizacion (p5 -> 0, p95 -> 1).
Added sections: none
Removed sections: none
Deferred placeholders / TODOs: none
Impact on dependent artifacts:
  - 07-cotizacion (spec, plan, research, data-model, quickstart, contrato OpenAPI): actualizados
    en el mismo cambio. Migration20261013144800 ensancha player_quote.score a numeric(9,4).
  - Home (06-home): sus filtros de valor asumian precios de 100 a 1.000; deben revisarse.
  - Sobres, venta y portfolio: no pueden asumir un precio maximo.

PREVIOUS AMENDMENT (3.1.0)
Version change: 3.0.0 -> 3.1.0
Rationale: MINOR bump - amplia la capa de Adapters de la seccion 3 con un tercer proveedor
externo sin redefinir ni eliminar nada. Disparado por /speckit-constitution al detectar que la
rama feat/upload-images agrega /back/src/adapters/the-sports-db/ (imagenes de jugadores), un
proveedor que la seccion 3 no enumeraba.
Modified principles:
  - 3. Reglas de Arquitectura y Patrones - "Adapters (APIs externas)" incluye TheSportsDB
    (imagenes de jugadores) junto a WhoScored y Football-Data.org. La regla de Resiliencia
    Externa aplica igual a este proveedor.
  - 7. Estructura de Directorios - se agrega `/back/src/adapters/the-sports-db/` a los
    ejemplos de la Capa de Adapters (no normativo).
Added sections: none
Removed sections: none
Deferred placeholders / TODOs: none
Impact on dependent artifacts:
  - Feature de imagenes de jugadores (modulo player-images): no tiene spec en
    .specify/specs/; queda regularizada a nivel constitucion, sin cambios de codigo.
  - Specs 01 a 07: sin cambios requeridos.
  - Templates: none checked by this command (see Scope Guard - dependent templates read
    this file at runtime and are not modified here)

PREVIOUS AMENDMENT (same date, not yet committed)
Version change: 2.2.0 -> 3.0.0
Rationale: MAJOR bump - redefinicion incompatible de las reglas de dominio de la seccion 5.
La regla anterior (enunciado 3.3) fijaba un valor de 1 credito por token en el momento cero
y los 100 tokens de cada jugador concentrados en el superusuario como oferta de mercado desde
el inicio. Decision de diseno del equipo: el precio lo determina el calculo del score, los
tokens no estan a la venta de entrada y el mercado esta formado solo por los tokens que
salieron en sobres. Disparado durante /speckit-specify de la feature 07-cotizacion.
Modified principles:
  - 5. Reglas de Dominio de Negocio - "Tokens" redefinida (sin valor fijo de 1 credito; los
    tokens llegan a los usuarios por sobres; el mercado son solo los tokens sacados en
    sobres). "Cotizacion" redefinida: es el precio del jugador (no del token), en creditos
    enteros, derivado exclusivamente de un score 0-1 (suma ponderada de metricas
    normalizadas); estrategias configurables Y versionadas, con pesos positivos o negativos,
    por posicion y con metricas de contexto como la reputacion mundial; la traza incluye
    estrategia, version, score y desglose por metrica.
  - 4. Requisitos No Funcionales - la auditoria financiera incluye la apertura de sobres.
  - 6. Reglas de Comportamiento de la IA - la validacion previa de disponibilidad o saldos
    alcanza tambien a la apertura de sobres.
Added sections: none (se agregan en 5 las reglas "Creditos" y "Precio y momento cero")
Removed sections: none
Deferred placeholders / TODOs: none
Impact on dependent artifacts:
  - 07-cotizacion (spec.md): ya alineada con esta version (sin precio inicial fijo, precio
    del jugador, score y desglose); se retira el aviso de desvio de sus Assumptions.
  - Specs posteriores (sobres, venta, portfolio): deben respetar que solo circulan los
    tokens obtenidos en sobres, que el precio de entrega sale de la cotizacion vigente y que
    un jugador sin cotizacion no puede entregarse. La traduccion precio-de-jugador a
    precio-de-token queda a cargo de la spec de venta.
  - Specs 01 a 06: no mencionan el valor de 1 credito por token; sin cambios requeridos.
  - Templates: none checked by this command (see Scope Guard - dependent templates read
    this file at runtime and are not modified here)
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
*   **Estilos:** Tailwind CSS es el mecanismo por defecto. No se incorporan otras librerías
    de estilos, preprocesadores ni sistemas de componentes de terceros.
    **Excepción — CSS propio por componente:** un componente de `components/` MAY tener un
    único archivo `.css` co-ubicado (`components/<componente>/<Componente>.css`) cuando su
    presentación requiere lo que Tailwind no expresa con claridad (keyframes complejos,
    escalado por container queries, capas decorativas). Ese archivo MUST:
    1.  ser importado solo por su propio componente;
    2.  prefijar todas sus clases con un prefijo corto y exclusivo del componente (por
        ejemplo `pc-` en `PlayerCard`, `pk-` en `Pack`), sin estilar selectores globales
        ni de otros componentes;
    3.  declarar sus variables CSS dentro de la clase raíz del componente, no en `:root`.

    Las páginas (`pages/`) y el layout general se siguen estilando exclusivamente con
    Tailwind.
*   **Animaciones:** GSAP (`gsap` y `@gsap/react`). Se usa solo en componentes
    presentacionales de `components/` y a través del hook `useGSAP`, que limpia las
    animaciones al desmontar el componente. Los timelines no acceden a la red ni a
    `services/`, y todo componente animado MUST respetar `prefers-reduced-motion`. No se
    autoriza ninguna otra librería de animación.
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
*   **Adapters (APIs externas):** Capa de aislamiento estricta para el scraping de WhoScored, el consumo de Football-Data.org y el consumo de TheSportsDB (imágenes de jugadores).

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
    *   Se requiere un registro inmutable de todas las transacciones financieras (apertura de sobres y compra/venta de tokens).
    *   Cada operación debe auditar: la identificación del autor de la acción, el detalle de los cambios con marca de tiempo, y el estado anterior y posterior al cambio.
*   **Procesos Asíncronos (Scheduler):**
    *   Se requiere la implementación de un sistema de tareas programadas (job scheduler).
    *   Se utilizará para la ejecución de procesos batch, como el recálculo semanal de cotizaciones y la actualización del catálogo de jugadores.
*   **Seguridad:**
    *   Se exige una estricta validación de todas las entradas de datos (input validation) a través de DTOs en NestJS.
    *   Se debe realizar un manejo seguro de los tokens de autenticación y autorización.

## 5. Reglas de Dominio de Negocio
*   **Tokens:** Existen exactamente 100 tokens por jugador; esa cantidad es fija y ningún proceso emite tokens de más ni los destruye. Al emitirse, los tokens no tienen dueño de usuario: pertenecen a la **plataforma**, que no es un usuario (no tiene credenciales, saldo ni inventario). No existe un superusuario. Ningún token está a la venta de entrada: los usuarios los obtienen abriendo sobres, y el mercado arranca vacío, formado únicamente por los tokens que salieron en sobres. Un token en poder de la plataforma MUST NOT comprarse ni venderse, con una única excepción: un token que vuelve a la plataforma desde un usuario (por ejemplo, por la eliminación de su cuenta) MAY ser puesto a la venta por la plataforma según lo defina la spec del mercado, y MUST NOT volver a los sobres.
*   **Créditos:** Los usuarios reciben al registrarse una cantidad inicial de créditos, que usan para abrir sobres y operar. Los créditos son números enteros y el saldo de un usuario MUST NOT ser negativo. La entrega inicial es una **emisión** de créditos; lo que la plataforma cobra (por ejemplo, al abrir un sobre) es ingreso de la plataforma, sale de circulación y no se acredita a ninguna cuenta.
*   **Precio y momento cero:** No existe un valor fijo por token ni un precio inicial por defecto. El precio de un jugador lo determina el cálculo de su score. El «momento cero» de un token es el instante en que sale de un sobre, y se valúa con la cotización vigente del jugador en ese instante. Un jugador sin cálculo no tiene cotización y MUST NOT recibir un precio por defecto.
*   **Cotización:** Es el precio del **jugador** (no del token) en créditos enteros, derivado exclusivamente de un **score** no negativo y **sin tope superior** (la escala de referencia va de 0 a 1, pero un jugador que supera la referencia alta puntúa por encima de 1 y su precio no tiene máximo), calculado como suma ponderada de métricas normalizadas. El modelo de valuación MUST admitir estrategias configurables y versionadas, basadas en métricas de performance con ponderaciones variables —positivas o negativas— y diferenciables por posición, e incluir métricas de contexto como la reputación mundial del jugador. El sistema MUST dejar traza, en cada cotización periódica, de la estrategia y versión utilizadas, del score y de su desglose por métrica.

## 6. Reglas de Comportamiento de la IA (Claude)
*   Documentar todos los endpoints generados utilizando decoradores de `@nestjs/swagger`.
*   Si un requerimiento afecta la base de datos de jugadores, la apertura de sobres, la orden de compra/venta, o el portfolio de un usuario, siempre validar disponibilidad de tokens o saldos antes de ejecutar la transacción.
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
    `/back/src/adapters/who-scored/`, `/back/src/adapters/the-sports-db/`)

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

**Versión**: 4.0.0 | **Ratificada**: 2026-08-29 | **Última Enmienda**: 2026-10-13
