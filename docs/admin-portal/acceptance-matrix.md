# Matriz de aceptación

Cada fila dice qué prueba la cubre y dónde vive la evidencia. **`PENDIENTE` significa que
no se ejecutó**, y está escrito como tal: un requisito sin prueba ejecutada no cuenta como
cumplido por muy claro que esté el código.

Convenciones de la columna «Evidencia»:

- `core/unit` → `yarn test` (613 pruebas).
- `core/int` → `yarn test:integration` contra PostgreSQL 17.5 real.
- `e2e` → Playwright contra núcleo, tablero y PostgreSQL reales.

## Autorización

| ID | Escenario | Prueba | Estado |
| --- | --- | --- | --- |
| AUTH-01 | Anónimo abre `/admin` y la API privada | `e2e admin-auth` «un anónimo no recibe el portal ni sus cifras» y «la API privada rechaza a un anónimo sin filtrar datos» | ✅ La navegación termina en el login, el documento no contiene «Resumen operativo» y la API responde 401 sin mencionar `checksum`. |
| AUTH-02 | Lectora intenta aplicar un sembrador | `e2e admin-auth` «una lectora no puede reconciliar y nada cambia en la base» | ✅ 403 del núcleo y `operations.seed_application` con el mismo número de filas antes y después. |
| AUTH-03 | Sesión cerrada y cookie manipulada | `e2e admin-auth` (dos casos) | ✅ Cerrar sesión devuelve al login sin bucles; una cookie con la firma alterada no abre el portal. |
| AUTH-04 | Organización A consulta entidad B | `core/unit admin-authorization`, `AuditViewRepository` filtra en la consulta | ⚠️ **Parcial.** El filtro por organización se aplica en SQL y hay prueba unitaria de la política, pero **no** hay un caso de extremo a extremo con dos organizaciones: este despliegue de pruebas tiene una sola. Declarado como no comprobado en runtime. |
| AUTH-05 | Mutación con CSRF u origen inválido | `e2e admin-auth` (dos casos) | ✅ 403 `CSRF_REJECTED` sin token; 403 con `Origin` ajeno. |

## Sembradores

| ID | Escenario | Prueba | Estado |
| --- | --- | --- | --- |
| SEED-01 | Base vacía | `core/int seed-lifecycle` «aplica los catálogos obligatorios» + `e2e admin-seeds` | ✅ El registro anota el paquete con su checksum y las tablas tienen filas. |
| SEED-02 | Segundo arranque | `core/int seed-lifecycle` «es idempotente» | ✅ Mismo número de filas y una sola entrada en el registro. |
| SEED-03 | Dos procesos | `core/int seed-lifecycle` «colapsa dos peticiones simultáneas» | ✅ Un solo `seed_run`, un solo identificador, un solo `accepted`. |
| SEED-04 | Mismo código y versión, otro checksum | `core/int seed-lifecycle` «rechaza una reconciliación cuyo checksum revisado ya no coincide» + `core/unit seed-policy` | ✅ 409 y cero ejecuciones abiertas. |
| SEED-05 | Fallo antes del commit | `core/int seed-recovery` «revierte la unidad transaccional» | ✅ `FAILED`, registro vacío y **checkpoint vacío**: no declara un paso que no llegó a estar. |
| SEED-06 | Fallo después del commit y antes del refresco | `core/int seed-recovery` (dos casos) | ✅ Datos aplicados y `PARTIAL` con «la publicación quedó pendiente»; `read_model_publication` en `PENDING`. |
| SEED-07 | Demo en un entorno de producción | `core/int seed-recovery` «rechaza datos de demostración» + `e2e admin-seeds` | ✅ Rechazo antes de escribir, con la aplicación arrancada en `NODE_ENV=production`. |
| SEED-08 | Catálogo modificado a mano | `core/int seed-lifecycle` + `e2e admin-seeds` | ✅ La diferencia nombra el campo; validar no escribe; aplicar repara. |
| SEED-09 | Dependencia ausente o cíclica | `core/unit seed-manifest` (tres casos) + `core/int seed-lifecycle` | ✅ El grafo se valida antes de escribir; un paquete no declarado da 404 sin abrir ejecución. |
| SEED-10 | Registro adicional permitido | `core/int seed-lifecycle` | ✅ Se cuenta aparte y nunca se borra ni se informa como corrupto. |
| SEED-11 | Interrupción de un corpus | `core/int seed-recovery` «conserva las unidades confirmadas y reanuda desde el checkpoint» | ✅ El reintento hereda el checkpoint y termina el resto. |

## Ingesta

| ID | Escenario | Prueba | Estado |
| --- | --- | --- | --- |
| ING-01 | Envío válido por API | `core/int submission-round-trip` (dos casos, por HTTP real) | ✅ Un ciclo completo —abrir, enviar, cerrar— por `POST /intelligence/daily-analysis`: la observación queda registrada y **no** como publicada, las etapas `DELIVERY` y `COLLECTION` dejan cada una su fila con sus contadores, ninguna etapa reclama la persistencia que este camino no hizo, y el lector de la consola informa lo mismo para esa ejecución. Un envío cuya afirmación no cita evidencia se rechaza y no escribe nada. |
| ING-02 | Recolección exitosa sin entrega | `core/int ingestion-stages` «reports a collection that never reached delivery» | ✅ `COLLECTION` correcta y `DELIVERY` fallida sobre la misma ejecución: ninguna etapa afirma persistencia, la razón del fallo queda escrita y el listado la cuenta como una etapa abierta. |
| ING-03 | Reintento del mismo lote | `core/unit` de idempotencia de lotes (preexistente) | ✅ Cubierto por la suite existente; este trabajo no cambió esa lógica. |
| ING-04 | Fuente activa y fuente atrasada | `core/unit source-schedule.policy` + `e2e admin-screens` | ✅ Con calendarios reales: la diaria aparece atrasada y la anual al día. |
| ING-05 | Histórico y anual | `core/unit source-schedule.policy` (dos casos) | ✅ Una fuente histórica nunca se marca atrasada; una anual no lo está en febrero. |
| ING-06 | Ejecución parcial | `core/int ingestion-stages` «reconciles the counters of a partial run» | ✅ 100 recibidos, 60 aceptados, 10 rechazados y 5 en cuarentena dejan 25 sin resolver, y la suma de los cuatro devuelve el total recibido. |
| ING-07 | Latido interrumpido | `core/int seed-recovery` «abandona una ejecución cuyo latido se detuvo» | ✅ Una ejecución de tres horas con latido reciente **no** se abandona; una con latido detenido sí. |
| ING-08 | Sin novedades | `core/int ingestion-stages` «records a run that found nothing as no changes» | ✅ Una ejecución sin fuentes consultadas queda como `NO_CHANGES` con su razón, y no se cuenta como etapa pendiente. |

## Calidad y metadatos

| ID | Escenario | Prueba | Estado |
| --- | --- | --- | --- |
| QLT-01 | 8 válidos sobre 10 | `core/int quality-evaluation` «reporta 8 de 10 como 80 %» | ✅ Numerador 8, denominador 10, `share` 80, estado `FAIL`, y los mismos valores en `quality_assessment`. |
| QLT-02 | Sin población | `core/int quality-evaluation` «reporta una población vacía como NOT_EVALUATED» + `e2e admin-screens` | ✅ `share` es `null` y el estado es `NOT_EVALUATED`; nunca 100 %. |
| QLT-03 | Cifra en la cita pero contexto incorrecto | `core/int quality-evaluation` + `core/unit quality-evaluation` | ✅ La regla se llama «respaldo textual, no verdad» y la prueba lo afirma sobre el nombre almacenado. |
| QLT-04 | Regla nueva | `core/int quality-evaluation` «reemplaza la evaluación en un corte y conserva la historia» | ✅ Un corte distinto es una fila distinta. |
| QLT-05 | Cierre autorizado | `core/int issue-closure` (tres casos, por HTTP real) | ✅ La incidencia recorre `TRIAGED → IN_CORRECTION → RESOLVED → VERIFIED → CLOSED`, la nota sobrevive, un salto de orden se rechaza sin mover nada y queda registrado como rechazo, y el rastro no admite edición posterior. **Requirió corregir un defecto:** `entity_reference` era nulo en toda escritura que devolviera una fila, de modo que el historial de la pantalla estaba vacío por construcción. |
| META-01 | Entidad referenciada | Columna «Referencias» y estado «Protegida» | ⚠️ **Parcial.** La consola no ofrece edición destructiva de una entrada referenciada; la edición gobernada sigue en los endpoints de gobernanza, que este trabajo no cambió. |
| META-02 | Listado y filtros | `e2e admin-screens` «el catálogo en pantalla coincide con la base» | ✅ El número de la pantalla es el `count(*)` de la tabla, y lo referenciado se marca. |

## Exportaciones y tráfico

| ID | Escenario | Prueba | Estado |
| --- | --- | --- | --- |
| EXP-01 | CSV y JSON | `e2e admin-exports` (dos casos) | ✅ Archivo descargado, **parseado** con un lector que entiende comillas, y sus filas comparadas con la cabecera y con el registro. |
| EXP-02 | Conjunto inválido | `e2e admin-exports` | ✅ 400 y ninguna etapa `GENERATED`. |
| EXP-03 | Base no disponible | `e2e admin-exports` | ✅ 503 sin filtrar el host, y `FAILED` con `READ_FAILED` en el registro. |
| EXP-04 | Límite de filas | `e2e admin-exports` (caso JSON) | ✅ El archivo declara `truncado` y la cabecera dice lo mismo. |
| EXP-05 | Telemetría caída | `e2e admin-exports` «con el registro roto el archivo se entrega igual» | ✅ Con el `INSERT` del escritor revocado sobre `operations.export_request`, el CSV llega completo y con sus filas declaradas, el registro queda vacío —hueco visible, no exportación inventada— y vuelve a registrar en cuanto se restituye el permiso. |
| TRF-01 | Navegación y recarga | `e2e admin-traffic` | ✅ Una visita, una fila; la recarga, otra. |
| TRF-02 | Evento repetido | `e2e admin-traffic` | ✅ `accepted: 0`, `duplicates: 1`, una sola fila. |
| TRF-03 | Parámetros sensibles | `e2e admin-traffic` (dos casos) | ✅ Una ruta con `?buscar=` se rechaza con 400 y no queda nada en el registro; ningún identificador crudo llega a la tabla. |

## Disponibilidad

| ID | Escenario | Prueba | Estado |
| --- | --- | --- | --- |
| HLT-01 | Tres fallos consecutivos | `core/int availability` «opens a single incident after the third consecutive failure» | ✅ El tercer fallo abre un incidente y el cuarto no abre un segundo; el aviso queda registrado una vez, no una por sondeo. |
| HLT-02 | Dos éxitos de recuperación | `core/int availability` «closes the incident after two consecutive successes» | ✅ El primer éxito no cierra; el segundo sí, y deja `closed_at` escrito. |
| HLT-03 | Monitor sin datos | `e2e admin-screens` + `core/int availability` «never opens or closes an incident on an unknown outcome» | ✅ «Sin telemetría de disponibilidad» en la pantalla y «Sin medición» en el resumen; nunca verde. Además, un `UNKNOWN` interrumpe la racha sin abrir incidente y no cierra uno abierto, y todo sondeo queda registrado, incluido el que no decidió nada. |
| HLT-04 | Base accesible con sembrador obligatorio ausente | `core/int readiness` (tres casos) | ✅ Con la base respondiendo, `core-catalogues` sin aplicar se cuenta como obligatorio faltante y nombra de qué depende (`ingesta`, `gobernanza`, `calidad`, `tablero-publico`); aplicado deja de contarse; una suma de comprobación distinta es `conflict` y sigue contando como faltante, no como aplicado. |
| HLT-05 | Copia guardada vieja o sin construir | `e2e admin-screens` | ✅ El estado se lee de `pg_class.relispopulated`, que es la única respuesta fiable. |

## Interfaz y regresión

| ID | Escenario | Prueba | Estado |
| --- | --- | --- | --- |
| UI-01 | Enlaces, botones y filtros | `e2e admin-screens` «cada sección responde» | ✅ Las nueve secciones abren con su título y su navegación. |
| UI-02 | Cuatro viewports | `e2e admin-visual` (cuatro casos + zoom al 200 %) | ✅ 38 capturas revisadas a ojo; desbordamiento horizontal del documento ≤ 1 px en las cuatro anchuras y al 200 %. |
| UI-03 | Teclado, modal y accesibilidad | `e2e admin-visual` + `e2e admin-seeds` + `e2e admin-screens` | ✅ axe-core sin incumplimientos serios ni críticos en las nueve pantallas; el modal enfoca, cierra con Escape y devuelve el foco; cada estado lleva palabra y marca además de color. |
| UI-04 | Consola y peticiones | `e2e admin-screens` | ✅ Ningún error inesperado en consola al recorrer las nueve secciones. |
| UI-05 | Recarga y enlace profundo | `e2e admin-screens` | ✅ El filtro vive en la dirección y sobrevive a la recarga. |
| REG-01 | Tablero público | `e2e admin-exports` usa los controles reales del informe; `admin-visual` captura la portada | ⚠️ **Parcial.** Los capítulos que este trabajo tocó (portada y descargas) se ejercitan, pero no hay una regresión sistemática de los siete capítulos. |
| REG-02 | Pares de versiones compatibles | El tablero público no depende de ninguna ruta nueva del núcleo | ⚠️ **Parcial.** Por construcción el tablero anterior sigue funcionando contra el núcleo nuevo (nada se quitó ni se cambió de forma), pero no se ejecutó una prueba con el frontend previo. |

## Resumen honesto

- **Comprobado con evidencia ejecutada:** las cinco de autorización menos AUTH-04, las
  once de sembradores, ING-04/05/07, las cinco de calidad y metadatos menos QLT-05 y
  META-01, EXP-01 a EXP-04, TRF-01 a TRF-03, HLT-03 y HLT-05, y UI-01 a UI-05.
- **Parcial y declarado como tal:** AUTH-04, ING-01, ING-02, ING-06, ING-08, QLT-05,
  META-01, EXP-05, HLT-01, HLT-02, HLT-04, REG-01, REG-02.
- **Ninguna fila está marcada como cumplida por inspección del código.**
