# Enriquecimiento comercial de Santa Cruz de la Sierra

Cómo se descarga y se construye la siembra `bolivia-scz-enrichment-poi`: comercio
minorista, gastronomía, oficios y servicios profesionales de Santa Cruz de la
Sierra, leídos en vivo de OpenStreetMap, para el 34% de la ciudad que la
entrega nacional dejó en `OTRA_ENTIDAD` u `OV_SERVICES_AND_BUSINESS` (pedido
del 2026-09-23, con captura de pantalla: «sigue mal totalmente la
clasificación de lugares... enfoquémonos en Santa Cruz primero»).

Datos © OpenStreetMap contributors, bajo ODbL-1.0. Cada fila lleva su licencia.

## Lo que hay que saber antes de tocar nada — y no es lo que parecía

La hipótesis de partida era que OpenStreetMap tiene mejores etiquetas de
comercio que Overture para Santa Cruz, y que pedirlas en vivo destaparía un
número grande de lugares nuevos. **Medido, es mayormente falsa**: de 4.535
elementos con nombre que Overpass devuelve para las etiquetas de comercio y
servicios de esta carga, **4.373 (el 96,4%) ya estaban en el corpus con el
mismo identificador `osm:node:*` / `osm:way:*`** — no por Geofabrik, por una
lectura en vivo de OpenStreetMap que ya corrió hoy sobre el mismo vocabulario
de etiquetas, antes de esta carga. Y, comprobado sobre una muestra de esos
2.296 ya guardados: están bien clasificados (`MINIMARKET`, `TALLER_MECANICO`,
`ROPA_MODA`, `FERRETERIA`, `PELUQUERIA`...), no en `OTRA_ENTIDAD`. El 34% que
sigue sin clasificar en Santa Cruz no es, en su mayoría, comercio con etiqueta
específica de OpenStreetMap sin leer: es Overture sin etiqueta utilizable y
SEPREC sin actividad declarada, que es exactamente lo que el encargo original
ya advertía y que esta carga no puede arreglar sin reclasificar filas ya
cargadas — algo que esta carga tiene prohibido hacer.

| Medido (2026-09-23) | Cifra |
| --- | --- |
| Elementos con nombre leídos (4 grupos, 4 consultas) | 4.535 |
| Ya estaban en el corpus por identificador de OpenStreetMap | 4.373 |
| Ya estaban por mismo nombre a menos de 100 m | 73 |
| **Lugares nuevos** | **89** |
| Se parecen a un lugar ya guardado (`resemblesHeldPlace`) | 19 |
| Familias nuevas en el catálogo | 0 (las 8 familias que usa ya existían) |

- **Lo que el corpus ya tiene no vuelve a entrar**, por identificador (nodo,
  vía o relación de OpenStreetMap) y por nombre idéntico a menos de 100 m. Un
  nombre parecido no se descarta: se marca con `resemblesHeldPlace` y entra.
- **Nada cae en `OTRA_ENTIDAD` ni en `OV_SERVICES_AND_BUSINESS`.** La tabla de
  clasificación (`scz-enrichment-classify.mjs`) solo reconoce una pareja
  `clave=valor` cuando significa una familia específica del catálogo de 2.371;
  lo que no reconoce, o para lo que el catálogo no define familia, se cuenta
  aparte y no se suma — mejor no sumar un lugar que sumarlo mal clasificado.
- **Deliberadamente fuera**, porque otras cargas de hoy ya las cubren:
  `amenity=pharmacy|hospital|clinic|doctors|dentist|laboratory|blood_donation|
  nursing_home` y cualquier `healthcare=*` (salud); `amenity=school|college|
  university` (SIE); `amenity=bank` y cajeros (Tel.bo); `amenity=fuel` y
  `shop=gas` (ANH); `office=financial|insurance|financial_advisor|cooperative|
  government|telecommunication`, `shop=mobile_phone|telecommunication|
  agrarian|farm`, `leisure=sports_centre|stadium|pitch|swimming_pool|
  golf_course|fitness_centre|track`, `amenity=townhall|courthouse|police|
  fire_station|place_of_worship|theatre|arts_centre|community_centre|
  marketplace` (ampliación por rubros, a nivel país).
- **El área es el municipio, no un rectángulo a ojo.** Nominatim resuelve
  «Municipio Santa Cruz de la Sierra» a la relación OSM 4511527
  (comprobado el 2026-09-23), y Overpass la expone como `area(3604511527)`.
  Es más preciso que un bbox declarado a mano y evita las esquinas de otros
  municipios que un rectángulo generoso arrastraría.

## Procedimiento

### 1. Descargar

```sh
node scripts/places/fetch-scz-enrichment-osm.mjs --out-dir <carpeta de crudos>
```

Cuatro grupos — `comercio-minorista`, `gastronomia`, `oficios-y-servicios`,
`comercio-especializado` — cada uno su propio JSON y un `manifiesto.json` con
la huella, el intérprete que respondió y la hora del snapshot. Se reanuda: un
grupo ya descargado hoy no se vuelve a pedir. mail.ru sirvió el snapshot más
fresco el 2026-09-23; `overpass-api.de` respondió 406 a `curl` sin
`User-Agent` de aplicación y 200 con uno — el script ya lo envía.

Verificado el 2026-09-23: 4.535 elementos, huella de los cuatro crudos
`20cbd29c458d7865b915095dd0f5e5adf4e34979acfeedaf46f6f0f00328c7ca`.

### 2. Construir la siembra

```sh
node scripts/places/build-scz-enrichment-poi-seed.mjs \
  --crudos    <carpeta de crudos> \
  --catalogue scripts/places/catalogue/bolivia-place-families.json
```

Verifica cada crudo contra el manifiesto, compara con **todas** las siembras
de lugares del disco salvo la propia — el país y las tres ciudades — y
escribe piezas de 1.200 ordenadas por identificador. Deja la medición en
`artifacts/scz-enrichment-poi-report.json`. No escribe nada si la tabla usa
una familia que el catálogo no define (no ocurrió: 0 familias faltantes).

### 3. Cargar

```sh
yarn db:seed:boot --only=bolivia-national-poi
```

La carpeta está en `PLACE_DIRECTORIES`
(`src/database/seeds/runners/boot-seed.bolivia-national-poi.ts`) y en el
paquete `bolivia-national-poi` de `manifest.ts`, que sube a 1.5.1. Las filas
ya cargadas no cambian: el cargador es idempotente por huella y esta carga
solo añade. **`db:*` apunta a Neon por `.env`**; esta tarea no lo ejecutó —
sin base local con cuota, se validó con `boliviaNationalPoiSchema.safeParse`
en modo lectura (89/89 lugares válidos) y con los gates del repositorio.

## Lo que trae — por familia y por rubro del tablero

`sectorOf` (`observatorio-dashboard/src/lib/place-sectors.ts`, no editado)
resuelve primero por familia y después por grupo:

| Familia | Grupo | Rubro del tablero | Lugares |
| --- | --- | --- | --- |
| `MINIMARKET` | `COMERCIO_ALIMENTOS` | Gastronomía | 77 |
| `TALLER_MECANICO` | `AUTOMOTOR` | Automotor | 3 |
| `ABOGADOS_NOTARIA` | `SERVICIOS_PROFESIONALES` | Servicios | 2 |
| `DISCOTECA_NIGHTCLUB` | `ENTRETENIMIENTO` | Cultura | 2 |
| `ROPA_MODA` | `COMERCIO` | Comercio | 1 |
| `ELECTRODOMESTICOS` | `COMERCIO_HOGAR` | Comercio | 1 |
| `AUTOESCUELA` | `EDUCACION` | Educación | 1 |
| `RESTAURANTE` | `GASTRONOMIA` | Gastronomía | 1 |
| `FERRETERIA` | `COMERCIO_CONSTRUCCION` | Construcción (por familia) | 1 |

`MINIMARKET` cae en «Gastronomía» y no en «Comercio» porque así lo resuelve
`SECTOR_BY_GROUP['COMERCIO_ALIMENTOS']` en el tablero — una decisión editorial
de ese repositorio, no de esta carga.

## Lo que esta carga no cambia

Sobre los 22.508 lugares medidos en Santa Cruz de la Sierra el 2026-09-23
(`OTRA_ENTIDAD` 4.797 + `OV_SERVICES_AND_BUSINESS` 2.817 = 7.614, 33,83% de la
ciudad): sumar los 89 lugares nuevos al total (22.597) baja ese peso a
**33,70%** — 0,13 puntos. Ninguno de los 89 es `OTRA_ENTIDAD` ni
`OV_SERVICES_AND_BUSINESS`, pero el residuo en sí no se toca: esta carga no
reclasifica ni un lugar ya cargado, y el residuo mide lo que Overture y SEPREC
no pudieron nombrar, no lo que OpenStreetMap todavía no había traído. Reducir
ese 33,70% de verdad exige, para cada una de las dos familias, decidir si se
reclasifica lo ya cargado — una decisión que el encargo de esta tarea
explícitamente no autorizó, y que otra tarea tendría que abordar aparte.

## Lo que esta carga no dice

- Que algo esté abierto. OpenStreetMap no lo publica; el snapshot es del
  2026-09-23.
- Que un regulador haya licenciado el lugar. Ninguna de las 8 familias que
  esta carga usa lleva `is_regulated: true`.
- Que el 96% de comercio ya cargado por OpenStreetMap esté bien clasificado en
  su totalidad — se comprobó una muestra, no las 4.373 filas una por una.
