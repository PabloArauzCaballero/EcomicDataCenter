# Informe final — portal administrativo del Observatorio

Fecha: 2026-09-16. Todo lo que sigue se midió ejecutando. Lo que no se ejecutó
está dicho como tal y está al final, en su propio apartado.

## Qué se entregó

Un área privada del tablero —once pantallas— sobre consultas y operaciones
administrativas nuevas del núcleo, para vigilar tráfico, exportaciones,
disponibilidad, ingesta, calidad, metadatos y sembradores en cada entorno.

PostgreSQL y los servicios del núcleo siguen siendo la fuente de verdad. La
telemetría complementa; nunca sustituye. La conexión pública de lectura del
tablero no se tocó.

| Repositorio | Rama | Commit inicial | Commit final |
| --- | --- | --- | --- |
| `EcomicDataCenter` | `dev` | `ae30a43` | `3b7511f` |
| `observatorio-dashboard` | `dev` | `e04909c` | `0aafef7` |

**No se hizo `git push`.** `dev` despliega automáticamente y el plan exige
autorización explícita antes de tocar un entorno desplegable.

## Evidencia ejecutada

| Comprobación | Resultado |
| --- | --- |
| `yarn test` (núcleo) | 78 suites, 615 pruebas, verde |
| `yarn test:integration` | 10 de 12 suites verdes, 54 pruebas; 2 suites **anteriores a este trabajo** agotan su plazo (ver abajo) |
| `yarn quality:all` | 18 puertas, sin ningún `FAIL` |
| `yarn lint` · `yarn format:check` · `yarn typecheck` | limpios |
| Playwright (tablero) | 59 casos en chromium y firefox, verde (7,6 min) |
| axe-core WCAG 2 A/AA | sin incumplimientos serios en ninguna pantalla |
| Migraciones sobre base virgen | 75 aplicadas en 4,6 s, 11 esquemas |
| Sembradores de arranque desde cero | ver «Aprovisionamiento desde cero» |
| Carga de la consola | ver «Rendimiento» |

## Defectos preexistentes encontrados y corregidos

Ninguno de estos era parte del encargo; todos impedían que el portal dijera la
verdad, así que se corrigieron y se cubrieron con pruebas.

1. **El refresco de vistas materializadas no tenía permisos.** El sembrador
   refresca por el escritor y la migración 0014 le revoca `read_models` a
   propósito. Resuelto con `read_models.refresh_snapshot(...)`, `SECURITY
   DEFINER` con `search_path` fijado. **Esto cierra el CI en rojo que el
   proyecto arrastraba desde el 2026-09-08.**

2. **El rastro de auditoría no decía sobre qué entidad actuaba.** Una instancia
   de Sequelize guarda sus atributos en `dataValues`, así que leer las
   propiedades propias del resultado no encontraba ningún identificador:
   `entity_reference` quedaba nulo en **toda** escritura que devolviera una
   fila. La pantalla de una incidencia pregunta al rastro «qué le pasó a esta
   incidencia» y por eso mostraba siempre un historial vacío. Los rechazos eran
   peores: se registraban sin referencia alguna, de modo que el único tipo de
   intento que alguien iría a buscar era el que no se podía encontrar.

3. **Al lector le faltaba el permiso sobre `intelligence.raw_observation`**, con
   lo que el indicador de cartas muertas marcaba cero en lugar de marcar que no
   se podía medir.

4. **El techo de sentencia del runtime cancelaba el aprovisionamiento.** Los
   sembradores de arranque usan ahora su propio grupo de conexiones con un techo
   propio, en vez de un `SET` por conexión que no sobrevivía al grupo.

5. **El registro de sembradores no veía lo aplicado en el arranque**, así que un
   catálogo cargado por el arranque aparecía como ausente en la consola.

### Dos suites de integración anteriores que no caben en su plazo

`indicator-read-models` y `concurrency` no pasan en una ejecución completa.
Ninguna de las dos es de este trabajo —la última vez que se tocaron fue en
`3a6e145`— y ninguna falla por su lógica: ambas agotan el plazo de 30 s que Jest
da por omisión, porque su preparación vuelve a cargar el corpus entero de
siembra y ese corpus ha crecido hasta 155 MB y 1,4 millones de filas.

Antes de este trabajo fallaban **antes**, y por otra razón: `runBootSeeds()`
moría con `permission denied for schema read_models`, que es el rojo que el
proyecto arrastraba. Corregido eso, llegan más lejos y ahora se topan con el
reloj. **Estaban en rojo y siguen en rojo, por un motivo distinto.**

La corrección de fondo no es subir el plazo —eso convierte una prueba en una
espera— sino que cada una siembre solo el catálogo que afirma algo sobre él;
`runBootSeeds` ya acepta ese argumento. Queda anotado como trabajo siguiente y
**no** se presenta como resuelto.

Las ocho suites del portal administrativo pasan, y también las otras dos
ajenas a este trabajo que sí caben en su plazo.

## Defectos propios encontrados durante el trabajo

Se enumeran porque el plan pide no presentar éxito parcial como total.

1. **El punto de control reclamaba una unidad que nunca hizo commit.** Se amplía
   ahora solo después del `COMMIT`. Cubierto por el fallo inyectado de
   `SEED-06`.

2. **La reparación no reparaba.** La reanudación heredaba el punto de control de
   una ejecución `PARTIAL` ya completa y no le quedaba ningún paso pendiente.
   Cubierto por `SEED-08`.

3. **Las etapas de exportación se perdían.** Medido: con una promesa suelta se
   perdieron 8 de 8; con `after()` de Next.js, 2 de 12, sin dejar siquiera un
   aviso en el registro del servidor; con espera acotada a 2 s, 14 de 14
   completas. `EXP-05` comprueba que el archivo llega igual con el registro
   roto, para que la corrección no convierta un registro caído en una descarga
   caída.

4. **El formulario de acceso podía enviar la contraseña por la URL.** El
   `onSubmit` la envía por `fetch`, pero entre que llega el HTML y arranca el
   script el formulario es un formulario corriente, y el método por omisión de
   un formulario corriente es `GET`. Quien enviara en esa ventana —o a quien no
   le cargara el script— mandaba su contraseña como cadena de consulta, donde
   queda en el historial, en el registro de acceso de cada salto y en el
   `Referer` de lo siguiente que cargue. Lo encontró una prueba de extremo a
   extremo que, al fallar, dejó `?subject=…&password=…` escrito en su propio
   mensaje de error. Corregido con `method="post"`, y `AUTH-06` lo comprueba
   sobre el HTML servido, que es lo que existe durante esa ventana.

5. **El botón de acceso parecía listo antes de estarlo.** Ahora dice
   «Cargando…» y está deshabilitado hasta que el formulario es interactivo. Un
   control que se ve listo y no lo es es como alguien acaba escribiendo su
   contraseña dos veces.

6. **Dos reglas de calidad no podían fallar nunca.** `CLAIM_HAS_EVIDENCE` sobre
   `PUBLISHED` está garantizada por un disparador, y `EVIDENCE_HAS_DIGEST` mira
   una columna `NOT NULL`. Una regla que siempre aprueba es peor que no tenerla:
   parece cobertura. Acotada la primera y sustituida la segunda.

## Rendimiento

Medido sobre `observatory_clean` —base aprovisionada desde cero, 3,3 GB, 1.424.407
observaciones crudas— con el núcleo compilado y la autenticación real por JWKS.
Se envían 100.000 eventos de tráfico por la misma ruta de entrada que usa el
sitio público, y después 20 lectores concurrentes recorren las nueve pantallas
durante 5 minutos, con una pausa de 50 ms entre peticiones.

El limitador de peticiones se elevó **solo para la medición** (`RATE_LIMIT_MAX`).
Con el valor de producción —300 por minuto y clave— lo que se mide es el
limitador, no las consultas. El limitador no se tocó en el código.

**Entrada:** 100.000 eventos aceptados en 7,0 s, 0 lotes rechazados. El registro
quedó con 200.050 filas (65 MB) al final de la segunda medición.

**Lectura**, 36.111 peticiones en 5 minutos, **0 fallos**:

| Pantalla | p50 | p95 | p99 |
| --- | ---: | ---: | ---: |
| `/admin/overview` | 55 ms | **84 ms** | 101 ms |
| `/admin/analytics/traffic` | 869 ms | **1.000 ms** | 1.039 ms |
| `/admin/analytics/exports` | 22 ms | **51 ms** | 68 ms |
| `/admin/ingestion/sources` | 28 ms | **57 ms** | 73 ms |
| `/admin/ingestion/runs` | 26 ms | **55 ms** | 70 ms |
| `/admin/quality/summary` | 27 ms | **56 ms** | 76 ms |
| `/admin/health/summary` | 32 ms | **61 ms** | 78 ms |
| `/admin/seeds/packages` | 16 ms | **31 ms** | 39 ms |
| `/admin/audit/events` | 25 ms | **55 ms** | 73 ms |

**Objetivo p95 ≤ 2 s: cumplido en las nueve pantallas.** La más lenta es la de
tráfico, que agrega 200.050 eventos; es la que hay que vigilar según crezca el
registro.

### Un defecto que solo apareció bajo carga

La primera medición no cumplía: `/admin/overview` daba p95 de **3.794 ms** y
`/admin/seeds/packages` **3.813 ms**. La causa no era la base: cada petición
recalculaba el SHA-256 de los 155 MB de archivos de siembra, porque la
resolución del manifiesto no se guardaba. El resumen lo heredaba porque también
lista paquetes.

Los digestos son una propiedad de la compilación, no de la petición: los
archivos viajan dentro del build y no pueden cambiar mientras el proceso vive.
Se guarda ahora la promesa de resolución por proceso, con lo que veinte lectores
simultáneos comparten un recorrido en vez de empezar veinte.

| | antes | después |
| --- | ---: | ---: |
| `/admin/overview` p95 | 3.794 ms | 84 ms |
| `/admin/seeds/packages` p95 | 3.813 ms | 31 ms |
| Peticiones servidas en 5 min | 6.345 | 36.111 |

La prueba que afirmaba que el digesto es estable entre dos resoluciones pasaba a
comparar un valor consigo mismo, así que ahora vacía la memoria entre las dos:
una prueba que deja de comprobar lo que dice es peor que no tenerla.

El informe crudo queda en `artifacts/admin-console-load.json` (no versionado).

## Aprovisionamiento desde cero

Base creada vacía, con los mismos roles y permisos que las demás.

| Paso | Resultado |
| --- | --- |
| `yarn db:migrate` | 75 migraciones, **4,6 s**, 11 esquemas |
| `yarn db:seed:boot` | 20 paquetes, **3.183 s (53 min)**, salida 0 |
| Arranque de la aplicación | las 4 copias restantes construidas en **75 s** |

Estado final: 1.424.407 observaciones crudas, 38.365 artículos en la copia de
prensa, 3,3 GB, las siete copias guardadas construidas.

**El término dominante es el refresco de `press_article_snapshot`**, que tardó
unos 25 de los 53 minutos. Se hace `CONCURRENTLY` porque un refresco simple toma
un bloqueo exclusivo y el informe público deja de responder mientras dura; en un
aprovisionamiento inicial nadie está leyendo, pero el código no puede saberlo.
Es un compromiso deliberado y anterior a este trabajo, no un defecto, y queda
anotado por si alguna vez se decide distinguir el primer arranque.

**División del trabajo, comprobada:** el sembrador construye las tres copias que
alimentan sus propios paquetes (prensa, menciones, lecturas sociales) y la
aplicación construye las otras cuatro al arrancar, sin `CONCURRENTLY` porque
todavía no existen. Las dos mitades usan la misma rutina `SECURITY DEFINER`. Una
copia sin construir se declara como tal en la consola (`HLT-05`), nunca como
cero.

## Lo que no se comprobó

- **AUTH-04 — aislamiento entre organizaciones.** El filtro por organización se
  aplica en SQL y tiene prueba unitaria, pero este despliegue de pruebas tiene
  una sola organización: no hay caso de extremo a extremo con dos. **No
  comprobado en runtime.**
- **META-01 — entidad referenciada.** La consola no ofrece edición destructiva
  de una entrada referenciada; la edición gobernada vive en los endpoints de
  gobernanza, que este trabajo no cambió.
- **REG-01 — regresión del tablero público.** Se ejercitan los capítulos que
  este trabajo tocó (portada y descargas); no hay una regresión sistemática de
  los siete capítulos.
- **REG-02 — pares de versiones.** Por construcción el tablero anterior sigue
  funcionando contra el núcleo nuevo, porque no se quitó ni se cambió de forma
  ninguna ruta pública. **No se levantó el frontend anterior para comprobarlo.**
- **El analizador del modelo físico sigue sin leer `migration-sql/`.** La
  migración 0075 se adaptó a la herramienta en vez de arreglar la herramienta.
  Queda anotado como deuda, no como hecho.

## Riesgos y siguientes pasos

1. **Autorizar el `push`.** El trabajo está confirmado en local en ambos
   repositorios. `dev` despliega solo.
2. **Rotar las credenciales del entorno de pruebas.** Las claves usadas en la
   suite son desechables y viven fuera del repositorio; no deben viajar a
   ningún despliegue.
3. **Configurar `ADMIN_OPERATORS`, `ADMIN_SESSION_SECRET` y
   `ADMIN_JWT_PRIVATE_KEY`** en cada entorno antes de abrir el área privada. Sin
   ellas el portal no arranca, que es lo correcto.
4. **Decidir sobre `AUTH-04`.** Mientras haya una sola organización, el
   aislamiento es una promesa del código sin ejercicio en runtime.
