# Carga de lugares de transporte

Puertos, aeropuertos y aeródromos, terminales de buses, paradas y estaciones
ferroviarias y de teleférico, para el corpus `NATIONAL_POI` — el rubro
«Transporte» que faltaba (pedido del 2026-09-23).

## Qué falta de las fuentes oficiales

Ninguna de las cuatro autoridades publica una lista descargable con
coordenadas:

| Fuente | Lo que se comprobó |
| --- | --- |
| DGAC/NAABOL | `naabol.gob.bo/aeropuertos-bolivia/` lista 38 aeropuertos y aeródromos por nombre, con una página propia cada uno. Ninguna trae coordenada, código OACI/IATA visible ni AIP descargable en la página pública; son fichas de contenido, no datos abiertos. |
| ATT (terminales terrestres) | La Resolución RAR-TR-LP 10/2021 (`att.gob.bo`) es el reglamento de autorización de terminales, no un padrón: dice que hay 15 operadores públicos y 15 privados sin nombrarlos ni ubicarlos. |
| ASP-B (puertos) | `gob.bo/entidades/administracion-de-servicios-portuarios-bolivia` nombra sus 8 oficinas regionales, no los puertos que administra. Puerto Busch, Puerto Suárez, Puerto Quijarro, Guayaramerín, Riberalta, Rurrenabaque, Trinidad y Puerto Villarroel se conocen por referencias de prensa y de la propia ASP-B, sin coordenada oficial publicada. |
| Ferroviaria Andina / Ferroviaria Oriental | Páginas de contenido por estación (`ferroviaria-andina.com.bo`), sin padrón descargable. Once estaciones de carga de Ferroviaria Andina se conocen por nombre (Viacha, Oruro, Río Mulato, Potosí, Agua de Castilla, Uyuni, Río Grande, Avaroa, Atocha, Tupiza, Villazón); Ferroviaria Oriental no publica una lista equivalente. |

Por eso la fuente de coordenadas es OpenStreetMap vía Overpass, con las
páginas oficiales sirviendo para reconocer el nombre y el operador cuando
coinciden — el mismo papel que ya cumple en el resto del corpus.

## Descarga

```sh
node scripts/places/download-transport-osm.mjs --out <directorio de datos crudos>
```

Once consultas, una por clase de lugar (aeródromos, terminales aéreas,
helipuertos, terminales de bus, paradas, estaciones de transporte público,
ferrocarril, puertos, teleférico, zonas francas y puertos secos por nombre),
contra `overpass-api.de` con un rectángulo — no el área administrativa de
Bolivia, que expiraba en el servidor principal antes de responder — y una
espera de 20 s entre consultas para no encadenar peticiones. Una clase que
agota sus reintentos no detiene a las demás: se avisa al final y queda para
otro intento. Cada respuesta se guarda cruda con su fecha, y el script
imprime la huella de cada archivo. Licencia: © OpenStreetMap contributors,
ODbL-1.0.

## Catálogo: tres familias que ningún catálogo anterior definía

```sh
node scripts/places/add-transport-families.mjs
```

Ni el anexo de 201 ni el catálogo de 2.330 nombran un puerto fluvial, un
puerto seco o una zona franca como infraestructura de transporte — el anexo
tiene `ADUANA` (la oficina) y el catálogo de 2.330 tiene familias de
comercio exterior, pero ninguno de los dos define el recinto. El script es
aditivo e idempotente: añade las tres familias que faltan al catálogo unido
(`scripts/places/catalogue/bolivia-place-families.json`) con `decided_by:
"mt_transporte_2026-09-23"`, y no toca ninguna fila ya clasificada por los
otros dos catálogos.

| Familia | `group` | `is_regulated` | `official_validation_source` |
| --- | --- | --- | --- |
| `PUERTO_FLUVIAL` | TRANSPORTE | true | ASP-B / Ministerio de Obras Públicas, Servicios y Vivienda |
| `PUERTO_SECO` | LOGISTICA | true | Aduana Nacional |
| `ZONA_FRANCA` | LOGISTICA | true | Aduana Nacional |

Las demás familias de transporte que este encargo necesitaba —`AEROPUERTO`,
`TERMINAL_BUS`, `PARADA_BUS`, `PARADA_TRUFI`, `ESTACION_TREN`,
`TELEFERICO_ESTACION`, `OV_AIRPORT_TERMINAL`, `OV_HELIPORT`,
`OV_PUBLIC_TRANSIT_FACILITY_OR_SERVICE`, `OV_PIER`, entre otras— ya estaban
en el catálogo unido desde la fusión del 2026-09-21. No se reclasifica
ninguna: la instrucción del encargo es explícita y la razón es la misma que
ya documenta `national-places-load.md` — el corpus es inmutable y reclasificar
añadiría una fila al lado, no corregiría la que ya está.

## Construcción de la siembra

```sh
node scripts/places/build-transport-poi-seed.mjs \
  --osm-dir   <directorio de datos crudos> \
  --catalogue scripts/places/catalogue/bolivia-place-families.json \
  --out       src/database/seeds/boot/bolivia-transport-poi \
  [--max-paradas <tope>]
```

Compara contra todo lugar que el repositorio ya tiene guardado —por
identificador de OpenStreetMap y por nombre y distancia—, igual que
`build-registry-poi-seed.mjs`. Un mismo nodo puede volver en más de una
consulta (una plataforma de bus casa con dos filtros); se deduplica por
identificador antes de clasificar. Una fila sin `name` ni `ref` publicado no
entra: nadie le inventa un nombre.

`--max-paradas` existe porque `PARADA_BUS`/`PARADA_TRUFI` puede ser la
familia con más filas de las once: si se pasa, se ordenan por identificador
—para que el resultado sea reproducible— y solo entran las primeras.

## Carga

```sh
yarn db:seed:boot --only=bolivia-national-poi
```

No es un paquete nuevo: `boot/bolivia-transport-poi/` se añadió a la misma
lista de directorios que ya carga `bolivia-national-poi` —una línea en
`PLACE_DIRECTORIES`, dentro de
`src/database/seeds/runners/boot-seed.bolivia-national-poi.ts`—, con el mismo
esquema (`bolivia-national-poi-v3`) y el mismo agente de historial
(`NATIONAL_POI`, ya en `boot/agent-bootstrap.json`). No hace falta un nuevo
código de catálogo en `manifest.ts` ni una nueva entrada en
`backfillAgents`.

## Resultados de la corrida del 2026-09-23

Espejo usado: `https://maps.mail.ru/osm/tools/overpass/api/interpreter` — el
servidor principal (`overpass-api.de`) devolvió `504`/`429`/`fetch failed` de
forma sostenida esa tarde; el espejo respondió las diez consultas.

| Medido | Cifra |
| --- | --- |
| Elementos leídos (deduplicados) | 5.247 (5.896 antes de deduplicar) |
| Ya guardados en el repositorio (por identificador) | 394 |
| Etiqueta reconocida pero de un país vecino | 6 (ver abajo) |
| Sin `name` ni `ref` publicado (no entran) | 1.327 |
| **Se escriben** | **3.520** |
| Parecidos a un lugar ya guardado (`resemblesHeldPlace`, no se funden) | 190 |

Por familia:

| Familia | Cifra |
| --- | --- |
| `PARADA_BUS` | 2.632 |
| `AEROPUERTO` | 441 |
| `TERMINAL_BUS` | 160 |
| `ESTACION_TREN` | 84 |
| `PUERTO_FLUVIAL` | 53 |
| `OV_PUBLIC_TRANSIT_FACILITY_OR_SERVICE` | 33 |
| `TELEFERICO_ESTACION` | 32 |
| `OV_PIER` | 28 |
| `OV_AIRPORT_TERMINAL` | 25 |
| `ZONA_FRANCA` | 22 |
| `PUERTO_SECO` | 7 |
| `PARADA_TRUFI` | 3 |

Muy por debajo de las 20.000 filas que habrían pedido un tope: las 2.635
paradas de bus/trufi entran completas, sin `--max-paradas`.

**El rectángulo no es la frontera.** Seis elementos con etiquetas de
transporte válidas quedaban geográficamente dentro del rectángulo de consulta
pero sus propias etiquetas decían que no eran de Bolivia: dos aeródromos en
Rio Branco (Acre, Brasil, `addr:state: AC`), dos terminales de bus en Rondônia
(Brasil, `addr:state: RO`, una con `addr:country: BR` explícito) y dos en Perú
(Madre de Dios y Puno). Se detectaron porque `is_in:state`/`addr:state` no
nombraba a ninguno de los nueve departamentos bolivianos, y se excluyeron
—`isForeignByTags`, en `classify-transport-osm.mjs`—. Sin esa comprobación
habrían entrado como lugares de Bolivia: el rectángulo de coordenadas cubre
esquinas reales de Brasil, Perú, Paraguay, Argentina y Chile.

**No hay departamento para casi ninguna fila.** De las 3.520, solo las 6
extranjeras (ya excluidas) traían `addr:state`/`is_in:state`; ninguna fila
boliviana lo trae. `department` queda `null` en las 3.520 filas escritas — la
misma limitación que ya documenta `national-places-load.md` para el resto del
corpus de OpenStreetMap: derivarlo exigiría los polígonos municipales, que no
están disponibles aquí. El tablero no puede agrupar este lote por
departamento sin ese trabajo aparte.

**Ciudad, solo cuando el mapeador la escribió.** De las 2.635 paradas de
bus/trufi, 2.397 (91 %) no traen `addr:city`. De las 238 que sí, la mayoría
son La Paz (122) y Cochabamba (64); el resto se reparte en municipios del
área metropolitana de Cochabamba (Quillacollo 17, Tiquipaya 11, Sacaba 3,
Colcapirhua 3, Vinto 4) y filas sueltas de otros municipios. Es un conteo de
lo que el mapeador escribió en una etiqueta, no una geocodificación: no se
guarda como `locality` salvo cuando la etiqueta ya lo decía.
