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

**Capa de Infraestructura:**
Todas las entidades de la base de datos (modelos de MikroORM) están estrictamente separadas de los módulos de dominio. Cuando la IA genere o modifique una entidad, debe hacerlo exclusivamente en la siguiente ruta:
*   `/infrastructure/database/entities/`

Bajo ninguna circunstancia se deben crear archivos de entidades dentro de las carpetas de `/modules/`.