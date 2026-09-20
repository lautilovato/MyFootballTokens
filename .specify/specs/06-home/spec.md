# Spec: Implementación de la Homepage de Mercado (Striker Market)

Depende de: `spec.md` (catálogo base desde Football-Data.org), motor de cotizaciones y módulo de billetera/usuarios.

Esta spec define las reglas y restricciones para construir la funcionalidad del frontend y los endpoints requeridos para la vista principal del mercado, basándose en el diseño de referencia adjunto y respetando la constitución del proyecto.

## 1. Objetivo

Desarrollar la interfaz principal ("Striker Market") que permita a los usuarios explorar el catálogo de jugadores, aplicar múltiples filtros, consultar estadísticas detalladas (de momento no se pueden comprar tokens de jugadores).

El componente de la carta ya está implementado en "front\src\components\player-card". Debe usar ese y completar desarollar el resto de la interfaz

## 2. Alcance

**Incluido:**

* Endpoints de listado y filtrado avanzado para alimentar la grilla principal de jugadores.

* Endpoint de detalle de jugador con sus estadisticas.


**Fuera de alcance:**

* Lógica de cálculo de cotizaciones o recálculo periódico (responsabilidad del job scheduler).


* Pasarelas de pago externas (las compras operan sobre el saldo en créditos internos del sistema).

## 3. Datos y Componentes a Soportar (UX/UI)

El backend debe exponer y estructurar los datos para alimentar los siguientes componentes de la interfaz:

* **Filtros de Mercado (Market Filters):** Combinaciones de Ligas (ej. Premier League, La Liga), Posiciones (FW, MF, DF, GK), Rareza (Legendary, Epic, Rare), y sliders para Rango de Precios y Stats Range (OVR).


* **Grilla de Jugadores:** Tarjes que expongan OVR, foto del jugador, bandera/club, nombre, métricas clave (Goals, Assists, Pace), y el porcentaje de variación de valor (eetas individualj. +12.5%, -4.1%).


* **Detalle del Jugador (Player Details):** Panel lateral que se despliega al seleccionar una tarjeta. Debe mostrar el perfil ampliado del jugador, el club actual, métricas completas, una gráfica del "30 Day Market Value", el "Market Value" monetario, la oferta actual de tokens ("Supply") y el selector de cantidad para ejecutar la compra. Los detalles avanzados de los jugadores, como las graficas de los ultimos 30 dias debe ser mockup porque todavia no tenemos las cotizaciones ni compras de los jugadores.

Basandose en los datos de la entidad player-season-stats, la carta debe mostrar goles y asistencias.
Al ver en detelle una carta a la derecha de la pantalla se debe visualizar el resto de las estadisticas(goles, asistencias, altura, tiros por partido, pases clave, regates y entradas)

De momento no tenemos las fotos de los equipos ni de los jugadores, eso se agregará mas adelante.

## 4. Reglas de Negocio y Transacciones

* **Validación de Input:** Todos los parámetros de búsqueda, filtros y cantidades de compra deben estar securizados mediante una estricta validación de entrada usando DTOs.


## 5. Reglas de Arquitectura Aplicables


* **Estructura Estricta:** El módulo de dominio debe contar exactamente con su orquestador (`module.ts`), controlador (`controller.ts`), lógica de negocio (`service.ts`), capa de persistencia mediante MikroORM (`repository.ts`), y su carpeta `dto/`.


* **Observabilidad:** Las llamadas a estos endpoints desde el cliente deben incluir Correlation IDs para trazar el flujo completo de la petición, y contar con logs estructurados.


* **Documentación de API:** Cada endpoint creado para alimentar esta vista debe estar obligatoriamente documentado con OpenAPI/Swagger a través de decoradores en NestJS.


## 6. Criterios de Aceptación / Testing

* El sistema soporta consultas combinando todos los filtros visibles (Ligas + Posiciones + Rareza + Rangos de Precio/OVR) garantizando resultados precisos y paginados.


* Las peticiones de compra concurrentes que agoten el supply o el saldo fallan limpiamente y no permiten inconsistencias financieras.
* Los controladores están documentados en Swagger, y la aplicación compila exitosamente bajo el modo estricto de TypeScript.



## 7. Decisiones pendientes antes de implementar

1. **Rareza de Cartas:** Definir el criterio algorítmico o de negocio exacto que clasifica a un jugador como *Legendary*, *Epic* o *Rare* (¿se mapea estrictamente contra el OVR, la cotización actual, o es un flag precalculado por el scheduler?).
2. **Estrategia de Invalidación de Caché:** Determinar cuándo y cómo se purgan las claves de Redis del catálogo cuando el job scheduler semanal recalcula las valoraciones y la gráfica de 30 días.