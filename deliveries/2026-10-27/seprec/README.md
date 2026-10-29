# SEPREC — registro de comercio, unidad por unidad (27-oct-2026)

Entrega del recolector del **Servicio Plurinacional de Registro de Comercio (SEPREC)**, sucesor de
FUNDEMPRESA desde abril de 2022. Una fila por unidad económica inscrita, sacada de la API pública
que usa el portal `miempresa.seprec.gob.bo` («Consulta de empresas»), sin sesión, sin token y sin
captcha.

<!-- ESTADO -->
## Gaceta — corrida en la nube del 29-oct (PARCIAL)

- **997 de 2.289 páginas** (el total creció: la API declara ahora 228.886 publicaciones). **99.568
  publicaciones únicas** (99.700 filas leídas; 132 repetidas por `id`), de **59.475 empresas**
  distintas (79 sin matrícula). Rango de fechas: **2023-06-30 a 2026-10-29** (las más recientes;
  faltan las anteriores, hasta 2017). Por año: 2023 15.970 · 2024 30.265 · 2025 28.761 · 2026 24.572.
  1.425 tipos de publicación; los mayores: cambio de dirección de la empresa (46.860), constitución
  de S.R.L./colectiva/comandita simple (16.592), modificación de la constitución (8.245),
  transferencia de cuotas (7.390). Detalle completo en `gaceta-summary.json`.
- **Sin terminar:** el tope de tiempo de la tarea en segundo plano cortó la descarga. Hubo cortes de red
  intermitentes (`Failed to fetch`, sin 403 ni desafío anti-bots), que los reintentos con retroceso
  absorbieron a ~5-9 páginas/min. No se re-pidieron las primeras páginas al final, así que lo
  publicado durante la corrida puede estar corrido unas filas; se deduplica por `id`.
- **Archivos:** `seprec-gaceta-01.ndjson.gz` (una fila por publicación: `id_publicacion`, `codigo`,
  `matricula`, `matricula_anterior`, `razon_social`, `tipo_publicacion`, `fecha_publicacion`,
  `enlace`, `fuente_api`) y `gaceta-summary.json`. El `enlace` es la Gaceta pública: la API no da una
  URL por aviso y no se inventó.
- **Privacidad:** solo datos de la empresa. No hay `resumen`, socios, representantes ni ficha
  `informacionBasicaEmpresa`. Razones sociales de unipersonales se dejan como en el padrón; un correo
  (1) o un número de 6+ dígitos (2) dentro de una razón social se tapó (`[correo omitido]`,
  `[número omitido]`). `scripts/verify-gaceta-privacy.mjs` (independiente, NFKC, dígitos con
  separadores): **0 hallazgos** en 99.568 filas.
- **Reanudar:** `node scripts/run-all.mjs <out> 1 gaceta 30` (en `PW_DIR`/`CHROME_PATH` el
  headless-shell de Chromium) y luego `node scripts/build-gaceta.mjs <out> deliveries/2026-10-27/seprec`
  y `node scripts/verify-gaceta-privacy.mjs deliveries/2026-10-27/seprec`.

## Estado de esta entrega

- **Listado COMPLETO: 423 de 423 páginas → 422.530 unidades únicas.** Es el total que declaraba
  la API el 27-oct (422.530). Las páginas 1-391 se bajaron el 27-oct y las 392-423 el 28-oct, cuando
  la API ya declaraba 422.536: faltan unas 6 inscripciones de esas horas, menos del 0,002 %.
- **Frente al 398.131 del SEPREC (nov-2025):** esa cifra cuenta las unidades no canceladas,
  renovadas o no. Aquí hay **407.771 con `estado_registro` ACTIVO (102,4 % de esa referencia: el
  registro creció desde noviembre)**. De ellas, 114.513 tienen la matrícula renovada (`vigente`) y
  293.258 no (`no_actualizada`).
- **Paginación:** el orden es por razón social con desempates inestables. En las primeras 391.000
  filas leídas hubo 4 repetidas; se deduplica por `id`.
- **Gaceta: 8 de 2.287 páginas** (799 publicaciones, las más recientes al 27-oct). Sin terminar.
  `fecha_constitucion_gaceta` y `publicaciones_gaceta` casi siempre van `null`. Dos razones:
  1. El primer turno del 28-oct falló por un error mío: el POST se hacía desde la página de
     `miempresa` y el preflight CORS lo rechaza. Ya está corregido: `run-all.mjs` abre la Gaceta
     desde su propio origen.
  2. El turno siguiente lo mató Claude Code por falta de RAM en la laptop. Fue la segunda muerte
     por memoria del día, así que se paró, como dice la regla del barrido.
- **Fichas: 0.** Siguen bloqueadas (ver «Bloqueos», punto 2), así que el NIT, el municipio, la
  dirección y la actividad van vacíos. Esquivar el filtro antibots es una decisión del usuario.

### Conteos (422.530 unidades)

| Departamento | Unidades | | Tipo societario | Unidades |
| --- | ---: | --- | --- | ---: |
| La Paz | 130.774 | | Empresa unipersonal | 324.023 |
| Santa Cruz | 126.315 | | Sociedad de responsabilidad limitada | 92.828 |
| Cochabamba | 70.883 | | Sociedad anónima | 4.447 |
| Tarija | 20.441 | | Sociedad constituida en el extranjero | 1.057 |
| Oruro | 19.710 | | Sociedad colectiva | 120 |
| Potosí | 19.518 | | Sociedad en comandita simple | 30 |
| Chuquisaca | 17.110 | | Sociedad anónima mixta | 16 |
| Beni | 13.183 | | Entidad financiera de vivienda | 4 |
| Pando | 4.591 | | Sociedad en comandita por acciones | 4 |
| Sin dato | 5 | | Empresa pública departamental mixta | 1 |

| Estado | Unidades |
| --- | ---: |
| `no_actualizada` (ACTIVO, matrícula no renovada) | 293.258 |
| `vigente` (ACTIVO, matrícula renovada) | 114.513 |
| `cancelada` | 13.455 |
| `creado` | 1.046 |
| `inactivo` | 250 |
| `eliminado` | 6 |
| `anulado` | 2 |

Los cruces estado × departamento y tipo × estado están en `summary.json`.

### Cómo reanudar la Gaceta

```bash
export PW_DIR=<carpeta con playwright-core>
# <out> es la carpeta de trabajo con list/ y gaceta/; las páginas ya guardadas se saltan.
# Turnos de 38 minutos como máximo; en la laptop, por el candado compartido:
#   bash <scratchpad>/gate.sh chromium 700 node scripts/run-all.mjs <out> 2 gaceta 38
node scripts/run-all.mjs <out> 2 gaceta 38
node scripts/build-delivery.mjs <out> deliveries/2026-10-27/seprec
```

Las páginas crudas (`list/p-0001…p-0423.json.gz` y `gaceta/g-00001…g-00008.json.gz`) no van en la
rama: están en la carpeta de trabajo de la sesión (scratchpad, `seprec/out/`). La Gaceta ordena por
fecha de publicación descendente, así que lo publicado entre dos turnos corre las páginas hacia
adelante. Al terminar conviene volver a pedir las primeras páginas (borrar `g-00001…g-000NN` y
correr de nuevo). El armador deduplica por `id`.

## Archivos

| Archivo | Qué es |
| --- | --- |
| `seprec-empresas-NN.ndjson.gz` | NDJSON con gzip, una fila por unidad. Partido para que ninguna parte pase de 90 MB. |
| `summary.json` | Conteos: por departamento, tipo societario, estado, estado × departamento; cobertura. |
| `manifest.json` | sha256 y tamaño de cada archivo de la entrega, scripts incluidos. |
| `scripts/` | Los recolectores y el armador (ver «Cómo se repite»). |

## Endpoints encontrados

Todos cuelgan de `https://servicios.seprec.gob.bo/api/` y salen de leer los bundles JS de
`miempresa.seprec.gob.bo`, `gacetadecomercio.gob.bo` y `tramites.seprec.gob.bo`, y de mirar sus
llamadas desde un navegador.

| Endpoint | Método | Auth | Qué devuelve |
| --- | --- | --- | --- |
| `empresas/buscarEmpresas?filtro=&tipoFiltro=nombre\|matricula\|geo&limite=&pagina=` | GET | ninguna | Listado paginado: `id`, `matricula`, `matriculaAnterior`, `razonSocial`, `estado` (ACTIVO/CANCELADO/CREADO/INACTIVO/ELIMINADO), `codEstadoActualizacion` (MATRICULA RENOVADA / NO RENOVADA), `codTipoUnidadEconomica`, departamento, `idEstablecimiento`. `datos.total` da el total. **`limite` acepta 1000 o más.** `filtro=%20` (un espacio) coincide con todo: 422.530 unidades. `filtro=` vacío o `%` → 412 «caracteres especiales». `tipoFiltro=geo` (con `lat`/`lon`) → 500. |
| `empresas/informacionBasicaEmpresa/{id}/establecimiento/{idEstablecimiento}` | GET | ninguna, **pero ver bloqueos** | Ficha «Más información»: `nit`, `objetos_sociales`, `mesCierreGestion`, `ultimoAnioActualizacion`, domicilio (vía, número, edificio, piso, lat/lon, departamento, provincia, municipio) y contactos (teléfonos, correos, web). Solo para matrículas **renovadas**; a las no renovadas y canceladas responde 412 «No se encontró la empresa o esta inactiva». |
| `empresas/consultarEstadoHabilitacion/{matricula}` | GET | ninguna | Estado de habilitación tras la migración de FUNDEMPRESA (`escenario`, `observacion`). Sin valor para el directorio. |
| `publicaciones` (Gaceta Electrónica de Comercio) | POST JSON | ninguna | Índice de la Gaceta: `id`, `codigo`, `titulo` del acto, `resumen`, `fechaPublicacion`, `empresa.{matricula, matriculaAnterior, razonSocial}`. `limite` ≤ 100. 228.671 publicaciones, de 2017 a hoy. Hay que llamarlo desde la página de `gacetadecomercio.gob.bo`: desde `miempresa` el preflight CORS falla. |
| `publicaciones/catalogos/lista` | POST JSON | ninguna | Catálogo de tipos de acto publicables. |
| `empresas/informacionGeneralEmpresa/{id}`, `empresas/constitucionModificaciones/{id}`, `empresas/listarKardex/{id}`, `empresas/{id}/estados-financieros`, `empresa/{id}/beneficiariosFinales`, `empresas/buscarEmpresaPorClave`, `empresas/vinculos-persona/{id}`, `certificados/buscar/{matricula}` | GET | **401 «Usuario no autorizado»** | Son del panel con sesión de Ciudadanía Digital (`miempresa` → login). Ahí están la constitución, el kárdex (fechas de inscripción y actos), los estados financieros, los socios y representantes y el certificado de matrícula. No se intentó entrar. |

`tramites.seprec.gob.bo` es la app de trámites: todo exige login. `datos.gob.bo` no tiene ningún
conjunto del SEPREC ni de FUNDEMPRESA (búsqueda CKAN `seprec` y `fundempresa`: 0 resultados).
`www.seprec.gob.bo/index.php/datos/` solo publica los PDF-infografía mensuales.

## Bloqueos exactos

1. **Cloudflare delante de `servicios.seprec.gob.bo`.** Un cliente HTTP (curl) recibe 403 «Sorry,
   you have been blocked» en cualquier ruta. La misma llamada hecha con `fetch` desde la página del
   portal, en un Chromium, responde 200. No hay captcha ni desafío interactivo de por medio.
2. **La ficha (`informacionBasicaEmpresa`) se corta a navegadores automatizados.** Desde un Chromium
   *headless* (user agent `HeadlessChrome`) esa ruta —y solo esa— no devuelve respuesta con
   cabeceras CORS (`net::ERR_FAILED`, «No 'Access-Control-Allow-Origin' header»), incluso para una
   empresa que en un Chrome normal responde 200 desde la misma IP y en el mismo minuto. El listado y
   la Gaceta sí responden al headless. Es un filtro de bots de Cloudflare puesto sobre la ruta que
   expone teléfonos y correos. **No se evadió** (no se cambió el user agent ni se pasó a un
   navegador con ventana para esquivarlo). Consecuencia: el NIT, el domicilio, el municipio, las
   coordenadas y el objeto social quedan vacíos (`ficha_publica: "no_descargada"`). Para tenerlos
   hace falta pedirlo al SEPREC (ver «Cómo pedir lo que falta») o autorización explícita para
   recogerlas con un navegador no headless.
3. **No existe fecha de inscripción pública.** Ni el listado ni la ficha la traen; está en el
   kárdex, que pide sesión. Se aproxima con la Gaceta (`fecha_constitucion_gaceta`) solo para las
   sociedades cuya constitución se publicó allí.
4. **No hay código CAEB/CIIU público.** La ficha trae el objeto social en texto libre, no un código.
   `actividad_codigo` va siempre `null`.
5. **Sucursales: no publicadas.** El listado trae una fila por unidad con un único
   `idEstablecimiento` (el principal: 0 unidades con más de un establecimiento en el listado). No
   hay ruta pública que liste los establecimientos de una empresa. `sucursales` va `null`
   (desconocido), no `[]`.
6. **Capital: no publicado** fuera de la sesión (constitución y estados financieros dan 401).

## Campos de cada fila

| Campo | Origen | Nota |
| --- | --- | --- |
| `source` | — | `"seprec"` |
| `id_seprec` | listado `id` | Clave interna del SEPREC. |
| `matricula`, `matricula_anterior` | listado | La nueva y la de FUNDEMPRESA (8 dígitos). En las fichas revisadas la matrícula nueva coincide con el NIT, pero no se copia al `nit` sin ficha. |
| `nit` | ficha | `null` sin ficha. |
| `razon_social` | listado | Sin comillas ni espacios de borde; el texto original queda en `raw`. |
| `tipo_societario` | listado `codTipoUnidadEconomica.nombre` | |
| `estado` | listado | `vigente` (ACTIVO + MATRÍCULA RENOVADA), `no_actualizada` (ACTIVO + NO RENOVADA), `cancelada` (CANCELADO), o el estado en minúsculas (`creado`, `inactivo`, `eliminado`). |
| `estado_registro`, `estado_actualizacion` | listado | Los dos valores crudos. |
| `fecha_inscripcion` | — | Siempre `null` (bloqueo 3). |
| `fecha_constitucion_gaceta` | Gaceta | Fecha de la primera publicación cuyo título empieza por «Constitución». |
| `fecha_actualizacion` | — | `null`: la API no da fecha de renovación. |
| `ultimo_anio_renovado`, `mes_cierre_gestion` | ficha | |
| `actividad_codigo` | — | Siempre `null` (bloqueo 4). |
| `actividad` | ficha `objetos_sociales` | Objeto social, varios unidos por ` \| `. |
| `departamento` | listado | Siempre presente. |
| `provincia`, `municipio`, `direccion`, `latitud`, `longitud` | ficha | |
| `domicilio_vivienda` | ficha | `true` si `edificio` o la vía dicen vivienda/particular/casa/domicilio. En unipersonales se vacían dirección y coordenadas, también en `raw`. `null` sin ficha (no se sabe). |
| `sitio_web` | ficha | Lo único que se guarda de los contactos. |
| `sucursales` | — | `null` (bloqueo 5). |
| `publicaciones_gaceta` | Gaceta | `[{id, codigo, titulo, fecha}]`, sin `resumen`. |
| `ficha_publica` | — | `obtenida`, `no_publicada_412`, `no_descargada` (renovada pero bloqueo 2) o `no_publicada` (no renovada/cancelada: la API no la da). |
| `source_url`, `retrieved_at`, `raw` | — | `raw.listado` es la fila tal cual; `raw.ficha` la ficha ya limpia. |

## Datos personales

- Teléfonos y correos: nunca se escriben a disco (`scrub()` en `collect-details.mjs` los quita
  antes de guardar). Solo queda el sitio web.
- Unipersonales con domicilio declarado como vivienda: `domicilio_vivienda: true`, sin dirección ni
  coordenadas.
- Representantes, socios y beneficiarios: sus rutas piden sesión; no se pidieron.
- Gaceta: se descarta el `resumen` (nombra socios, números de cédula y domicilios).
- La razón social de una unipersonal suele ser el nombre de su dueño: es el registro público y se
  conserva, como en el resto del proyecto.

## Cómo se repite

```bash
mkdir -p /tmp/pw && (cd /tmp/pw && npm init -y && npm i playwright-core)   # sin descargar navegador
export PW_DIR=/tmp/pw            # CHROME_PATH opcional; por defecto el Chromium de ms-playwright
node scripts/run-all.mjs <out> 2 list,gaceta      # un solo Chromium, 2 hilos, se reanuda solo
node scripts/inspect-list.mjs <out>               # conteos del listado bajado
node scripts/build-delivery.mjs <out> <destino>   # NDJSON.gz partido, summary.json, manifest.json
```

- `collect-list.mjs`: 423 páginas de 1000 (`filtro=%20`). Guarda `list/p-NNNN.json.gz` crudas.
- `collect-gaceta.mjs`: 2.287 páginas de 100. Guarda `gaceta/g-NNNNN.json.gz` sin `resumen`.
- `collect-details.mjs`: la fase de fichas. Escrita y probada, **no corrida a escala** por el bloqueo 2.
- Retroceso exponencial (2 s → 120 s) ante 429, 5xx o error de red; freno de RAM (espera 60 s si
  quedan menos de 800 MB libres) porque corre en una laptop compartida.

## Cómo pedir lo que falta

El SEPREC es entidad pública bajo la Ley 1178 y el DS 28168 (acceso a la información). Lo que esta
entrega no pudo traer —NIT, domicilio y objeto social de las vigentes, fecha de inscripción, CAEB,
sucursales y capital— está en su base. La vía es una nota a la Dirección Ejecutiva del SEPREC
(`www.seprec.gob.bo/index.php/formulario-de-contacto/`) pidiendo la «base de unidades económicas
inscritas» sin datos de contacto personal, citando la publicación que ya hacen en la consulta de
empresas. Alternativa técnica, que necesita una decisión del usuario: recoger las fichas desde un
Chrome con ventana, que es como responden hoy.
