# Lugares de Bolivia: geoportales del Estado, municipios y Wikidata (2026-10-27)

Entrega del carril **geoportales** (uno de 12 agentes). Fecha de recolección: 27-oct-2026, entre las 22:40 y las 23:20 UTC.
Formato común: NDJSON con gzip, una fila por lugar y los campos `source, source_id, name, category_raw, address,
locality, municipality, department, lat, lon, phone, website, hours, source_updated_at, source_url, retrieved_at, raw`.
Todas las coordenadas están en WGS84 (EPSG:4326). Las capas del GAMLP vienen en UTM 19S (EPSG:32719) y se reproyectaron
en el servidor con `srsName=EPSG:4326`. El orden de ejes se comprobó contra las columnas `latitud`/`longitud` de la capa
`sit:entidadesfinancieras`. `manifest.json` lista cada archivo con su sha256, sus bytes y sus filas.

## Resumen

| Fuente | Carpeta | Filas | Licencia |
|---|---|---:|---|
| GAMLP, GeoServer del SIT (La Paz) | `gamlp-sit-la-paz/` (88 capas) | 208.757 | Servicio público del GAMLP: `Fees=NONE` y `AccessConstraints=NONE` en GetCapabilities. No declara licencia; hay que citar «GAMLP – SIT». |
| Wikidata (SPARQL) | `wikidata/` | 15.994 | CC0 1.0 |
| datos.gob.bo (CKAN de AGETIC) | `datos-gob-bo/` (2 conjuntos) | 18.589 | educativos: CC BY-SA; puntos de venta: CC BY |
| GAMSCS, Guía Urbana (Santa Cruz de la Sierra) | `gamscs-guia-urbana-santa-cruz/` | 5.105 | No declara licencia. Es la API pública de la Guía Urbana del GAMSCS. |
| GAMC, Mapa Interactivo de Planificación (Cochabamba) | `gamc-planificacion-cochabamba/` | 877 | No declara licencia. Es la API pública de la Dirección de Planificación. |
| **Total** | | **249.322** | |

Aparte quedan `wikidata/wikidata-descartes-fuera-de-bolivia.ndjson.gz`, con 53 ítems que tienen P17=Bolivia pero
coordenadas fuera del país (embajadas, por ejemplo). No suman al total.

**Ojo con La Paz.** De sus 208.757 filas, 132.309 son **números de puerta** (`sit:numeropuertas`): son puntos de dirección
(vía + número + zona + código catastral), no lugares. Sirven para geocodificar direcciones de las otras fuentes.
Otras 31.879 son **puestos de venta en vía pública** (`sigae:puestosventa`), que solo traen códigos, sin nombre.
Lugares con nombre en La Paz: 36.609.

## Registros de licencias de funcionamiento o actividades económicas municipales

Lo que hay abierto y se descargó:

1. **GAMLP `sit:restaurantes` (2.747)**: sale del registro de actividades económicas. Trae razón social, actividad
   declarada, grupo CIIU municipal («ACTIVIDADES DE EXPENDIO DE COMIDAS…»), dirección (calle, entre calles, edificio),
   teléfono, distrito, coordenada y fecha de actualización (`fechaActual`, 2023). Es lo más cercano a un padrón de
   licencias que se publica con coordenadas.
2. **GAMLP `sigae:puestosventa` (31.879) y `sigae:puestosbebida` (96)**: SIGAE es el sistema de actividades económicas.
   Son las autorizaciones de puestos de venta en vía pública y de venta de bebidas alcohólicas, con código de puesto
   (`dbpstocodi`) y código de propietario (`dbpropcodi`), pero **sin nombre ni rubro**.
3. **GAMLP `sit:actividadesEconomicasEBA` (105)**: actividades económicas con denominación, actividad desarrollada,
   estado, dirección y coordenada. Se quitó el campo `nit_ci` porque puede ser el CI de una persona.
4. **GAMLP `lapaz:locales_expendio` (269)**: locales de expendio de bebidas alcohólicas, solo con código de establecimiento.
5. **GAMLP `sit:publicidadurbana` (305)**: licencias de publicidad corporativa, con contribuyente, NIT, ubicación y
   vigencia (`inicio`/`fin`). Se quitaron `CI` y `exp`. 157 filas no traen geometría en el servidor.
6. **GAMLP `sit:hoteleshostales`, `lpm:hospedajes`, `lpm:empresasturismo`, `sit:farmacias_smde`, `sit:entidadesfinancieras`,
   `sit:supermercados`, `sit:mercados`**: padrones sectoriales, con nombre, dirección y a veces teléfono o web.

Lo que **no** está abierto:

- **El Alto (GAMEA)**: `geoserver.elalto.gob.bo` responde, pero solo publica las capas de demostración de GeoServer
  (Manhattan, Tasmania…) y tres capas de prueba `tukuy:*`. El inventario está en `inventarios/`.
  `app.elalto.gob.bo` pide inicio de sesión.
- **Santa Cruz (GAMSCS)**: no encontré padrón de licencias. `sat.gmsantacruz.gob.bo` no responde y `egob.gmsantacruz.gob.bo`
  solo ofrece consultas por trámite. La Guía Urbana sí trae comercio georreferenciado: tiendas de barrio (857),
  supermercados, micromercados, mercados, farmacias (323), clínicas, consultorios y librerías.
- **Cochabamba (GAMC)**: `atm.cochabamba.bo` (SIMAT) y `app.cochabamba.bo` son sistemas de trámite con credenciales.
  El mapa interactivo de Planificación solo publica salud, educación, plazas y parques.
- **Sucre**: `patentes.sucre.bo` tiene un certificado TLS que no corresponde al dominio y no se forzó. La «consulta de
  actividades» de `sucre.bo` es una consulta individual de deuda tributaria.
- **Tarija**: `sit.tarija.bolivia.bo/geoserver` no publica ninguna capa en WFS ni en WMS. El SIT Catastro es una app sin
  datos abiertos. `consultas.tarija.bolivia.bo` pide PIN. `catastro-tarija.bo` ya no resuelve en DNS.

## 1. GeoBolivia (geo.gob.bo): no disponible

Al 27-oct-2026 `geo.gob.bo` **no resuelve**. Su servidor de nombres autoritativo (200.87.148.76) no contesta. Google DNS
devuelve `SERVFAIL` con «Name servers did not respond» y Cloudflare devuelve `EDE 22: No Reachable Authority`. Por eso no
se pudo pedir ni `/geoserver/ows?…GetCapabilities` ni `/api/v2/datasets`. En la Wayback Machine no hay capturas de un
GetCapabilities completo. Solo hay endpoints por workspace de 2019 (`aasana`, `abc`, `abt`, `ac`, `adsib`…) y la portada
de la API v2 de 2025, lo que no basta para armar el inventario de capas. **Hay que reintentarlo cuando vuelva el DNS**:
`scripts/wfs_inventory.py https://geo.gob.bo/geoserver/ows inventario.json --hits` y después `scripts/wfs_download.py`.

Otros nodos nacionales revisados:

- **GeoSINAGER** (Defensa Civil, GeoNode): `api/v2/datasets` da `total: 0` y el WFS no expone capas.
- **GeoNode IIGEO-UMSA**: 56 datasets, casi todos fotos aéreas, ortofotos, áreas protegidas y vegetación.
  No hay puntos de interés. El inventario está en `inventarios/`.
- **geonode.fonadin.gob.bo**: no resuelve en DNS.

## 2. GAMLP, GeoServer del SIT (`https://sitservicios.lapaz.bo/geoserver/ows`)

El inventario completo de las **311 capas**, con título, geometría, CRS, features en el servidor, estado y motivo, está en
`inventarios/gamlp-sit-la-paz-capas.csv` (con los campos de cada capa en `.json`). De ellas:

- **88 descargadas**: todas las capas de puntos con nombre o con valor como lugar, más 6 de polígonos convertidos a
  centroide (`lapaz:areasequipamiento`, `lapaz:espaciospublicos`, `culturas:inmueblesSISPAC`,
  `Educacion:vwInfraestructuraUE`, `sigae:puestosventa`, `sigae:puestosbebida`). En las 88 el número de filas coincide
  con el `numberMatched` del servidor.
- **31 descartadas**: puntos que no son lugares (luminarias, sumideros, puntos topográficos, contenedores, cámaras,
  semáforos), trámites con datos de personas (`territorio:tramitesTerritorio`) y **mora tributaria por inmueble**
  (`geosit:mora_atm*`, dato sensible). También `lapaz:lugares`, que duplica `sit:toponimia` y además el servidor la
  entrega con el JSON roto.
- **192 sin descargar**: polígonos y líneas que no son puntos de interés (lotes, LUSU, redes de agua y alcantarillado,
  riesgos, distritos…).

Cómo se normalizó:

- `municipality` vale «La Paz» solo si el punto cae dentro del polígono `lapaz:jurisdiccion`. Si no, queda nulo; varias
  capas, como `sit:sedes_establsalud`, cubren todo el departamento. `raw.in_municipality_polygon` lo indica.
- `department` vale «La Paz» en todas las filas.
- `source_updated_at` se toma de `fechaActual` cuando existe.
- `source_url` es la URL WFS que devuelve exactamente ese feature (`featureID=`).
- En `raw.properties` no se publican `CI`, `exp`, `nit_ci`, `usuario`, `owner` ni `email`.

| Capa | Título | Filas | Con nombre | Dentro del municipio |
|---|---|---:|---:|---:|
| `sit:numeropuertas` | Número de puertas (puntos de dirección) | 132.309 | 0 | 132.309 |
| `sigae:puestosventa` | Puestos de venta en vías públicas | 31.879 | 0 | 31.861 |
| `sit:toponimia2` | Toponimia | 9.242 | 8.010 | 9.233 |
| `sit:toponimia` | Toponimia | 8.023 | 8.023 | 7.933 |
| `lapaz:areasequipamiento` | Áreas de equipamiento (centroides) | 6.054 | 1.525 | 5.855 |
| `sit:edificios` | Edificios | 4.123 | 4.123 | 4.123 |
| `sit:restaurantes` | Restaurantes (actividades económicas) | 2.747 | 2.745 | 2.661 |
| `movilidad:paradas` | Paradas 2019 | 921 | 0 | 921 |
| `Educacion:vwInfraestructuraUE` | Infraestructura de unidades educativas | 851 | 838 | 851 |
| `sit:plazasparques` | Plazas y parques | 807 | 807 | 807 |
| `sit:sedes_establsalud` | Establecimientos de salud SEDES (todo el departamento) | 792 | 792 | 147 |
| `sit:entidadesfinancieras` | Entidades financieras (agencias y cajeros) | 779 | 779 | 779 |
| `sit:cajeros_atm` | Cajeros automáticos | 715 | 715 | 688 |
| `sit:paradaspumakatari2021` | Paradas PumaKatari 2021 | 635 | 635 | 635 |
| `sit:farmacias_smde` | Farmacias SMDE | 594 | 594 | 594 |
| `sit:camposdeportivos` | Campos deportivos | 492 | 492 | 492 |
| `sit:plazasparques_sit` | Plazas y parques SITv2 | 441 | 441 | 441 |
| `lpm:restaurantes` | Restaurantes (guía turística) | 427 | 427 | 379 |
| `sit:paradaspumakatari` | Paradas PumaKatari | 423 | 0 | 423 |
| `sit:educacion_smecc` | Educación pública (SMECC) | 379 | 379 | 376 |
| `sit:publicidadurbana` | Publicidad urbana corporativa | 305 | 305 | 148 |
| `lapaz:locales_expendio` | Locales de expendio de bebidas alcohólicas | 269 | 0 | 269 |
| `sit:hoteleshostales` | Hoteles y hostales | 258 | 258 | 258 |
| `lpm:empresasturismo` | Empresas de turismo | 238 | 236 | 235 |
| … 64 capas más, de 1 a 228 filas | ver `inventarios/gamlp-sit-la-paz-capas.csv` | | | |

## 3. Wikidata (`https://query.wikidata.org/sparql`)

El universo son los ítems con P625 y P17=Q750, o con P131+ hasta Q750: 15.884. Se sumaron 110 ítems **sin país** cuya
coordenada cae en la caja de Bolivia; llevan `raw.match = "bbox_sin_pais"` y conviene revisarlos, porque algunos pueden
estar en un país vecino. Por ítem se trae: etiqueta es/en, descripción, P31 con etiqueta, P6375/P969/P669+P670 para la
dirección, P856 (web), P1329 (teléfono), P571 y P1619 (fechas), P131, P281, P1448, P127, P137, P238/P239 (IATA/ICAO),
P1435, P18 y P373. Municipio y departamento se obtienen subiendo por P131 hasta un ítem que sea instancia de
«municipio de Bolivia» (Q1062710) o de «departamento de Bolivia» (Q250050). `source_updated_at` es el `schema:dateModified`
del ítem.

Cobertura: departamento en 14.154 filas, municipio en 1.162, dirección en 116, web en 195 y teléfono en 83. Casi todo son
lugares naturales y asentamientos: montañas (4.182), ríos (3.799), localidades, llanuras, lagos, bienes culturales
(507), municipios, aeropuertos (149) y minas (116). Para comercios, Wikidata aporta poco.

## 4. datos.gob.bo (CKAN, 43 conjuntos)

El catálogo completo está en `inventarios/datos-gob-bo-catalogo.json`. Se bajaron los dos únicos conjuntos con
establecimientos y coordenadas:

- `estab`: **establecimientos educativos 2016** del Ministerio de Educación. 15.749 filas, con código SIE, unidad
  educativa, dirección, zona, departamento y coordenada. Su campo `distrito` es el distrito educativo, no el municipio,
  y por eso queda en `raw`.
- `puntos-de-venta-doble-aguinaldo`: **2.840 comercios** de 2019, con empresa, sucursal, dirección, rubro, productos
  y coordenada.

Se descartaron `localidades-con-fibra-optica-2020` (221) y `localidades-con-kioscos-electronicos` (200) porque son
localidades sin coordenadas. El resto del catálogo son estadísticas sin ubicación puntual.

## 5. GAMSCS, Guía Urbana (`https://guiaurbana.gmsantacruz.gob.bo/guiaurbana/public/api/<grupo>/<código>`)

Son 66 capas de equipamiento urbano. La lista sale de cruzar las llamadas AJAX de `public/js/inicio.min.js` con los
`<input>` de la página y está en `inventarios/gamscs-guia-urbana-capas.tsv`. Cada fila trae nombre, nivel o tipo,
administración, distrito, UV, manzana, barrio, dirección y x/y en WGS84. Se quitaron 44 filas repetidas entre capas,
porque la API filtra por prefijo y «80» también devuelve «80.1». Una capa (`saludMunicipal/NORTE`) da 404 y la de
ciclovías no tiene código. Las capas de distritos y límites son polígonos y no se bajaron.

## 6. GAMC, Mapa Interactivo de Planificación (`https://planificacionapi.cochabamba.bo/api/v1/site/list/?category_id=N`)

El árbol de categorías está en `inventarios/gamc-planificacion-categorias.tsv`. Se bajaron las hojas con puntos: centros
de salud por nivel (152 a 155), centros educativos (156), centros conectados a la red (158 y 161), plazas (164) y
parques (165). Se descartaron las líneas de cableado (287) y los predios sin nombre de la categoría 154. Las categorías
«mapa completo» de las comunas, unos 178 MB, y la zonificación de usos sectoriales (168, 33 MB) son polígonos de
ordenamiento y no se bajaron. Ojo: en la categoría 161 hay nodos de red con nombres técnicos.

## Reproducir

Los scripts están en `scripts/`. Se corren con `python -I` y solo usan la biblioteca estándar.

- `wikidata_lugares.py` y `wd_filter.py`: Wikidata.
- `wfs_inventory.py`, `select_layers.py`, `wfs_download.py` y `normalize_wfs.py`: cualquier GeoServer. La descarga va
  paginada, 2.000 features por página, se escribe en streaming y espera si queda poca RAM.
- `ckan_list.py` y `normalize_datosgob.py`: datos.gob.bo.
- `scz_layers.py`, `scz_fetch.py` y `normalize_scz.py`: Santa Cruz.
- `cbba_cats.py` y `normalize_cbba.py`: Cochabamba.
- `build_inventories.py` y `make_manifest.py`: inventarios y manifiesto.
- `resolve.py` y `probe.py`: descubrir subdominios (DNS sobre HTTPS) y probar endpoints.
