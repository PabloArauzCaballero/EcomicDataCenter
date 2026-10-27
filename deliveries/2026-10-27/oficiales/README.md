# Entrega 2026-10-27: registros oficiales de establecimientos

Lugares de Bolivia tomados de registros y directorios publicados por entidades
públicas, con la dirección y la coordenada que publica la propia fuente. Recogido
el 2026-10-27 (hora de cada fila en `retrieved_at`).

- Un archivo por fuente: `<fuente>/<fuente>.ndjson.gz`, NDJSON comprimido con gzip.
  Campos comunes: `source`, `source_id`, `name`, `category_raw`, `address`,
  `locality`, `municipality`, `department`, `lat`, `lon`, `phone`, `website`,
  `hours`, `source_updated_at`, `source_url`, `retrieved_at` y `raw`.
- `manifest.json` lleva el sha256, el tamaño, las filas, la cobertura y la URL de
  cada archivo.
- `_scripts/` tiene los recolectores que produjeron cada archivo (Python 3, solo
  biblioteca estándar, TLS verificado). Se corren así:
  `python -I _scripts/<fuente>.py <dir_descargas> <dir_salida>`.

**Total: 21.963 filas, de las cuales 18.608 (84,7 %) tienen coordenada.**

## Reglas aplicadas

- **No se geocodificó nada.** Las coordenadas son las que publica la fuente: un
  marcador de OpenStreetMap, un `setMark` o un JSON. Correos es la única
  excepción de método: se siguió la redirección del enlace corto de Google Maps
  que publica la propia AGBC y se leyó el marcador (`!3d…!4d…`) que ese enlace ya
  trae. Cuando una fuente solo publica la dirección, `lat` y `lon` quedan vacíos.
- **Una coordenada fuera de Bolivia se deja vacía.** El rectángulo usado es lat
  −23 a −9,5 y lon −69,8 a −57,3. El valor original queda en `raw`. Por ejemplo,
  la ANH tiene una planta de GLP de Huanuni publicada en (−2,68; −83,46).
- **No viajan datos de personas.** En los instaladores de redes de gas de la ANH
  (actividad 46) se quitó el «Representante», que es una persona con nombre. En
  las capas del GAMLP se quitaron `usuario` y `owner`, que son las cuentas de los
  funcionarios. El teléfono se dejó como lo publica la fuente. En la ANH, muchos
  teléfonos son móviles del operador: los lectores del repo
  (`scripts/places/read-anh-delivery.mjs`) ya descartan ese teléfono al cargar.
- Las oficinas del SEGIP en el exterior (Argentina, Brasil, Chile, España,
  EE. UU. y Perú) se excluyeron porque no son lugares de Bolivia.

## Fuentes

| Fuente (carpeta) | URL | Fecha de los datos | Método | Filas | Con coordenada |
| --- | --- | --- | --- | ---: | ---: |
| `asfi_puntos_atencion`: ASFI, puntos de atención financiera (**refresco**) | `https://asfidigitalapi.asfi.gob.bo/api/v1/puntosAtencion/fecha/2009-07-01` | `fechaModificacion` máx. 2026-10-27 21:29 | API JSON | 14.278 | 14.269 (99,9 %) |
| `anh_operadores`: ANH, operadores licenciados por actividad (estaciones, GNV, GLP, talleres…) | `https://www.anh.gob.bo/w2026/contenido.php?s=40&R=<n>&D=0` | licencias vigentes (`LIC09/2026`); la página no publica fecha de corte | HTML + `setMark(lat, lon)` | 7.103 | 3.781 (53,2 %) |
| `segip_oficinas`: SEGIP, oficinas de cedulación | `https://www.segip.gob.bo/oficina/` + `/wp-json/wp/v2/oficina` | `modified` máx. 2026-10-14 | HTML + marcador OSM | 107 | 102 (95,3 %) |
| `lapaz_mercados`: GAMLP, mercados municipales (88) y mercados móviles o ferias (68) | `https://sitservicios.lapaz.bo/geoserver/ows`, capas `sit:mercados` y `sit:mercadosmoviles` | `fechaActual` máx. 2026-10-09 | WFS GeoJSON | 156 | 154 (98,7 %) |
| `entel_multicentros`: ENTEL, multicentros | `https://institucional.entel.bo/inicio3.0/index.php/atencion-presencial/nuestros-multicentros` | alta 2024-11 a 2025-07 | HTML; cada enlace lleva el registro en JSON base64 | 77 | 77 (100 %) |
| `impuestos_oficinas`: SIN, oficinas y gerencias distritales | `https://impuestos.gob.bo/index.php/lista-direcciones-page/` | `modified` máx. 2025-09-16 | HTML plantilla AGETIC + marcador OSM | 53 | 53 (100 %) |
| `naabol`: NAABOL, 37 aeropuertos y 5 oficinas | `https://naabol.gob.bo/mapa_aeropuertos/` y `https://www.naabol.gob.bo/pagina-de-direcciones` | sin fecha | arreglo JS de Leaflet + marcador OSM | 42 | 42 (100 %) |
| `aduana_oficinas`: Aduana Nacional, administraciones, fronteras, aeropuertos y zonas francas | `https://www.aduana.gob.bo/pagina-de-direcciones` (4 páginas) | sin fecha | HTML AGETIC (Drupal) + marcador OSM | 40 | 32 (80 %) |
| `mintrabajo_oficinas`: Ministerio de Trabajo, jefaturas departamentales y regionales | `https://mintrabajo.gob.bo/index.php/lista-direcciones-page/` | `modified` máx. 2025-10-22 | HTML AGETIC + OSM | 24 | 24 (100 %) |
| `seprec_oficinas`: SEPREC (sucesor de la AEMP), oficinas | `https://seprec.gob.bo/index.php/lista-direcciones-page/` | `modified` máx. 2026-10-01 | HTML AGETIC + OSM | 13 | 13 (100 %) |
| `abc_oficinas`: ABC, oficinas regionales | `https://www.abc.gob.bo/index.php/lista-direcciones-page/` | 2025-09-15 | HTML AGETIC + OSM | 10 | 10 (100 %) |
| `asfi_oficinas`: ASFI, oficinas del regulador | `https://asfi.gob.bo/pagina-de-direcciones` | sin fecha | HTML AGETIC (Drupal) + OSM | 10 | 10 (100 %) |
| `correos_agbc`: Agencia Boliviana de Correos, una oficina por departamento | `https://www.correos.gob.bo/frontapi/api/site/pages/home` | sin fecha | API JSON + enlace de mapa publicado por la AGBC | 9 | 9 (100 %) |
| `senarecom_oficinas`: SENARECOM | `https://www.senarecom.gob.bo/index.php/lista-direcciones-page/` | 2025-12-08 | HTML AGETIC + OSM | 8 | 6 (75 %) |
| `ajam_oficinas`: AJAM (autoridad minera) | `https://autoridadminera.gob.bo/index.php/lista-direcciones-page/` | 2026-06-01 | HTML AGETIC + OSM | 8 | 6 (75 %) |
| `ibmetro_oficinas`: IBMETRO | `https://ibmetro.gob.bo/pagina-de-direcciones` | sin fecha | HTML AGETIC (Drupal) + OSM | 7 | 7 (100 %) |
| `insa_oficinas`: INSO/INSA (salud ocupacional) | `https://insa.gob.bo/index.php/lista-direcciones-page/` | 2025-08-28 | HTML AGETIC + OSM | 7 | 7 (100 %) |
| `ylb_oficinas`: Yacimientos de Litio Bolivianos | `https://www.ylb.gob.bo/index.php/lista-direcciones-page/` | 2025-09-14 | HTML AGETIC + OSM | 6 | 6 (100 %) |
| `att_oficinas`: ATT, oficinas | `https://www.att.gob.bo/contactanos` | sin fecha | HTML, solo dirección | 5 | 0 |

### ASFI: hay versión nueva

La carga del 2026-09-24 tenía 14.136 puntos. Hoy la API devuelve **14.278**: 142
más, y la última modificación es del mismo 2026-10-27. Detalle: 8.075 oficinas
externas (corresponsales), 3.970 cajeros, 1.578 agencias fijas, 285 oficinas
centrales, 195 sucursales, 163 ventanillas de cobranza y 12 agencias móviles.
El sha256 del JSON crudo es
`953eb414746da1b00a509d594b4391977a4074b57d0372ad2cab516c05b532f5`. `raw` guarda
el objeto completo de la API, incluido `contenidoHTML`.

### ANH: filas por actividad

Se leyó el listado nacional (`D=0`) de cada actividad. Quedaron fuera los
consumidores (37, 40, 41, 49, 51 y 98 a 105), porque son vehículos, bidoneros o
productores y no establecimientos. También quedó fuera el transporte en cisterna,
en GNC y de aditivos (48, 109 y 97).

En la actividad 1, estaciones de servicio, hay 519 estaciones. El 2026-09-23 eran
515. `source_id` es `R<actividad>:<código de operador y establecimiento>`, por
ejemplo `R1:ANH00762-CLES01`. Si no hay código de licencia, es un hash del nombre,
la dirección y el departamento.

| R | Actividad | Filas | Con coordenada |
| ---: | --- | ---: | ---: |
| 1 | Combustibles líquidos en estación de servicio | 519 | 519 |
| 2 | GNV en estación de servicio | 335 | 335 |
| 5 | Almacenaje de hidrocarburos líquidos | 34 | 34 |
| 12 | Transporte por ductos (líquidos) | 32 | 32 |
| 14 | Distribución de GLP a granel | 3 | 3 |
| 15 | Combustibles líquidos en puestos de venta | 89 | 80 |
| 16 | Importación de carburantes | 1.248 | 1.242 |
| 17 | Exploración y perforación de pozos | 2 | 2 |
| 18 | Explotación de pozos | 42 | 33 |
| 19 | Refinación | 4 | 2 |
| 23 | Transporte fluvial o lacustre | 4 | 4 |
| 29 | GLP en garrafas, plantas distribuidoras | 235 | 199 (3 con coordenada fuera de Bolivia) |
| 31 | Proceso de gas natural en campo | 7 | 6 |
| 33 | Engarrafado de GLP | 30 | 16 |
| 34 | Distribución de gas natural por redes | 59 | 35 |
| 36 | Importación de lubricantes | 380 | 336 |
| 38 | Surtidores de consumo propio | 52 | 37 |
| 39 | Importación para consumo propio | 42 | 34 |
| 42 | Talleres de conversión a GNV | 665 | 619 |
| 43 | Recalificación de cilindros de GNV | 78 | 70 |
| 44 | Recalificación de garrafas | 8 | 5 |
| 45 | Instalación de redes de GLP | 26 | 21 |
| 46 | Instalación de redes de gas natural (empresas instaladoras) | 3.074 | 0 (la página no publica ubicación ni departamento; este sale del código de la resolución, `DLP`, `DSC`…) |
| 47 | Otros del sector | 78 | 63 |
| 50 | Combustible de aviación en aeropuertos | 17 | 17 |
| 52, 54, 55 | Separación de líquidos, petroquímica, regasificación | 4 | 4 |
| 107 | Producción de alcoholes | 9 | 7 |
| 108 | Transporte de gas natural por ductos | 24 | 24 |
| 110, 126, 127 | Transporte ferroviario y mantenimiento o verificación de estaciones | 3 | 2 |

Las actividades 53 (licuefacción) y 106 (lubricantes) están en el menú pero hoy
no tienen filas. En la 12 y la 108, cada fila es un ducto o un tramo con un solo
punto, no un local.

### La plantilla AGETIC sirve para muchas entidades

Muchos sitios `.gob.bo` usan la plantilla de AGETIC. En WordPress, la página es
`/index.php/lista-direcciones-page/`; en Drupal, `/pagina-de-direcciones`. Cada
tarjeta trae «Nombre de oficina», «Dirección», «Teléfono» y un marcador de
OpenStreetMap que pone la propia entidad. `_scripts/gobbo_discover.py` probó
unos 180 dominios. Las entidades con más de 5 oficinas están en esta entrega.
Las que publican una sola (Presidencia, SEDEM, SERNAP, UIF, YPFB) o tres
(Minería, DAB) no se cargaron. Para una entidad nueva basta con correr
`gobbo_direcciones.py <slug>=<url>`.

## Lo que se revisó y no hacía falta refrescar

- **AGEMED, farmacias**: las 18 hojas
  `archivos_vigilancia/farmacias/farmacias_<depto>_<urbana|rural>.xlsx` siguen
  «actualizado al 12 septiembre 2026». 17 tienen el mismo sha256 que la siembra
  `bolivia-agemed-pharmacies-poi`. La de La Paz rural no tiene ningún sha
  guardado porque no aportó filas, pero lleva la misma fecha. No hay versión
  nueva (`_scripts/agemed_check.py`).

## Lo que no se pudo, y por qué

| Fuente pedida | Resultado |
| --- | --- |
| SIE, unidades educativas (refresco) | `reportes.sie.gob.bo/.../unidad/educativa` responde **HTTP 500** el 2026-10-27; la raíz del sitio responde 200. Se intentó dos veces con TLS verificado (`_scripts/sie_fetch.py`). Además, el runbook usa `curl -k`, que en esta sesión no está permitido. Queda la carga del 2026-09-23 (17.502 filas). |
| SNIS, establecimientos de salud (refresco) | No se refrescó. La estructura es una base Access 97 dentro de un `.ves`, que necesita el controlador Jet de 32 bits (ver `docs/runbooks/snis-health-load.md`). Los «actualizadores» mensuales son instaladores que no se ejecutan. Tampoco se confirmó si hay una estructura más nueva. |
| Viceministerio de Turismo: hospedajes y agencias (SIRETUR) | `turismo.produccion.gob.bo` y `conocebolivia.produccion.gob.bo` **no responden**: timeout desde aquí y conexión rechazada desde un segundo cliente. `minculturas.gob.bo` ya no resuelve. El registro existe (Ley 292, DS 2609; manual SIRETUR 2025), pero no se encontró una consulta pública. El último directorio público conocido es de 2012-2013. |
| SENASAG: mataderos, plantas y agroveterinarias | `www.senasag.gob.bo` responde **HTTP 403** a cualquier cliente que no sea un navegador, también desde un segundo cliente. No se intentó saltar el bloqueo. Hace falta navegador o un pedido a la entidad. |
| ATT: puntos de operadores, radios y TV | La ATT no publica un listado georreferenciado de radios, TV ni puntos de operadores. Solo se cargaron sus 5 oficinas, con dirección. |
| AEMP | Ya no existe: `aemp.gob.bo` no resuelve y la sucedió el SEPREC. Se cargaron las oficinas del SEPREC. El registro de empresas del SEPREC es la entrega `datos/2026-10-27-seprec` de otro agente. |
| SERECI, oficialías de Registro Civil | El OEP no publica la lista. Según la prensa son unas 779 oficialías y 54 dependencias. Ni `web.oep.org.bo` ni la API de WordPress traen un directorio. |
| Policía: EPI y módulos policiales | `policia.bo/comandos-departamentales/` carga los datos por script y no los trae en la página. No hay listado de EPI ni de módulos. |
| Bomberos | No tienen sitio propio con directorio (`bomberos.gob.bo` y `bomberos.bo` no resuelven). |
| SEDES departamentales | Sus establecimientos son la red del SNIS (ver arriba). No se encontró un directorio propio con coordenadas. |
| BoA, oficinas de venta | `boa.bo` es una aplicación de una sola página sin directorio estático ni API pública visible. Haría falta un navegador. Los aeropuertos están en `naabol`. |
| Terminales de buses | Ninguna entidad nacional publica el listado: la ATT no lo tiene y las terminales son municipales. |
| Mercados de las otras capitales | Solo se cargó La Paz, desde el GeoServer del GAMLP. Los geoportales municipales (El Alto, Santa Cruz, Cochabamba…) son de la entrega `datos/2026-10-27-geoportales` de otro agente. Las capas `sit:mercados` y `sit:mercadosmoviles` pueden repetirse ahí. |
| Aduana, recintos con horario | `aduana.gob.bo/horariosAduana` lista los recintos (Aguas Blancas, Puerto Chalanas, Cañada Oruro…) sin dirección ni coordenada. Las 40 oficinas con dirección están en `aduana_oficinas`. |
