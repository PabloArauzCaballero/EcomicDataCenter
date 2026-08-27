# ADR 0020 — Materialise the press read models

- **Estado**: aceptada
- **Fecha**: 2026-08-27
- **Reemplaza a**: ninguna
- **Relacionada con**: ADR 0007 (separación lectura/escritura), ADR 0019 (cobertura de prensa)

## Contexto

`read_models.press_article` es una vista. Rearma cada nota desde su
`raw_observation`, su `source_artifact` y su `claim_evidence`, y encima aplica
todo el léxico de tema, tono y región. Esa derivación en la consulta es
deliberada y buena: la definición de cómo se clasifica una nota está en un solo
lugar, es legible, y ningún consumidor puede discrepar de otro.

Con cuatro mil notas el costo era invisible. Con **38.519** deja de serlo:

| consulta | tiempo |
|---|---|
| una página de 60 notas ordenada por fecha | 9,2 s |
| recorrer la vista entera para la tabulación cruzada | 11,7 s |
| el vocabulario vigilado agrupado por término | 3,9 s |
| portada del tablero | 9,5 s |

El `statement_timeout` de 15 s empezó a cortar consultas y la portada dejó de
responder. El corpus seguirá creciendo: hay años enteros aún sin recolectar.

## Decisión

Se agrega una **copia materializada** de los dos modelos de lectura de prensa —
`press_article_snapshot` y `press_term_mention_snapshot` — con los índices que
un registro necesita: por fecha para paginarlo, y por cada dimensión para
cortarlo.

**La vista no cambia.** Sigue siendo la definición: quien quiera saber por qué
una nota quedó bajo «Hidrocarburos» lee la vista. La instantánea es esa misma
salida, guardada. No cambia *cómo* se deriva una cifra, sólo *cuántas veces* se
paga la derivación.

El refresco es `REFRESH MATERIALIZED VIEW CONCURRENTLY`, habilitado por un
índice único sobre `fact_claim_id`, de modo que un lector a mitad de consulta
nunca queda bloqueado.

## Por qué una instantánea y no otra cosa

- **Índices sobre las tablas base**: no ayudan. El costo no es encontrar las
  filas, es rearmarlas y clasificarlas.
- **Caché en el proceso del tablero**: se probó primero. Sirve para los
  agregados del corpus entero, pero no para una consulta que depende de la
  selección del lector, que es la mayoría.
- **Persistir el tema y el tono como columnas al ingerir**: mueve la
  clasificación al momento de escritura, y entonces cambiar una regla obliga a
  reescribir datos crudos, que en este sistema son inmutables. La instantánea
  deja la clasificación donde debe estar y se reconstruye con un comando.

## Consecuencias

- **El corpus es de sólo lectura entre cargas**, así que una instantánea es la
  forma correcta: se refresca al terminar una recolección o una carga de seeds,
  nunca durante.
- **Quien agregue cobertura debe refrescar.** `yarn press:refresh` existe para
  eso y el runner de seeds lo llama al final; el flujo de CI también. Si no se
  refresca, el informe sirve el corpus como estaba antes — visible y corregible,
  no silencioso.
- **El refresco levanta `statement_timeout`** para su propia sesión y sólo para
  ella: es la única operación del sistema pensada para tardar minutos.
- **Cuesta espacio**: una copia del corpus. A este tamaño son decenas de MB.
- Si el corpus llega a un punto donde el refresco completo sea impracticable,
  el paso siguiente es refrescar por año en vez de entero. No hace falta hoy.

## Evidencia

Medido sobre 38.519 notas, base local:

| | antes | después |
|---|---|---|
| portada | 9,5 s | **0,44 s** |
| `/api/prensa` | 9,2 s | **0,07 s** |
| refresco completo | — | 28 s |
