# Lugares de Bolivia en OpenStreetMap — extracto del 26-oct-2026

Entrega del 2026-10-27, fuente **OpenStreetMap** (extracto `bolivia-latest.osm.pbf` de Geofabrik).
Una fila por lugar con nombre, en NDJSON comprimido con gzip.

**68.655 lugares** dentro de Bolivia: 46.925 nodos, 21.239 vías y 491 relaciones.
**871** se editaron después del 23-sep-2026 y **225** de esos son lugares nuevos (versión 1).

## Licencia

Datos © colaboradores de OpenStreetMap, bajo la **Open Database License (ODbL) 1.0**
(<https://opendatacommons.org/licenses/odbl/1-0/>, <https://www.openstreetmap.org/copyright>).
Quien publique estos datos o algo derivado de ellos tiene que atribuir «© OpenStreetMap contributors»,
y una base de datos derivada que se distribuya queda bajo ODbL. Cada fila lleva `"license": "ODbL-1.0"`.

## Archivos

| Archivo | Qué es |
|---|---|
| `osm-places-000.ndjson.gz` | Los 68.655 lugares (8 MB; no hizo falta partir, el tope es 90 MB). |
| `counts.json` | Conteos: por departamento, por clave y clave=valor, departamento × clave=valor, año de última edición, editados y nuevos después del 23-sep. |
| `manifest.json` | sha256, bytes y filas de cada archivo; instantánea y origen. |
| `method/extract_osm_places.py` | El script que produjo el NDJSON (pyosmium 4.3 + shapely 2.1). |

## Origen

- URL: <https://download.geofabrik.de/south-america/bolivia-latest.osm.pbf>, 174.529.121 bytes, md5 `8596af494c0fabd9520c3a85fdd81c2a` (coincide con el `.md5` publicado).
- Instantánea: `osmosis_replication_timestamp` = **2026-10-26T21:24:46Z** (secuencia 4955 de Geofabrik). La edición más reciente que trae un lugar es de 2026-10-26T21:18:56Z.
- Descargado: 2026-10-27T22:37:27Z (`retrieved_at`).
- El pbf público de Geofabrik trae `version` y `timestamp` de cada objeto, pero no usuario, uid ni conjunto de cambios (los quita por GDPR). Por eso `source_updated_at` es exacto y no hizo falta el histórico.

## Método

1. **Qué entra.** Todo nodo, vía o relación con nombre (`name`, si falta `name:es`, si falta `official_name`) y al menos una de:
   `amenity`, `shop`, `office`, `craft`, `healthcare`, `tourism`, `leisure`, `emergency`, `public_transport`, `aeroway`, `industrial` (cualquier valor),
   `railway=station`, `man_made=works`, o `building` (cualquier valor salvo `no`).
   Se excluyen las relaciones `boundary=administrative`.
2. **Categoría.** `category_raw` es la primera etiqueta que aparece en ese orden (amenity, shop, office, craft, healthcare, tourism, leisure, emergency, public_transport, aeroway, industrial, railway, man_made, building); `categories_all` las lista todas. Un edificio con `shop=*` cuenta como tienda; `building=*` solo manda cuando no hay otra.
3. **Ubicación.** Nodos: su punto. Vías cerradas: centroide del polígono (o un punto interior si el centroide cae fuera). Vías abiertas: centroide de la línea. Relaciones multipolígono: centroide del área armada por osmium (o punto interior). Otras relaciones (`site`, `stop_area`…): centroide de sus nodos y vías miembro. `geometry_kind` dice cuál se usó. Dos relaciones sin miembros ubicables quedaron fuera.
4. **Departamento, provincia y municipio.** Punto en polígono contra los límites administrativos de OSM del mismo pbf: nivel 4 con `ISO3166-2` `BO-*` (los 9), nivel 6 (112 provincias) y nivel 8 (333 municipios dentro de Bolivia). **376 lugares cayeron fuera de los 9 departamentos y se descartaron**: el recorte de Geofabrik incluye una franja de Perú, Brasil, Chile, Argentina y Paraguay (Guajará-Mirim, Assis Brasil, Yunguyo…). No se acerca un punto al departamento más próximo, porque a menos de 1 km del borde están pueblos brasileños. `municipality` quita el prefijo «Municipio » del nombre OSM; el original va en `municipality_osm_name`. 444 lugares no tienen municipio porque OSM no tiene polígono de nivel 8 donde caen (sobre todo Copacabana y la península de Tiquina, en La Paz).
5. **Localidad.** `addr:city` si existe (27.985 lugares); si no, el poblado `place=city|town|village|hamlet` más cercano dentro de 15 / 6 / 3 / 1,5 km. `locality_source` dice de dónde salió y a qué distancia.
6. **Dirección.**
   - Etiquetada: `addr:street` + `addr:housenumber`, o `addr:full`, o `addr:place`. Los campos `addr_street`, `addr_housenumber`, `addr_city`, `addr_suburb`, `addr_postcode` van sueltos.
   - **Inferida** (`address_inferred: true`): a los que no traen calle se les da la calle con nombre más cercana (`highway` motorway…tertiary, unclassified, residential, living_street, pedestrian, service, road y enlaces) **a menos de 50 m**, medida como distancia geodésica del punto al segmento más cercano. `address_inferred_from` da la vía (`street_osm_way_id`), su clase y la distancia en metros. La dirección inferida es solo el nombre de la calle, sin número. Mediana de la distancia: 13,2 m (cuartiles 8,1 y 23,8 m).
7. **Contacto y horario.** `phone` = `phone` › `contact:phone` › `mobile` › `contact:mobile`; `website` = `website` › `contact:website` › `url`; `hours` = `opening_hours` tal cual (sintaxis OSM). `contact` reúne todas las `contact:*`, `phone`, `mobile`, `email`, `fax`, `website`, `url`. También van `brand`, `operator`, `email` y `check_date` (o `survey:date`).
8. **Fecha.** `source_updated_at` es el `timestamp` de la última versión del objeto. «Editado después del 23-sep» = `timestamp ≥ 2026-09-24T00:00:00Z` (`edited_after_2026_09_23`); «nuevo» = eso y `osm_version = 1`. Ojo: en una vía o relación, mover sus nodos no cambia su timestamp; solo cuentan los cambios al objeto mismo.

## Campos de cada fila

Normalizados (comunes a las 12 entregas): `source` (`openstreetmap`), `source_id` (`node/123`), `name`, `category_raw` (`amenity=pharmacy`), `address`, `locality`, `municipality`, `department`, `lat`, `lon`, `phone`, `website`, `hours`, `source_updated_at`, `source_url` (`https://www.openstreetmap.org/node/123`), `retrieved_at`, `raw`.

Propios de OSM: `osm_type`, `osm_id`, `osm_version`, `categories_all`, `department_code` (`LA_PAZ`, `SANTA_CRUZ`… como en el resto del repo), `municipality_osm_name`, `province`, `locality_source`, `addr_street`, `addr_housenumber`, `addr_city`, `addr_suburb`, `addr_postcode`, `address_inferred`, `address_inferred_from`, `brand`, `operator`, `email`, `contact`, `check_date`, `geometry_kind`, `edited_after_2026_09_23`, `snapshot_at`, `license`.

`raw` = `{type, id, version, timestamp, tags}` con **todas** las etiquetas del objeto.

## Conteos

### Por departamento

| Departamento | Lugares | Con dirección (etiqueta) | Con dirección (inferida) | Horario | Teléfono | Web | Editados > 23-sep | Nuevos > 23-sep |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| La Paz | 20.255 | 8.853 (43.7 %) | 8.062 (39.8 %) | 2.511 (12.4 %) | 1.550 (7.7 %) | 741 (3.7 %) | 288 | 39 |
| Santa Cruz | 16.997 | 6.627 (39.0 %) | 7.068 (41.6 %) | 821 (4.8 %) | 1.081 (6.4 %) | 362 (2.1 %) | 321 | 129 |
| Cochabamba | 16.363 | 7.906 (48.3 %) | 5.866 (35.8 %) | 2.393 (14.6 %) | 2.076 (12.7 %) | 1.046 (6.4 %) | 188 | 44 |
| Potosí | 4.753 | 544 (11.4 %) | 1.589 (33.4 %) | 150 (3.2 %) | 218 (4.6 %) | 98 (2.1 %) | 11 | 4 |
| Chuquisaca | 2.839 | 608 (21.4 %) | 939 (33.1 %) | 198 (7.0 %) | 153 (5.4 %) | 102 (3.6 %) | 9 | 1 |
| Tarija | 2.790 | 558 (20.0 %) | 1.329 (47.6 %) | 306 (11.0 %) | 119 (4.3 %) | 68 (2.4 %) | 31 | 0 |
| Oruro | 2.369 | 341 (14.4 %) | 1.028 (43.4 %) | 148 (6.2 %) | 89 (3.8 %) | 74 (3.1 %) | 6 | 3 |
| Beni | 1.613 | 368 (22.8 %) | 620 (38.4 %) | 95 (5.9 %) | 83 (5.1 %) | 50 (3.1 %) | 6 | 2 |
| Pando | 676 | 146 (21.6 %) | 216 (32.0 %) | 16 (2.4 %) | 25 (3.7 %) | 18 (2.7 %) | 11 | 3 |
| **Bolivia** | **68.655** | **25.951 (37,8 %)** | **26.717 (38,9 %)** | **6.638 (9,7 %)** | **5.394 (7,9 %)** | **2.559 (3,7 %)** | **871** | **225** |

Con alguna dirección (etiquetada o inferida): 52.668 (76,7 %). Con número de casa: 5.439 (7,9 %). Con teléfono o web: 6.208 (9,0 %). Con correo: 1.773. Con `check_date`: 1.639. Con municipio: 68.211 (99,4 %). Con localidad: 67.114 (97,8 %).

### Por clave principal

| Clave | Lugares | Editados > 23-sep |
|---|---:|---:|
| `amenity` | 30.029 | 367 |
| `shop` | 14.365 | 150 |
| `leisure` | 6.720 | 78 |
| `tourism` | 4.493 | 78 |
| `building` | 4.194 | 92 |
| `office` | 3.504 | 42 |
| `public_transport` | 2.859 | 37 |
| `industrial` | 994 | 5 |
| `craft` | 569 | 5 |
| `aeroway` | 432 | 7 |
| `healthcare` | 333 | 9 |
| `man_made` | 137 | 1 |
| `emergency` | 25 | 0 |
| `railway` | 1 | 0 |

### Las 50 clave=valor más frecuentes

747 combinaciones distintas en total; la lista completa y su cruce por departamento están en `counts.json` (`by_primary_tag`, `by_tag` —todas las etiquetas de cada lugar—, `by_department_primary_tag`).

| clave=valor (principal) | Lugares | Editados > 23-sep |
|---|---:|---:|
| `amenity=school` | 8.985 | 51 |
| `leisure=park` | 3.581 | 47 |
| `amenity=restaurant` | 3.436 | 65 |
| `public_transport=platform` | 2.345 | 28 |
| `amenity=pharmacy` | 2.306 | 35 |
| `shop=convenience` | 2.295 | 11 |
| `shop=yes` | 1.850 | 12 |
| `amenity=place_of_worship` | 1.693 | 41 |
| `amenity=fast_food` | 1.585 | 35 |
| `leisure=pitch` | 1.430 | 11 |
| `tourism=hotel` | 1.208 | 16 |
| `amenity=bank` | 1.168 | 16 |
| `building=apartments` | 1.043 | 17 |
| `office=government` | 984 | 13 |
| `shop=car_repair` | 893 | 7 |
| `amenity=hospital` | 839 | 10 |
| `tourism=attraction` | 817 | 23 |
| `building=yes` | 793 | 27 |
| `office=company` | 723 | 6 |
| `amenity=atm` | 692 | 5 |
| `shop=hardware` | 672 | 3 |
| `amenity=fuel` | 668 | 2 |
| `amenity=dentist` | 650 | 3 |
| `leisure=sports_centre` | 641 | 8 |
| `amenity=cafe` | 618 | 8 |
| `shop=clothes` | 609 | 12 |
| `amenity=clinic` | 606 | 6 |
| `shop=travel_agency` | 601 | 5 |
| `amenity=marketplace` | 549 | 9 |
| `tourism=hostel` | 519 | 7 |
| `amenity=police` | 494 | 3 |
| `shop=supermarket` | 468 | 2 |
| `shop=hairdresser` | 401 | 3 |
| `shop=car_parts` | 383 | 8 |
| `tourism=viewpoint` | 352 | 4 |
| `industrial=factory` | 349 | 2 |
| `building=commercial` | 337 | 10 |
| `amenity=bar` | 334 | 7 |
| `amenity=university` | 329 | 11 |
| `tourism=guest_house` | 318 | 1 |
| `amenity=community_centre` | 317 | 0 |
| `shop=beauty` | 317 | 3 |
| `tourism=artwork` | 314 | 1 |
| `public_transport=stop_position` | 304 | 5 |
| `shop=optician` | 299 | 2 |
| `amenity=bus_station` | 296 | 7 |
| `building=university` | 294 | 2 |
| `shop=bakery` | 283 | 3 |
| `amenity=veterinary` | 265 | 0 |
| `amenity=events_venue` | 261 | 1 |

### Año de la última edición

2026: 10.815 · 2025: 6.859 · 2024: 5.695 · 2023: 7.565 · 2022: 5.658 · 2021: 5.094 · 2020: 4.378 · 2019: 5.546 · 2018: 4.442 · 2017: 3.893 · 2016: 7.860 · antes de 2016: 850.

## Lo que conviene saber antes de cargar

- **No es lo mismo que el barrido del 24-sep.** Aquel contaba 61.140 «con nombre válido» con otra tabla de claves; esta entrega incluye `building=*` con nombre (4.194 donde el edificio es la única etiqueta), `public_transport=platform` (paradas con nombre: 2.345) y `aeroway`, y deja fuera `landuse=*` y `highway=*`. Para cruzar con lo cargado, usar `source_id` (`node/…`, `way/…`, `relation/…`).
- **Lo nuevo es poco.** En un mes OSM sumó 225 lugares con nombre en Bolivia y retocó 646 más; el grueso, en Santa Cruz, La Paz y Cochabamba.
- **La dirección inferida no es una dirección postal.** Es la calle con nombre más cercana: en una esquina puede ser la transversal, y en un parque o una cancha es una de las que lo bordean. Solo el 7,9 % trae número de casa.
- `shop=yes` (1.850) es una tienda sin rubro declarado en OSM.
- Las `public_transport=platform` de La Paz son en buena parte paradas del PumaKatari y del teleférico; traen horario en `opening_hours`, lo que sube el porcentaje de horario de La Paz.
- Duplicados internos posibles: un mismo establecimiento como nodo y como edificio con nombre (por ejemplo, una farmacia dentro de un edificio con el mismo nombre). No se deduplicó.
