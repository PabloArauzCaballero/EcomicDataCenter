# Overture Maps 2026-10-21.0: lugares de Bolivia

Entrega del 2026-10-27, uno de los 12 recolectores de lugares en paralelo. Nada de esto está
cargado en ninguna base.

## Resumen

- **Entrega usada: `2026-10-21.0`**, la más nueva publicada en
  `s3://overturemaps-us-west-2/release/` el 2026-10-27. Las otras que hay son `2026-09-23.0` y
  `2026-09-23.1`.
- **106.529 lugares dentro de Bolivia**, sin filtrar por confianza. Hay un único archivo,
  `overture-places-bolivia-2026-10-21.0.ndjson.gz`, de 34 MB, con una fila por lugar.
- **63.670 descartados por caer fuera del polígono del país.** Son de BR 53.610, CL 5.001,
  PE 2.353, AR 1.883 y PY 811. Otros 12 declaran `country = BO` pero caen fuera de la frontera
  (Desaguadero, Villazón, etc.). Al revés, 47 declaran otro país y caen dentro; se conservan.
- **Frente a la 2026-09-23.0 hay 4.873 lugares nuevos por nombre y distancia**; 3.476 de ellos
  tienen confianza ≥ 0,3. No desapareció ninguno.
- **El tema `addresses` no tiene Bolivia.** No se entrega archivo de direcciones; el detalle va
  en «Lo que faltó».

## Cobertura de campos (sobre 106.529)

| Campo                                    |   Filas |       % |
| ---------------------------------------- | ------: | ------: |
| `address` (freeform, sin «Unnamed Road») |  90.041 |  84,5 % |
| `locality` declarada                     | 102.679 |  96,4 % |
| `phone`                                  |  86.914 |  81,6 % |
| `website`                                |  32.449 |  30,5 % |
| `socials`                                | 106.158 |  99,7 % |
| `emails`                                 |  53.339 |  50,1 % |
| `category_raw` (taxonomy.primary)        | 102.217 |  96,0 % |
| `brand_name`                             |   2.524 |   2,4 % |
| `operating_status` (todos `open`)        |     162 |   0,2 % |
| `hours`                                  |       0 |     0 % |
| `municipality` (polígono COD-AB)         | 106.509 | 99,98 % |
| `department`                             | 106.529 |   100 % |

Los 106.529 vienen de Overture. 105.951 tienen a `meta` (páginas de Facebook) como fuente, 205
a Microsoft, 159 a Uberall, 111 a AllThePlaces, 102 a Foursquare y 4 a otras fuentes. Esas
fuentes se solapan.

## Método

1. **Descarga** (`scripts/download.py`). Se usó DuckDB 1.5.5 con `httpfs` y `spatial`, en S3
   anónimo de `us-west-2`. De `theme=places/type=place` y de `theme=addresses/type=address` se
   bajaron las filas cuya `bbox` toca la caja amplia de Bolivia (-69,70 a -57,40 de longitud y
   -22,95 a -9,60 de latitud): 170.199 places y 1.238.591 direcciones. De
   `theme=divisions/type=division_area` se bajaron las 5.748 áreas con `country = 'BO'`. Se bajó
   también la caja de places de la `2026-09-23.0` (161.684 filas) para la comparación. La hora
   de descarga va en `retrieved_at` (2026-10-27T22:39:39Z).
2. **Recorte por país** (`scripts/process.py`). Se recortó con el polígono `subtype = 'country'`
   de las divisiones de Overture de la misma entrega: 45.986 vértices, `class = land`. La caja
   solo sirvió para leer menos. El punto en polígono se calculó con shapely 2.1
   (`contains_xy`).
3. **Municipio y departamento.** El municipio sale de COD-AB Bolivia v02, adm3 (339
   municipios, OCHA/HDX, CC BY-IGO), la misma capa que usa
   `scripts/places/assign_place_municipality.py`. El nombre es el del catálogo del repositorio
   (`scripts/places/catalogue/bolivia-municipalities.json`), unido por código. Hubo tres casos:
   - 106.438 puntos caen dentro de un municipio (`location_method = poligono_cod_ab`);
   - 71 caen fuera de todos, pero hay uno a menos de 0,03° (unos 3 km), que se asigna
     (`cod_ab_mas_cercano_3km`);
   - 20 no tienen municipio a esa distancia, casi todos en el lago Titicaca.

   El `department` es el de COD-AB y, si falta, el de la región de Overture
   (`department_overture`, `department_iso`). Las dos capas difieren en 44 puntos, todos en el
   borde entre departamentos.

4. **Normalización.** Las columnas comunes son `source = overture_places`, `source_id` (el id
   GERS de Overture), `name`, `category_raw`, `address`, `locality`, `municipality`,
   `department`, `lat`, `lon`, `phone`, `website`, `hours`, `source_updated_at`, `source_url`,
   `retrieved_at` y `raw`. Algunas reglas:
   - `address` y `locality` son lo que declara la fuente. Se vacían `''`, «Unnamed Road» (525
     filas) y `<<not-applicable>>`.
   - `phone` y `website` son el primer elemento de la lista. Las listas completas van en
     `phones`, `websites`, `socials` y `emails`.
   - `source_updated_at` es el `update_time` más reciente de las fuentes de origen. No cuenta la
     fila «Overture / confidence_calculation».
   - `source_url` apunta al conjunto en S3 de la entrega, porque Overture no publica una página
     por lugar. El registro se identifica por `source_id`. El `record_id` de Meta, que es el id
     de la página de Facebook, va en `sources`.
   - `raw` es la fila original completa sin la geometría. La `bbox` va incluida.

   Además van `confidence`, `category_hierarchy`, `category_alternates`, `basic_category`,
   `declared_region`, `declared_postcode`, `declared_country`, `addresses`, `brand_name`,
   `brand_wikidata`, `operating_status`, `sources`, `source_datasets`, `municipality_code`
   (código INE de 6 dígitos), `province`, `location_method`, `release` y `compare_prev`.

5. **Comparación con 2026-09-23.0.** Las dos entregas se recortan con el mismo polígono. Dos
   lugares son el mismo si tienen el mismo id, o si tienen el mismo nombre normalizado y están a
   menos de 150 m (haversine). El nombre se normaliza en minúsculas, sin tildes y con todo lo
   que no es letra ni número convertido en un espacio. Para cada lugar actual se elige como par
   el del mismo id y, si no hay, el más cercano. En ese par se compara la dirección (freeform y
   localidad normalizadas), la categoría (`taxonomy.primary`) y el nombre. El resultado de cada
   fila va en `compare_prev`.

Coordenadas en WGS84 (OGC:CRS84), redondeadas a 7 decimales. El gzip es determinista
(`mtime = 0`) y las filas van ordenadas por `source_id`.

## Comparación con la entrega 2026-09-23.0

| Resultado                                                    |   Lugares |
| ------------------------------------------------------------ | --------: |
| En Bolivia en 2026-09-23.0                                   |   101.573 |
| En Bolivia en 2026-10-21.0                                   |   106.529 |
| Mismo id en las dos (`compare_prev.status = mismo_id`)       |   101.573 |
| Id nuevo, pero mismo nombre a < 150 m de uno que sigue       |        83 |
| **Nuevos por nombre y distancia** (`status = nuevo`)         | **4.873** |
| …de ellos con confianza ≥ 0,3                                |     3.476 |
| Desaparecidos (estaban en 2026-09-23.0 y no en 2026-10-21.0) |     **0** |
| Cambiaron de dirección                                       |     1.425 |
| Cambiaron de categoría                                       |     1.169 |
| Cambiaron de nombre, mismo id                                |       852 |

- **Esta vez los id no cambiaron.** Los 101.573 lugares de la 2026-09-23.0 siguen en la
  2026-10-21.0 con el mismo id (comprobado también sobre la caja entera: 0 ids faltantes). La
  rotación de id que se midió antes (3.954 de 4.281) no se repite entre estas dos entregas.
- Los 83 de id nuevo con un homónimo a menos de 150 m **no son el mismo lugar con otro id**,
  porque ese homónimo sigue en la entrega con su propio id. Son casi seguro duplicados que trae
  Meta. Con la regla de nombre y distancia no cuentan como nuevos. Si se cuenta por id, los
  nuevos serían 4.956.
- No se entrega el archivo de desaparecidos porque tendría 0 filas.

## Conteos por departamento

| Departamento |   Total | Confianza ≥ 0,3 | Nuevos |
| ------------ | ------: | --------------: | -----: |
| Santa Cruz   |  41.796 |          34.870 |  2.138 |
| La Paz       |  22.594 |          18.596 |  1.117 |
| Cochabamba   |  20.992 |          17.404 |    967 |
| Tarija       |   5.532 |           4.742 |    191 |
| Chuquisaca   |   4.992 |           4.319 |    162 |
| Potosí       |   3.719 |           3.378 |     72 |
| Oruro        |   3.602 |           3.139 |    106 |
| Beni         |   2.619 |           2.319 |     93 |
| Pando        |     683 |             599 |     27 |
| **Total**    | 106.529 |          89.366 |  4.873 |

## Conteos por confianza

| Confianza | Lugares | Nuevos |
| --------- | ------: | -----: |
| < 0,3     |  17.163 |  1.397 |
| 0,3-0,5   |  22.747 |  1.173 |
| 0,5-0,7   |  35.225 |  1.382 |
| ≥ 0,7     |  31.394 |    921 |

## Conteos por categoría

Hay 837 categorías distintas en `taxonomy.primary`. Por el primer nivel de la jerarquía:

| Nivel 1                   | Lugares |
| ------------------------- | ------: |
| services_and_business     |  20.856 |
| shopping                  |  18.602 |
| food_and_drink            |  15.553 |
| health_care               |   9.419 |
| cultural_and_historic     |   7.235 |
| lifestyle_services        |   6.037 |
| education                 |   5.822 |
| travel_and_transportation |   4.333 |
| (sin categoría)           |   4.312 |
| sports_and_recreation     |   3.766 |
| geographic_entities       |   2.957 |
| community_and_government  |   2.926 |
| lodging                   |   2.645 |
| arts_and_entertainment    |   2.066 |

Las 30 categorías más frecuentes:

| Categoría                        | Lugares |
| -------------------------------- | ------: |
| restaurant                       |   6.455 |
| (sin categoría)                  |   4.312 |
| historic_site                    |   3.947 |
| party_and_event_planning         |   2.415 |
| real_estate_service              |   2.147 |
| dental_clinic                    |   2.142 |
| beauty_salon                     |   2.045 |
| geographic_entities              |   1.870 |
| health_care                      |   1.845 |
| hotel                            |   1.840 |
| professional_service             |   1.839 |
| christian_place_of_worship       |   1.748 |
| clothing_store                   |   1.715 |
| education                        |   1.468 |
| school                           |   1.403 |
| spa                              |   1.314 |
| shopping                         |   1.262 |
| automotive_repair                |   1.240 |
| gym                              |   1.141 |
| hospital                         |   1.072 |
| grocery_store                    |   1.044 |
| building_or_construction_service |   1.039 |
| college_university               |   1.037 |
| fast_food_restaurant             |     931 |
| bar                              |     923 |
| social_or_community_service      |     891 |
| auto_parts_store                 |     838 |
| government_office                |     836 |
| pharmacy                         |     820 |
| shopping_mall                    |     796 |

Hay dos categorías que no son lo que dicen. Según `docs/runbooks/places-refresh-2026-09-24.md`,
`historic_site` (3.947) son sobre todo condominios y edificios, no patrimonio.
`geographic_entities` y `river` son rasgos geográficos. La entrega los conserva porque no
filtra; quien cargue debe decidir.

## Lo que faltó y por qué

- **Direcciones del tema `addresses`: Overture no tiene Bolivia.** En la caja amplia hay
  1.238.591 direcciones: 1.194.752 de BR y 43.839 de CL. Ninguna tiene `country = BO`, y solo
  2 caen dentro del polígono, ambas en la frontera y etiquetadas con otro país. Por eso no se
  entrega archivo de direcciones y no se pudo dar dirección a los 16.488 lugares que no la
  traen. Esa dirección tendrá que salir de OpenStreetMap u otra fuente.
- **`categories.primary` y `categories.alternate` ya no existen en el esquema.** Las dos
  entregas solo traen `taxonomy`, con `primary`, `hierarchy` y `alternates`, y
  `basic_category`. Se entregan esos campos; `category_raw` es `taxonomy.primary`.
  `alternates` viene casi siempre nulo.
- **`hours`: Overture no publica horarios.** Va nulo en todas las filas.
- **`operating_status`:** solo 162 filas lo traen, y todas dicen `open`. Overture no marca los
  cierres, así que la confianza sigue siendo la única señal de vigencia.
- **`source_url`:** no hay página pública por lugar. Ver Método, paso 4.
- **20 lugares sin municipio:** caen dentro de Bolivia pero a más de 3 km de cualquier
  municipio COD-AB, casi todos en el agua del Titicaca. Tienen departamento.
- **La capa de municipios es de 2013.** Los municipios creados después caen en el municipio
  del que salieron, como en el resto del corpus.

## Reproducir

```sh
python -P scripts/download.py <dir> 2026-10-21.0:divisions 2026-10-21.0:places \
  2026-10-21.0:addresses 2026-09-23.0:places
# bol_admin3.geojson sale de https://data.humdata.org/dataset/cod-ab-bol (bol_admin_boundaries.geojson.zip)
python -P scripts/process.py <dir> <dir_codab> scripts/places/catalogue/bolivia-municipalities.json <salida>
```

Licencias: los places de Overture se publican bajo CDLA-Permissive-2.0 (las fuentes van en
`sources[].license`). COD-AB se publica bajo CC BY-IGO.
