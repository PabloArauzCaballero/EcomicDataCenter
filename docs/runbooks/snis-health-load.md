# Carga de la red de salud del Ministerio y de las farmacias que faltaban (2026-09-27)

Pedido: «profundizar los datos de salud: faltan muchas farmacias, hospitales y más
cosas de salud; que aumente sustancialmente, pero revisando la calidad».

## Qué faltaba de verdad

Medido sobre todas las siembras `*-poi` antes de esta carga: 20.380 lugares de
salud, de los que 7.880 son farmacias y 2.974 odontología, pero **116 centros de
salud y ningún puesto de salud**. Lo cargado venía de OpenStreetMap y Overture, que
mapean lo urbano; la red pública de primer nivel —la posta de la comunidad rural—
casi no estaba. En farmacias, AGEMED publica 7.001 filas y se habían cargado 4.812,
todas de tipos privados: ninguna pública, municipal ni de las cajas.

Resultado de esta carga: **3.414 lugares nuevos**.

| Siembra | Lugares | Qué trae |
| --- | --- | --- |
| `bolivia-snis-health-poi` | 2.719 | 1.540 centros de salud, 1.051 puestos de salud, 77 de las cajas, 49 hospitales |
| `bolivia-agemed-pharmacies-poi` | 695 | 162 farmacias institucionales municipales, 152 públicas de primer a tercer nivel, 57 del seguro social, 324 privadas, institucionales y boticas |

## 1. El registro del Ministerio (SNIS-VE)

`snis.minsalud.gob.bo` publica en «Software» (componente jDownloads, sin
autenticación) la estructura de establecimientos de cada gestión. La de 2026 es
`Estructura_2026.zip` (`?task=download.send&id=1174`), que trae
`DEPTOSESTR_2026.ves`.

El `.ves` es un gabinete de Microsoft (`MSCF`) que abre `tar -xf` de Windows. Dentro,
`transfer.sql` **no es SQL**: es una base Access 97 (Jet 3). Se exporta con el
controlador Jet de 32 bits:

```powershell
C:\Windows\SysWOW64\WindowsPowerShell\v1.0\powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File scripts\places\export_snis_structure.ps1 -Mdb <e>\transfer.mdb -OutDir <e>\csv
```

El ACE de 64 bits rechaza Jet 3 y `access-parser` (Python) corre los campos de texto
de largo fijo: no usar ninguno de los dos.

La base tiene 5.248 establecimientos; `EstabGest2005` los repite para la gestión 2026
con `bajalogica`. **798 tienen baja lógica** (cerrados o fuera de servicio) y no se
cargan: quedan 4.354. Los «Actualizadores de estructura» mensuales (el último, del
14-09-2026) son instaladores Setup Factory: no se ejecutan.

Subsector por el prefijo del código de institución (`t_instit_tx.codsubsec`),
confirmado contra el Excel cerrado de 2021: 01 público, 02 seguridad social, 03 ONG,
05 privado, 06 FF.AA., 07 iglesia, 08 policía.

### Las coordenadas

El registro no trae ninguna. Se toman en este orden, y solo si caen dentro del
municipio que declara el propio registro (polígono COD-AB v02, 3 km de tolerancia):

1. **Mapa del SUS del Ministerio** — «Sistema Único de Salud - Etapa Adscripción»,
   Google My Maps enlazado desde minsalud.gob.bo
   (`/3590-busque-en-su-zona-el-centro-de-salud-mas-cercano-con-google-maps`). Se
   exporta como KML con `https://www.google.com/maps/d/kml?mid=1dbQVDkzZ9PxsIkBoPUurZ3vvQdujMREj&forcekml=1`:
   2.766 establecimientos de primer nivel con provincia, municipio, clase, latitud y
   longitud. Da 2.249 de los cargados.
2. **Capa del Ministerio de Salud y Deportes en HDX** (`bolivia-health`,
   `centros_de_salud_0.zip`, 1.955 puntos, georreferencia 2001-2008; el mapa de
   ArcGIS «Mapa de Centros de Salud de Bolivia» es el mismo conjunto). Da 160,
   marcados `coordenada_antigua_del_ministerio_2001_2008`.
3. **Solo rurales: la comunidad homónima de OpenStreetMap** (`place=village|hamlet|
   locality|isolated_dwelling|farm` del extracto Geofabrik 2026-09-22, único dentro
   del municipio). Da 310. Es la comunidad, no el edificio: comparado con los 1.398
   que tienen además el punto del Ministerio, **mediana 0,48 km, 70 % a menos de 1 km
   y 90 % a menos de 3,4 km**. Llevan `positionMethod = centro_de_la_comunidad_osm_homonima`
   y el tablero los marca «Ubicación aproximada».

72 coordenadas del mapa del SUS caían a más de 3 km de su municipio (Huarina,
Santiago de Huata…) y se rechazaron. **1.300 establecimientos activos quedan sin
coordenada comprobable y no se cargan**: sobre todo urbanos (246 hospitales de
segundo nivel, clínicas y policonsultorios privados), que en su mayoría ya están en
el corpus por OpenStreetMap u Overture con otro nombre.

### Lo que no se carga

- Clases que no atienden al público: IDIF, IDE, CCESD, centros de aislamiento (60).
- Seis nombres que son solo una persona («DR. …»), por la regla de la carga de salud
  de OpenStreetMap.
- El responsable y el teléfono de cada establecimiento: nombran a una persona y, en
  las postas, el teléfono es a menudo el celular del auxiliar.
- **Lo que ya estaba en el corpus (269)**: mismo nombre a menos de 300 m de un lugar
  de salud guardado (3 km si la posición es la aproximada), o un nombre que contiene
  al otro a menos de 100 m. El tablero no mira `resemblesHeldPlace`: cargar el par lo
  mostraría dos veces. Los pares quedan en `artifacts/snis-health-already-held.json`
  (no versionado). Los 26 parecidos más débiles sí entran, marcados.

La familia sale de la clase del SNIS; la seguridad social va a `CAJA_DE_SALUD`
siguiendo la regla de la carga de 2026-09-23 («la propiedad manda sobre la forma»).
Clase, nivel, subsector, institución, red de salud, ámbito, camas y código SNIS
viajan en `sourceTags`.

```sh
python scripts/places/build_snis_health_poi_seed.py \
  --structure-dir <e>/csv --structure-archive <e>/Estructura_2026.zip \
  --sus-kml <e>/sus-adscripcion.kml \
  --msyd-dbf <e>/centros_de_salud.dbf --msyd-shp <e>/centros_de_salud.shp \
  --pbf <e>/bolivia-260922.osm.pbf --adm3 <e>/bol_admin3.geojson \
  --retrieved 2026-09-27T22:05:00Z
```

## 2. Las farmacias de AGEMED que faltaban

Las 18 hojas `archivos_vigilancia/farmacias/farmacias_<depto>_<urbana|rural>.xlsx`
(«actualizado al 12 septiembre 2026») tienen el mismo SHA-256 que guardó la carga
del 2026-09-21. Tienen 7.001 filas; la estadística propia de AGEMED
(`reportes_estadisticas/ReporteFarmaciasClasificacion1.pdf`) da 6.861.

`build_agemed_pharmacies_seed.py` relee las hojas y escribe solo lo que falta:

- 4.812 ya cargadas, reconocidas por su origen exacto `<hoja>:fila:<n>`.
- **613 en un punto de relleno**: tres o más farmacias distintas en la misma
  coordenada exacta. El caso extremo son 462 farmacias rurales de La Paz, de Caranavi
  a Tipuani, todas en una esquina de la ciudad de La Paz. Sin coordenada real no se
  cargan; geocodificar por dirección sería inventar la precisión.
- 342 sin coordenada, 183 fuera de su municipio o departamento, 11 filas repetidas,
  8 que no son farmacias (distribuidoras, laboratorio, «no definido»).
- 337 que ya estaban por OpenStreetMap u Overture (mismo nombre a menos de 100 m, o la
  mitad de las palabras a menos de 25 m). Pares en
  `artifacts/agemed-pharmacies-already-held.json`.

Regentes, teléfonos, NIT y correos se descartan, igual que en la carga anterior.
Los municipios del registro llegan con nombres largos («VILLA HUANUNI», «SANTA ROSA
DEL ABUNA»): si no calzan con el catálogo, vale el municipio que contiene el punto
cuando comparte una palabra con el declarado.

```sh
python scripts/places/build_agemed_pharmacies_seed.py --sheets <e>/agemed_xlsx \
  --adm3 <e>/bol_admin3.geojson --retrieved 2026-09-27T21:30:00Z
```

## 3. Siempre al final

```sh
python scripts/places/assign_place_municipality.py --adm3 bol_admin3.geojson \
  --adm0 bol_admin0.geojson --retrieved-at 2026-09-24T14:52:00Z
yarn db:seed:boot --only=bolivia-national-poi
```

Con la misma capa (SHA-256 `d17ae836…`) y la misma fecha que la carga del 24-09, las
51.762 asignaciones anteriores salen idénticas y se suman 24 (farmacias sin
municipio reconocido).

## Lo que queda fuera y por qué

- **Localizadores de cadenas (Farmacorp y otras)**: la API de sucursales de Farmacorp
  pide una credencial que solo aparece incrustada en su JavaScript. Usarla no es
  acceso público, así que no se usó.
- **Foursquare OS Places**: sigue esperando el token de Hugging Face del usuario.
- **Los 1.300 establecimientos sin coordenada**: los urbanos podrían ubicarse
  cruzándolos por nombre con lo que ya hay en el corpus; hoy no se hace porque no
  agrega ningún punto nuevo al mapa.
