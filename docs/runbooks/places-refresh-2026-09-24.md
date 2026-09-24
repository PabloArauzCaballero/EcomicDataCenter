# Ampliación de lugares del 2026-09-24: Overture, OpenStreetMap, ASFI y municipio por polígono

Pedido del usuario: «más datos para Santa Cruz, hay muy pocos», con la meta de
llegar a 200.000 lugares. Esta carga suma **51.690 lugares** y da municipio a
**50.811** que ya estaban cargados sin localidad. El corpus pasa de 123.759 a
**175.449**.

## Lo que hay que saber antes de tocar nada

**Santa Cruz no estaba flaca: estaba archivada en otro sitio.** Medido el
2026-09-24, en «Sin localidad declarada» había 8.039 lugares dentro del área de
Santa Cruz, entre ellos 593 cajeros, 241 bancos y 893 restaurantes. OpenStreetMap,
la ANH y Tel.bo no publican localidad. La migración **0084** une ahora a cada lugar
el municipio en el que caen sus coordenadas (`PLACE_MUNICIPALITY`). Solo lo hace
cuando la fuente no declaró uno: la localidad declarada siempre gana.

| Fuente | Nuevos | Techo medido en Bolivia |
| --- | ---: | --- |
| Overture 2026-09-23.0, confianza ≥ 0,3 | 35.463 | 101.529 lugares; 52.198 no estaban cargados |
| ASFI, puntos de atención financiera | 12.155 | 14.136 con coordenadas |
| OpenStreetMap, barrido completo | 4.072 | 61.140 con nombre; 88 % ya estaban cargados |
| Foursquare OS Places | 0 | bloqueado: pide cuenta y aceptar términos (ver abajo) |

- **Overture entre 0,3 y 0,5 es de confianza baja, y así se muestra.** Son 19.282
  filas, casi todas páginas de Facebook, marcadas con `confianza_overture_baja_0_3_a_0_5`.
  El tablero las resalta en la tabla (`src/lib/place-confidence.ts`). Bajar el corte a
  0,3 lo decidió el usuario para acercarse a 200.000. El escalón natural del
  histograma está en 0,5.
- **La ASFI manda en cajeros y oficinas.** Por eso el barrido de OpenStreetMap no
  carga `amenity=atm`. Los datos de la ASFI no tienen licencia abierta declarada, así
  que van en su propia carpeta, como SEPREC. Sus 6.950 corresponsales usan la familia
  nueva `CORRESPONSAL_FINANCIERO`: son comercios que atienden a nombre de un banco,
  no agencias.
- **La capa de municipios es de 2013** (COD-AB v02, CC BY-IGO). Los municipios
  creados después caen en el municipio del que salieron. Concordancia con las 73.957
  localidades declaradas: 97,5 %.
- 921 lugares de `bolivia-transport-poi` están **fuera de Bolivia**: esa carga se hizo
  por caja y no por país. Siguen cargados y la vista los marca con `outside_country`.
- Seis nombres de municipio se repiten entre departamentos (San Javier, San Pedro…).
  En esos casos el tablero agrupa por nombre y los mezcla. La vista trae
  `municipality_code` para desambiguarlos.

## Procedimiento

Los extractos crudos se guardaron fuera del repositorio, con un `manifiesto.json`
que registra la URL, la hora y el SHA-256 de cada archivo.

```sh
python scripts/places/build_overture_refresh_seed.py --candidates <ov>/candidatos.ndjson \
  --release-parquet <ov>/crudo/places_bbox_bolivia_2026-09-23.0.parquet \
  --previous-parquet <ov>/crudo/places_bbox_bolivia_2026-08-19.0.parquet
python scripts/places/build_osm_sweep_seed.py --candidates <osm>/candidatos.ndjson --pbf <osm>/crudo/bolivia-latest.osm.pbf
python scripts/places/build_asfi_poi_seed.py --candidates <asfi>/candidatos.ndjson \
  --correspondents <asfi>/candidatos-corresponsales.ndjson \
  --api <asfi>/crudo/asfi-puntosAtencion-fecha-2009-07-01.json --retrieved 2026-09-24T14:56:49Z
# Siempre al final: asigna municipio a TODO lo que no declara localidad, incluido lo recién construido.
python scripts/places/assign_place_municipality.py --adm3 bol_admin3.geojson --adm0 bol_admin0.geojson \
  --retrieved-at 2026-09-24T14:52:00Z
yarn db:seed:boot --only=bolivia-national-poi
```

El constructor de Overture da los mismos bytes si se corre dos veces (comprobado).
Sus propias piezas no votan en la clasificación. Si votaran, una segunda
construcción reclasificaría filas que ya están cargadas. El cargador es idempotente
por huella: una fila reclasificada no reemplaza a la anterior, entra como segunda
fila al lado.

Probado en un Postgres desechable con los roles del CI: migración 0084, dos
siembras seguidas y la segunda no añade filas.

## Foursquare, pendiente del usuario

El bucket S3 público ya no trae los parquet. El acceso actual es por Hugging Face
(`foursquare/fsq-os-places`, restringido) o por el Places Portal (pide cuenta). La
licencia, Apache-2.0, permite redistribuir. El bloqueo es solo el acceso: hace falta
un token `HF_TOKEN` del usuario. El formulario incluye una cláusula que autoriza a
usar el nombre y el logo de su empleador, y aceptarla le corresponde al usuario.
