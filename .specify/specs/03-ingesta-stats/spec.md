# Spec: Enriquecimiento de jugadores con métricas de rendimiento desde WhoScored

Depende de: `spec.md` (catálogo base desde Football-Data.org) — esta spec asume que `League`,
`Team` y `Player` ya existen y están poblados.

Esta spec define reglas y restricciones a cumplir, no el diseño de código. Las decisiones de
implementación (nombres de clases, estructura interna de archivos más allá de lo que ya fija la
constitución del proyecto, algoritmos concretos) quedan a criterio de quien la implemente.

## 1. Objetivo

Enriquecer los jugadores ya cargados con métricas de rendimiento obtenidas por scraping de
WhoScored, para alimentar la fórmula de score definida en el documento de visión:

```
score = 0.25*goals + 0.15*assists + 0.10*shots + 0.10*keyPasses
      + 0.10*dribbles + 0.10*tackles + 0.20*rating
```

## 2. Alcance

**Incluido:**
- Obtener de WhoScored las métricas de rendimiento de los jugadores ya cargados en el sistema.
- Vincular cada jugador de WhoScored con el `Player` existente (creado desde Football-Data.org).
- Persistir un snapshot agregado por temporada (con refresh periódico) y, bajo demanda, el
  detalle partido a partido de un jugador puntual.

**Fuera de alcance (próximas specs):**
- Cálculo de la cotización/score a partir de los datos persistidos.
- El scheduler que dispare el refresh periódico — esta spec solo exige que el proceso de
  ingesta pueda reusarse desde uno.

## 3. Datos a capturar

**Obligatorios** (alimentan la fórmula de score): goles, asistencias, tiros por partido, pases
clave, regates, tackles/entradas, rating.

**Deseables, si WhoScored los expone** (no bloquean el cierre de la spec si no están
disponibles): partidos jugados, minutos jugados, intercepciones, faltas, despejes, tarjetas
amarillas, tarjetas rojas, porcentaje de pases acertados, altura del jugador.

Reglas sobre estos datos:
- La altura es un atributo del jugador, no de una temporada — se completa una sola vez, no se
  repite en cada snapshot.
- No hay que inventar campos para métricas que no se confirmen disponibles en la fuente (ver
  sección 5). Si un dato "deseable" no está en la página de WhoScored, se deja fuera del alcance
  en vez de modelarlo vacío para siempre.

## 4. Reglas de matching (WhoScored ↔ jugador existente)

Ninguna de las dos fuentes comparte IDs. Orden de confianza para vincular:

1. Nombre normalizado (sin acentos, minúsculas) + mismo equipo.
2. Si hay más de un candidato con nombre similar en el mismo equipo, desempatar por fecha de
   nacimiento.
3. Por debajo de un umbral de similitud (referencia: 0.85 en una métrica tipo
   Levenshtein/Jaro-Winkler) no hay match automático — mejor no tener el dato que vincularlo mal.
4. Todo jugador de WhoScored sin match automático debe quedar registrado para revisión manual, no
   descartado silenciosamente.
5. El proceso de matching no debe requerir una consulta a la base por cada jugador candidato —
   los candidatos de un mismo equipo se resuelven con una sola consulta, se reutilizan para todo
   ese equipo.

## 5. Restricciones de la fuente externa (WhoScored)

- No tiene API pública ni documentación oficial: todo acceso es scraping sobre HTML/JSON.
- El markup no tiene contrato estable. **Antes de implementar el parser** hay que confirmar en
  vivo (inspeccionando la página real) la estructura de la página de plantel de un equipo y de la
  página de estadísticas por partido de un jugador, y documentar acá el resultado — no se debe
  asumir un selector o shape que no se haya verificado.
- Tiene protección anti-bot (challenges tipo Cloudflare). El acceso debe intentarse primero de la
  forma más simple posible; degradar a un mecanismo más pesado (ej. un browser headless) solo
  cuando el acceso simple efectivamente empiece a fallar por bloqueo, no de entrada.
- Debe respetarse un límite de velocidad entre requests para no gatillar bloqueos.

### Dos granularidades de datos

| Fuente | Qué trae | Cuándo se usa |
|---|---|---|
| Página de plantel de un equipo | Todos los jugadores del equipo con sus métricas agregadas de temporada, en una sola consulta | Refresh periódico masivo — una consulta por equipo, no por jugador |
| Página de estadísticas por partido de un jugador | Detalle partido a partido de la temporada | Bajo demanda, para el historial de un jugador puntual |

## 6. Resiliencia y manejo de errores

- Una falla al procesar un equipo puntual no debe abortar el resto del lote — se registra y se
  continúa.
- Un bloqueo generalizado del proveedor (ej. varios fallos consecutivos por posible Cloudflare)
  debe ser detectable, para poder escalar el método de acceso en vez de reintentar indefinidamente
  con el método simple.
- Si WhoScored no responde en absoluto, los datos ya persistidos en corridas anteriores deben
  seguir disponibles para el resto del sistema (tolerancia a fallas de proveedor externo, ya
  exigida por la constitución del proyecto).
- Un jugador sin match no bloquea el procesamiento del resto del equipo.

## 7. Reglas de arquitectura aplicables

Rige la constitución del proyecto: capas, ubicación de entidades, validación por nivel, tests.
Dos puntos que la constitución todavía no resuelve y hay que definir antes de repetir este patrón
en otra spec (no se asume una respuesta acá):

1. Si un módulo sin endpoints HTTP (como este, que es un proceso de ingesta) puede omitir la
   pieza de controller que exige la estructura de directorios.
2. Dónde viven las integraciones con APIs externas (adapters) dentro de esa estructura — hoy no
   tienen una ubicación prevista.

## 8. Configuración requerida

El acceso a WhoScored debe ser configurable sin tocar código: URL base del proveedor y el delay
mínimo entre requests, como mínimo.

## 9. Criterios de aceptación / testing

- Las reglas de matching de la sección 4 están cubiertas con casos de nombres idénticos, con
  acentos, con apodos, y con dos jugadores del mismo equipo con nombres parecidos — sin NestJS ni
  base de datos real (son reglas de dominio puras).
- El parser se prueba contra páginas guardadas localmente una vez resuelta la reconnaissance de
  la sección 5, nunca contra el sitio real en cada corrida de tests.
- Una corrida completa no duplica el snapshot de un jugador para la misma temporada, y los
  jugadores sin match quedan efectivamente registrados para revisión.
- Se cumple la definición de terminado general del proyecto (tests unitarios e integración,
  felices y borde, aplicación compila y levanta, Postman y Swagger actualizados).

## 10. Decisiones pendientes antes de implementar

1. Confirmar en vivo la estructura real de las páginas de WhoScored (sección 5) y documentar el
   resultado acá.
2. Confirmar si intercepciones, faltas, despejes y altura están realmente disponibles en la
   página de plantel; si no, sacarlos del alcance (sección 3).
3. Resolver el matching equipo-a-equipo contra WhoScored, necesario para poder ubicar la página
   de plantel de cada equipo.
4. Definir en la constitución los dos puntos de la sección 7.
5. Diseñar (en otra spec) el scheduler que dispare el refresh periódico y el servicio que calcule
   la cotización a partir de estos datos.