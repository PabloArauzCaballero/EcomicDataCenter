# Bases masivas de empresas de Bolivia (alternativas y complementos al SEPREC)

Entrega del 27-oct-2026. Busca **listados empresa por empresa ya publicados en bloque** (no la consulta
uno-a-uno del SEPREC, que la trabaja otro agente). Cada fuente va en su carpeta como NDJSON comprimido
con gzip, con este esquema fijo:

`source, matricula, nit, razon_social, tipo_societario, estado, fecha_inscripcion, actividad,
departamento, municipio, direccion, source_url, source_date, retrieved_at, raw`

Los hashes sha256, el conteo de filas y el porcentaje de llenado de cada campo están en `manifest.json`.
Los colectores y normalizadores están en `_scripts/` (Python 3; los PDF se leen con `pdfplumber` por
coordenadas de palabra, porque `pdftotext -layout` desalinea los listados a varias columnas).

## La conclusión en una línea

**No existe una base completa del Registro de Comercio descargable en bloque.** Lo más grande que se
publicó empresa por empresa son los **listados de empresas depuradas de Fundempresa (2019-2021)**:
37.234 filas y 35.373 matrículas distintas, con matrícula y razón social, rescatados de Wayback Machine
porque fundempresa.org.bo ya es un dominio aparcado. Son empresas que **dejaron de actualizar** la
matrícula, así que sirven como base de bajas y de matrículas históricas, no como padrón de vigentes.
Para empresas vigentes con NIT, las únicas bases abiertas son chicas y sectoriales (APS, ASFI, Aduana, GLEIF).

## Fuentes entregadas

| carpeta | fuente | fecha del dato | filas | campos útiles | licencia / condición |
|---|---|---|---:|---|---|
| `fundempresa-depuradas` | Fundempresa, 4 listados de empresas depuradas (cierres 31-mar-2019, 30-sep-2019, 31-dic-2020, 31-mar-2021), vía Wayback | 2019-09 a 2021-09 | 37.234 (35.373 matrículas únicas) | matrícula, razón social, tipo societario inferido del nombre | publicación oficial del Registro de Comercio (RM MDPyEP 050/2021 obliga a publicarla); sin licencia explícita |
| `fundempresa-no-encontradas` | Fundempresa, 7.º listado 2018 y 2.º listado 2019 de empresas no encontradas en la verificación de domicilio | 2018-09, 2019-10 | 454 | matrícula, razón social | ídem |
| `asfi` | ASFI: entidades con licencia (servicios financieros complementarios y de intermediación), en constitución, adecuación, disolución, liquidación, intervención y quiebra | 2026-08-31 / 2026-10-09 | 386 | razón social, categoría, ciudad de la oficina central, sigla ASFI | información pública del regulador |
| `aps-rms` | APS, Registro del Mercado de Seguros (API pública `api.aps.gob.bo/aps.web/rms`), solo personas jurídicas bolivianas | 2026-10-27 | 140 | **NIT, matrícula, razón social**, actividad, departamento, ciudad, domicilio legal, fecha de constitución | información pública del regulador |
| `bbv` | Bolsa Boliviana de Valores, participantes del mercado (emisores y otros) | ver `raw.informacion_al` | BBV_ROWS | razón social, sector, oficina central, dirección, objeto | sitio de la BBV |
| `aduana-oea` | Aduana Nacional, empresas certificadas como Operador Económico Autorizado | 2026-08-05 | 62 | **NIT**, razón social, tipo de operador, estado del certificado | información pública |
| `aduana-prio` | Aduana Nacional, Principales Operadores de Comercio Exterior (PRIO) | 2026-02-09 | 177 | **solo NIT** (la lista oficial no trae nombres); 26 con nombre por cruce con OEA, APS y GLEIF | información pública |
| `gleif` | GLEIF, registros LEI con domicilio legal en Bolivia (API, golden copy del día) | 2026-10-27 | 54 | matrícula/NIT (`registeredAs`), razón social, forma jurídica, estado, dirección | CC0 |
| `wikidata` | Wikidata, ítems de empresa (subclases de Q4830453) con país Bolivia | 2026-10-27 | 445 | razón social, fundación, industria, forma jurídica, sede | CC0 |
| `datos-gob-bo` | datos.gob.bo, «Puntos de Venta Doble Aguinaldo» (AGETIC) | 2019-12-06 | 2.840 puntos de venta (unos 1.016 nombres distintos) | nombre, rubro, departamento, dirección (solo personas jurídicas) | CC-BY |

**La mejor base empresa por empresa:** `fundempresa-depuradas` por volumen. Para empresas vigentes con
NIT y matrícula juntos, la mejor es `aps-rms`, que es chica pero completa.

## Cómo leer cada fuente (trampas)

- **Fundempresa depuradas.** La lista de diciembre de 2020 (separata, 22.842 filas) es la más grande.
  Las cuatro listas se solapan poco: 37.234 filas son 35.373 matrículas. Las matrículas tienen el formato
  antiguo de 8 dígitos (`00xxxxxx`), anterior a la unificación con el NIT. Las páginas del PDF de
  marzo de 2021 repiten la última columna de la página anterior: el parser deduplica por matrícula.
  El `tipo_societario` se **infiere del sufijo** del nombre (S.R.L., S.A., LTDA…). Si no hay sufijo se
  deja nulo y `raw.probable_unipersonal = true`: la mayoría son empresas unipersonales, con el nombre de
  una persona como razón social. Estas listas no traen dirección, NIT ni actividad.
- **Fundempresa no encontradas.** Hubo al menos 11 listados en 2018 y 2 en 2019. Wayback solo guarda
  como PDF el 7.º de 2018 y el 2.º de 2019; el resto quedó capturado como página del dominio aparcado.
  Al PDF de 2019 se le quitó la página de direcciones de oficinas: tenía números de teléfono de 7
  dígitos que parecían matrículas.
- **Wayback.** El PDF de marzo de 2019 tiene una captura truncada en 1 MiB (2019-10-20). Se usó la de
  2020-12-20, que está completa. `wb.py` rechaza los PDF sin `%%EOF`.
- **ASFI.** En el listado general de intermediación financiera los bancos aparecen sin la palabra
  «Banco» («Nacional de Bolivia S.A.»): se antepone según la categoría y el nombre tal cual va en
  `raw.nombre_en_lista`. `departamento` sale de la ciudad de la oficina central.
  `raw.departamentos_con_cobertura` cuenta las marcas «x» de cobertura. Unas pocas filas de los PDF
  de constitución y adecuación tenían la ciudad partida en dos líneas: se corrigieron con heurística.
- **APS.** El RMS mezcla personas naturales y jurídicas incluso dentro de los tipos «Persona Jurídica».
  Se excluyeron los tipos de persona natural y las 126 reaseguradoras y corredoras **extranjeras**.
  A las filas con tipo «Persona Natural» o «unipersonal» se les quitó la dirección
  (`raw.direccion_omitida`). En ninguna fila se guardan teléfono, fax, correo ni representante legal.
- **BBV.** Se excluyeron los patrimonios autónomos de titularización, que no son empresas.
- **GLEIF.** Para Bolivia, `registeredAs` es a veces la matrícula antigua (`00012797`) y a veces el NIT
  (`1020229024`). Si tiene 9 o más dígitos y no empieza con `00`, se copia también a `nit`
  (heurística anotada en `raw.nit_heuristica`).
- **Wikidata.** `fecha_inscripcion` es en realidad la fecha de fundación (P571), no la de inscripción en
  el registro. `raw.fecha_es_fundacion_no_inscripcion = true`.
- **datos.gob.bo.** Cada fila es un **punto de venta**, no una empresa: una misma empresa se repite
  (Manufactura Boliviana S.A. aparece 114 veces). Muchos «puntos de venta» son personas. Si el nombre no tiene forma societaria ni
  dice EMPRESA, ESTATAL, MINISTERIO o INSTITUTO, se omiten la dirección y las coordenadas (pueden ser
  una vivienda): 1.724 de 2.840 filas, marcadas en `raw.direccion_omitida`.

## Datos personales

No se guardan teléfonos, faxes, correos ni nombres de representantes legales. Las direcciones solo se
guardan para personas jurídicas. Las razones sociales que son nombres de personas (empresas
unipersonales) se conservan porque son el nombre público de la empresa en el registro. Van marcadas
con `raw.probable_unipersonal` en Fundempresa, con `tipo_societario` en APS y con
`raw.direccion_omitida` en datos.gob.bo.

## Lo que se buscó y NO existe (o no es descargable)

| fuente | resultado |
|---|---|
| **datos.gob.bo** | El catálogo CKAN completo son 43 conjuntos. Ninguno es de base empresarial, matrícula ni padrón; el único con empresas es «Puntos de Venta Doble Aguinaldo». |
| **Fundempresa «Base Empresarial Vigente»** | Solo hubo reportes **agregados** (`RESUMEN_BE_*_miemp.xlsx/pdf` en miempresa.gob.bo, `*bev*.pdf` y reportes estadísticos mensuales). El Directorio Empresarial (`/directorio/ver-mas.php`, más de 40.000 fichas paginadas) era consulta dinámica: Wayback guarda unas 16 fichas sueltas. fundempresa.org.bo es hoy un dominio aparcado. |
| **SEPREC (seprec.gob.bo)** | Wayback (11.698 URL) solo tiene boletines e «Información estadística» agregada (`Informacion-ESTADISTICA-WEB-*.pdf`). No hay listados de empresas ni de canceladas. |
| **Gaceta Oficial / Gaceta Electrónica del Registro de Comercio** | La Gaceta Oficial publica normas, no constituciones de sociedades. La Gaceta Electrónica del Registro de Comercio (miempresa.gob.bo) era consulta en línea: no hay descarga en bloque en Wayback. |
| **OpenCorporates** | Tiene unas 194.000 empresas bolivianas (cargadas en 2017 desde Fundempresa), pero la API exige token (401 sin él) y la descarga en bloque es bajo licencia o pedido. No se descargó. |
| **OpenSanctions** | 849 entidades con país `bo`, casi todas personas (PEP y sancionados). Licencia CC BY-NC, incompatible con el plan de monetización. No se descargó. |
| **GLEIF** | Descargado completo: solo 54 entidades con domicilio legal en Bolivia. La API no admite filtrar por país de la sede. |
| **SIN (Impuestos)** | Las RND de PRICO y GRACO (p. ej. RND 102400000041) publican **solo NIT**, sin razón social, y como *cambios* de categoría, no el padrón completo. No se incluyó. |
| **SENAVEX / RUEX** | `directorio.senavex.gob.bo` existe, pero devuelve «no se encontraron empresas» sin sesión. El RUEX no es público (974 registros en 2020, según la rendición de cuentas). |
| **PROMUEVE, AEMP** | Los dominios no resuelven por DNS (27-oct-2026). |
| **Ministerio de Desarrollo Productivo / SIIP** | Ya medido: solo agregados (cifra 2025 falsa). `www.produccion.gob.bo` tiene un certificado inválido para el nombre www. |
| **Ministerio de Trabajo, ROE** | El registro de empleadores se hace en la OVT con usuario. Solo hay boletines estadísticos agregados (p. ej. `boletin-estadistico-roe-2020.pdf`). No hay listado público. |
| **Aduana, Registro OCE (padrón de operadores)** | `portal.aduana.gob.bo/infosuma/operadores.php` no resuelve por DNS. Solo están las listas OEA y PRIO. |
| **ASFI, Registro del Mercado de Valores** | La página «Entidades inscritas en el RMV» no tiene contenido estático. Los emisores salen de la BBV. |
