# SEPREC — registro de comercio, unidad por unidad (27-oct-2026)

Entrega del recolector del **Servicio Plurinacional de Registro de Comercio (SEPREC)**, sucesor de
FUNDEMPRESA desde abril de 2022. Una fila por unidad económica inscrita, sacada de la API pública
que usa el portal `miempresa.seprec.gob.bo` («Consulta de empresas»), sin sesión, sin token y sin
captcha.

<!-- ESTADO -->
## Estado de esta entrega (PARCIAL, se reanuda)

- **Listado: 391 de 423 páginas → 390.996 unidades** de las 422.530 que declara la API (92,5 %).
  Faltan las páginas **392 a 423** del orden alfabético por razón social: las razones sociales
  desde «T…» (la última guardada termina en «TEXTILES RIELYS») hasta la «Z». La corrida se cortó
  dos veces porque la laptop se quedó sin RAM (Claude Code mata los procesos en segundo plano bajo
  presión de memoria); no se relanzó una tercera vez.
- **Frente al 398.131 del SEPREC (nov-2025):** esa cifra cuenta unidades no canceladas, renovadas o
  no. Aquí hay **377.380 con `estado_registro` ACTIVO (94,8 % de esa referencia)**; de ellas
  104.978 con matrícula renovada (`vigente`) y 272.402 sin renovar (`no_actualizada`).
- **Paginación:** el orden es por razón social con desempates inestables; en 391.000 filas leídas
  hubo 4 repetidas, así que unas 4 unidades se perdieron entre páginas. Se dedupe por `id`.
- **Gaceta: 8 de 2.287 páginas** (799 publicaciones): prácticamente sin empezar; por eso
  `fecha_constitucion_gaceta` y `publicaciones_gaceta` casi siempre van `null`.
- **Fichas: 0.** Bloqueadas (ver «Bloqueos», punto 2): NIT, municipio, dirección y actividad vacíos.

### Conteos (390.996 unidades)

| Departamento | Unidades | | Tipo societario | Unidades |
| --- | ---: | --- | --- | ---: |
| La Paz | 120.375 | | Empresa unipersonal | 300.499 |
| Santa Cruz | 116.420 | | Sociedad de responsabilidad limitada | 85.177 |
| Cochabamba | 65.553 | | Sociedad anónima | 4.188 |
| Tarija | 19.044 | | Sociedad constituida en el extranjero | 968 |
| Oruro | 18.523 | | Sociedad colectiva | 113 |
| Potosí | 18.323 | | Sociedad en comandita simple | 28 |
| Chuquisaca | 16.057 | | Sociedad anónima mixta | 14 |
| Beni | 12.381 | | Entidad financiera de vivienda | 4 |
| Pando | 4.315 | | Sociedad en comandita por acciones | 4 |
| Sin dato | 5 | | Empresa pública departamental mixta | 1 |

| Estado | Unidades |
| --- | ---: |
| `no_actualizada` (ACTIVO, matrícula no renovada) | 272.402 |
| `vigente` (ACTIVO, matrícula renovada) | 104.978 |
| `cancelada` | 12.418 |
| `creado` | 965 |
| `inactivo` | 227 |
| `eliminado` | 4 |
| `anulado` | 2 |

El cruce estado × departamento y tipo × estado está en `summary.json`. Como faltan las razones
sociales de la T a la Z, los repartos son de esta parte, no del registro entero.

### Cómo reanudar

```bash
export PW_DIR=<carpeta con playwright-core>
# <out> es la carpeta de trabajo con list/ y gaceta/; las páginas ya guardadas se saltan.
node scripts/run-all.mjs <out> 2 list,gaceta
node scripts/build-delivery.mjs <out> deliveries/2026-10-27/seprec
```

Las páginas crudas ya bajadas (`list/p-0001…p-0391.json.gz`, unos 15 MB) no van en la rama:
quedaron en la carpeta de trabajo de la sesión (scratchpad, `seprec/out/`). Si se pierden,
`run-all.mjs` las vuelve a pedir; el listado entero son 423 peticiones de unos 3 s. Para completar
solo lo que falta basta con correr la fase `list` sobre una carpeta que ya tenga las 391 páginas:
pedirá las 32 restantes. Las páginas del final dependen del orden alfabético del día en que se
pidan; reconstruir la carpeta entera de una vez evita que una inscripción nueva corra las páginas.

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
| `publicaciones` (Gaceta Electrónica de Comercio) | POST JSON | ninguna | Índice de la Gaceta: `id`, `codigo`, `titulo` del acto, `resumen`, `fechaPublicacion`, `empresa.{matricula, matriculaAnterior, razonSocial}`. `limite` ≤ 100. 228.671 publicaciones, de 2017 a hoy. |
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
