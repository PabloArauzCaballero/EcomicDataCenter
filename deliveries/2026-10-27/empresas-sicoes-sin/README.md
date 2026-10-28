# Empresas de Bolivia desde SICOES (RUPE) e Impuestos Nacionales (SIN)

Recolección del 27-oct-2026 para enriquecer y cruzar el registro del SEPREC. Dos fuentes con datos y una
(Ministerio de Trabajo) sin datos públicos. Todo se recogió sin sesión, sin resolver ni evadir captchas.

| Carpeta | Archivo | Filas | Con NIT | Con dirección | Con NIT y dirección |
|---|---|---:|---:|---:|---:|
| `sicoes_rupe/` | `sicoes_rupe_proveedores.ndjson.gz` | 100.569 | 74.872 (74,4 %) | 11.483 (11,4 %) | 11.483 (11,4 %) |
| `sin/` | `sin_listas_publicadas.ndjson.gz` | 743.326 | 743.326 (100 %) | 0 (0 %) | 0 (0 %) |
| (sin carpeta) | Ministerio de Trabajo | 0 | — | — | — |

`manifest.json` trae el sha256, el tamaño y las filas de cada archivo, más los conteos de cada fuente.
Los programas que produjeron los datos están en `_scripts/` (Python 3, `requests` y `pymupdf`).

## Formato común

Un objeto JSON por línea, en UTF-8 y comprimido con gzip. Campos en este orden:
`source`, `nit`, `matricula`, `razon_social`, `tipo`, `estado`, `actividad`, `departamento`, `municipio`,
`direccion`, `adjudicado_por_anio`, `source_url`, `source_date`, `retrieved_at` y `raw`.
Los campos que la fuente no publica van en `null`. Nada se infiere ni se rellena.

---

## 1. SICOES: Guía de Proveedores del RUPE (`sicoes_rupe/`)

### Endpoints

1. `GET https://www.sicoes.gob.bo/portal/index.php` devuelve la cookie `PHPSESSID` y un `token` oculto (`<input id="token">`).
2. `GET /portal/rupe/guiaProveedores.php?token=<token>` devuelve un token nuevo y el arreglo `#columnas`. Los nombres de
   columna se ofuscan en cada sesión, pero el orden es fijo: opciones, código RUPE, tipo de documento, número de documento,
   razón social, tipo de proveedor, país de origen, país, departamento y estado.
3. `POST /portal/rupe/operacion.php` con
   `operacion=guiaProveedores&selTipo=<tipo>&selUbiGeo=<depto 1-9>&draw=<página>&token=…&captcha=` devuelve
   `{recordsTotal, data:[…]}`. **No pide captcha.**
4. `POST /portal/rupe/operacion.php` con `operacion=getDatosRupe&rupe=<código>&token=…` devuelve la ficha pública: nombre comercial,
   departamento, provincia o ciudad, dirección, catálogo UNSPSC de rubros y sucursales. **No pide captcha.**

### Método

- El servidor ignora `start` y `length`: cada página trae 10 filas y se pide con `draw=N`. Sin filtros, cada página tarda unos 7 s.
  Por eso la lista se partió por tipo de proveedor y departamento, donde una página tarda entre 0,3 y 2 s.
- El orden del servidor no es estable. Por eso se deduplica por código RUPE y se compara con `recordsTotal` (ver «Cobertura»).
- La guía solo muestra proveedores **Activos**. Las personas jurídicas nacionales se identifican con NIT; las asociaciones
  accidentales y las extranjeras, no.
- Se recorrieron los tipos de persona jurídica y la asociación accidental: Empresa (2), Cooperativa (7), OECAS (6), APPS (5),
  Asociación civil sin fines de lucro (12), Entidad o empresa pública (9), Asociación accidental (4) y Persona jurídica
  extranjera (11). También se recorrió Persona natural extranjera (10).
- La ficha (`getDatosRupe`) se pidió para cada proveedor que no es persona natural, empezando por los que tienen NIT.
  `raw.detalle_consultado` dice si la fila trae la ficha.
- `actividad` reúne las primeras 15 descripciones UNSPSC del catálogo que el proveedor declaró. El catálogo completo, con sus
  códigos, va en `raw.catalogo_unspsc`.
- `matricula` va en `null` porque el RUPE no publica la matrícula de comercio. El código RUPE va en `raw.rupe`.
- La provincia o ciudad que da la ficha va en `raw.provincia_o_ciudad`. No se copia a `municipio` porque mezcla provincias y ciudades.

### Datos personales

- Personas naturales: solo se guardan NIT, tipo, estado, departamento y actividad. No se guarda el nombre, el documento de
  identidad, la dirección ni los contactos. Las que no tienen NIT (solo carnet) se excluyen.
- De la ficha **no** se guardan teléfono, fax, casilla ni correo, ni siquiera en `raw`, en ningún tipo de proveedor.
- Las empresas unipersonales se guardan como empresas, con nombre y dirección. El RUPE las registra como
  «Empresa-Persona Jurídica», con NIT, aunque la razón social sea el nombre de una persona. La dirección es la que el
  proveedor declaró al Estado; puede coincidir con su vivienda. Quien publique estos datos debería revisarlo.

### Cobertura

| Tipo (`selTipo`) | Declarados por el portal | Únicos obtenidos | Cobertura |
|---|---:|---:|---:|
| Empresa (2) | 74.635 | 72.643 | 97,3 % |
| Asociación civil sin fines de lucro (12) | 603 | 598 | 99,2 % |
| Entidad / empresa pública (9) | 167 | 167 | 100,0 % |
| Asociación accidental (4) | 25.795 | 25.697 | 99,6 % |
| Persona natural extranjera (10) | 725 | 714 | 98,5 % |
| Persona jurídica extranjera (11) | 1.117 | 1.112 | 99,6 % |
| Cooperativa (7) | 139 | 139 | 100,0 % |
| OECAS (6) | 87 | 87 | 100,0 % |
| APPS (5) | 127 | 126 | 99,2 % |
| **Total** | **103.395** | **101.283** | **98,0 %** |

- La diferencia (2,0 %) viene de que el portal no ordena de forma estable entre páginas: la misma consulta repite unos
  proveedores y omite otros. Para «Empresa» faltan unos 2.000. Otra pasada sobre las particiones grandes (La Paz, Santa Cruz y
  Cochabamba) los recuperaría en parte.
- 4 empresas no tienen departamento: el total declarado sin filtro (74.639) supera en 4 a la suma por departamento.
- **No se recorrieron las personas naturales nacionales** (`selTipo=1`, 267.844 registros). En las páginas que se vieron se
  identifican con carnet de identidad, que es un dato personal, y recorrerlas costaría unas 26.800 páginas. De las 714 personas
  naturales extranjeras obtenidas no se guarda ninguna, porque ninguna tiene NIT.
- Las asociaciones accidentales (consorcios para una licitación) no tienen NIT en el RUPE. El documento con que se registran va
  en `raw.numero_documento`.
- **Fichas consultadas (`getDatosRupe`): 11.483 de 100.569 filas.** La dirección y la actividad solo vienen en las filas con
  `raw.detalle_consultado = true`. El orden de consulta fue: primero los proveedores con NIT (empresas, cooperativas, OECAS, APPS,
  asociaciones civiles, entidades públicas), después las personas jurídicas extranjeras y al final las asociaciones accidentales.
  **Estado de la reanudación (corte del 27-oct, 22:15):** la consulta de fichas **quedó detenida** porque Claude Code cerró el proceso por falta de memoria en la laptop (no fue un fallo del portal ni del programa). Hay 11.483 fichas hechas y **89.086 pendientes**, sobre todo de empresas con NIT. La lista de pendientes, en orden de prioridad, está en `sicoes_rupe/fichas_pendientes.txt`. Para reanudar: `RUPE_TODO=sicoes_rupe/fichas_pendientes.txt python -P _scripts/sic_rupe_detail.py <dir_de_trabajo> 2`. Escribe `<dir_de_trabajo>/detail.jsonl`, una línea por ficha, sin teléfonos ni correos, que se une a este NDJSON por `raw.rupe`. A unas 430 fichas por minuto con 2 hilos, son unas 3,5 h.

### Adjudicaciones (`adjudicado_por_anio`)

**No se entregan montos adjudicados: `adjudicado_por_anio` va en `null` en todas las filas.** Motivo:

- El buscador de convocatorias (`POST /portal/contrataciones/operacion.php`, `operacion=convNacional`, `tipo=Avanzada`)
  **no pide captcha** y filtra por el NIT del adjudicado (`nroDocumento`) o por su nombre (`nombreAdjudicado`). Devuelve el
  CUCE, la entidad, la modalidad, el objeto, el estado («Adjudicado», «Contratado», «Desierto»…), la fecha de adjudicación
  (si se pide `fechaAdjudicacionDespliegue`) y el departamento. **No devuelve el monto.** Ejemplo: el NIT 191664025
  (MULTI-STOCK S.R.L.) tiene 52 procesos.
- El monto adjudicado o contratado solo aparece en la ficha del proceso (`/portal/contrataciones/ficha/fichaProceso.php`
  → `descargaFicha.php`) y en los formularios 170/200 (`/portal/contrataciones/verFormulario.php`). **Los dos piden
  Cloudflare Turnstile** (sitekeys `0x4AAAAAACHQnmr7z-aPbV4e` y `0x4AAAAAABjOuoSrQDMK9Yq2`). No se evadió.
- El filtro `montoDesde`/`montoHasta` del buscador permitiría acotar montos por tramos, pero haría falta una búsqueda por
  proveedor y tramo. A unos 4 s por consulta, con el límite de 2 hilos de esta corrida, eso es inviable para 100.000 proveedores.
- **Lo que sí se puede hacer en otra corrida, sin captcha:** contar los procesos adjudicados o contratados por año para cada
  NIT con la búsqueda avanzada, como señal de actividad. Son unos 100.000 NIT, al menos una consulta de unos 4 s por NIT,
  más páginas de 10 para los que tienen muchos procesos.

---

## 2. Impuestos Nacionales: listas publicadas (`sin/`)

### Qué hay

Una fila por NIT y documento. Si un NIT aparece en varias listas, aparece en varias filas. `raw.lista` dice de qué lista sale:

| `raw.lista` | Qué significa | Documentos (RND) | Filas |
|---|---|---|---:|
| `categorizacion` | El NIT fue categorizado como PRICO, GRACO o RESTO (`raw.categoria`, `raw.subcategoria`) | 102400000041 (2024), anexo I GRACO (sin número de RND en el PDF, publicado en 2025), 102200000011 (2022), 101800000003 (2018), 10-0009-16, 10-00011-15, 10-009-14, 10-0026-13, 10-0026-11, 10-0007-10 | 42.625 |
| `facturacion_modalidad` | Modalidad de facturación asignada por el SIN (electrónica en línea, computarizada en línea, portal web…), con `raw.modalidad`, `raw.administracion`, `raw.grupo` y `raw.fecha_inicio` | 102200000024, 102300000020, 102400000025, 102300000022, 102400000005, 102200000010, 102400000012, 102400000003, 102100000019, 102400000004, 102300000019, 102400000002, 101800000026, 101800000028 y 101900000003, más un anexo con razón social | 611.535 |
| `nit_observados` | El SIN publicó el NIT por emitir facturas sin transacción real o porque su domicilio fiscal no fue hallado | «nits-observados» (sep-2025) y «NOVIEMBRE-2025-NIT-OBSERVADOS» | 3.244 |
| `jurisdiccion` | El NIT fue asignado a una gerencia distrital | 10-0011-13 y anexo de 10-011-14 | 60.795 |
| `portal` | Obligado a declarar por el Portal Tributario | 10-0002-06, 10-0023-06, 10-0027-06, 10-0039-07 y 10-0031-12 | 25.127 |

NIT distintos en total: 349.657.

`sin/inventario_pdfs_sin.jsonl` trae una línea por cada PDF revisado (1.187). Cada línea tiene la URL, la fecha de subida,
las páginas, cuántos números con forma de NIT aparecen, las palabras clave halladas, el comienzo del texto y el sha256 del
PDF. Sirve para ver qué se miró y qué se descartó.

`departamento` se deduce de la gerencia o administración que el documento nombra (por ejemplo, «GRACO SANTA CRUZ» o
«GDLPZ I» dan La Paz). Va en `null` cuando el documento no la nombra. `razon_social` solo viene en el anexo de
facturación electrónica en línea (170 filas). Ninguna lista del SIN trae dirección ni actividad.

### Endpoints y método

- `GET https://www.impuestos.gob.bo/index.php/wp-json/wp/v2/media?per_page=100&page=N` es la API pública de WordPress de la
  biblioteca de medios: 4.703 archivos, de ellos 3.155 PDF. Se descargaron 1.187 PDF cuyo nombre sugiere una norma, un anexo
  o una lista, y se midió cuántos números con forma de NIT trae cada uno.
- Cada documento útil se leyó con `pymupdf`:
  - Facturación: lectura fila por fila de las celdas NIT, administración, modalidad y fecha/grupo.
  - Categorización y jurisdicción: los NIT están en columnas sin rótulo de fila. A cada NIT se le asigna el encabezado más
    cercano de su columna por coordenadas, por ejemplo «GRACO LA PAZ» o «ANEXO II GRACOS». **Es una heurística:**
    `raw.gerencia_o_encabezado` guarda el encabezado usado para poder revisarla. En la RND de 2018, 6 NIT quedaron como
    «PRICO B», cuando PRICO no tiene subcategoría; probablemente son GRACO.
  - Se descartan los números de la propia RND (patrón `10` + 10 u 11 dígitos), que no son NIT.
- `source_date` es la fecha en que el SIN subió el PDF a su web. La fecha de la norma va en el propio documento.
- `raw.sha256_pdf` permite verificar el PDF de origen.

### Lo que se pidió y no existe abierto

- **Consulta individual de NIT o padrón** (estado, razón social, actividad, domicilio fiscal): el SIAT
  (`siat.impuestos.gob.bo`, aplicación Angular) pide captcha («Captcha requerido», `validarCaptcha`,
  `rncCaptchaEncriptionKey`) o una sesión. La «Consulta pública» de la Oficina Virtual
  (`ov.impuestos.gob.bo/Paginas/Publico/ConsultasPublicas.aspx`) solo valida documentos con un código de certificación.
  El servicio `verificarNit` de facturación electrónica exige token y CUIS de un sistema registrado. Por eso **no hay
  domicilio fiscal ni actividad desde el SIN.** No se intentó evadir el captcha.
- **NIT cancelados**: no hay lista publicada. Lo más cercano son los «NIT observados», incluidos arriba.
- **Agentes de retención**: no hay lista con NIT. Los PDF «RC-IVA agentes de retención» y «Retenciones» son material de capacitación.
- **PRICO/GRACO vigente 2025-2026**: la RND más reciente con lista es la 102400000041 (2024, 500 NIT) y el anexo I GRACO
  publicado en 2025. No se encontró una lista completa posterior.
- Hay listas de deudores («NIT con títulos de ejecución tributaria», «NIT con observaciones COF») que **no se recogieron**:
  no se pidieron y son señal de cobranza, no de registro.
- Las RND 10-0017-04 y 10-0047-05 (libro de compras y ventas) se descartaron porque usan números RUC anteriores al NIT. La
  10-0023-10 se descartó porque su primera página es una imagen y no se pudo saber qué lista era.

---

## 3. Ministerio de Trabajo: registro de empleadores (ROE)

Sin datos. La Oficina Virtual de Trámites (`ovt.mintrabajo.gob.bo`, aplicación AngularJS) atiende el ROE solo con inicio de
sesión del empleador (`#/loginRoe`, `/ws/login/`). El único servicio llamado «público» del código,
`servicios_publicos/consulta_empresas/<nit>`, se usa dentro del módulo autenticado de consulta laboral. No hay padrón ni
buscador abierto de empleadores. No se intentó entrar.

---

## Bloqueos (resumen)

| Fuente | Bloqueo | Efecto |
|---|---|---|
| SICOES, ficha del proceso (`fichaProceso.php` → `descargaFicha.php`) | Cloudflare Turnstile | Sin montos adjudicados por proceso |
| SICOES, formularios (`verFormulario.php`, FORM 100/170/200) | Cloudflare Turnstile (`verificacaptchacloud=SI`) | Sin monto del contrato |
| SICOES, documentos del proceso (`descargarArchivo`) | Cloudflare Turnstile | — |
| SICOES, RUPE de personas naturales nacionales (267.844) | No hay bloqueo: se excluyeron a propósito porque casi todas se identifican con carnet y son datos personales | — |
| SIN, consulta de NIT o padrón | Captcha o sesión | Sin domicilio fiscal ni actividad |
| Ministerio de Trabajo, ROE | Sesión de empleador | Sin datos |
