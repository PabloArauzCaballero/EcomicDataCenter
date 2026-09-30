# Salud de Foursquare Open Source Places (2026-09-28)

Segunda vuelta del pedido «faltan muchas farmacias, hospitales y más de salud». Después de la
carga del SNIS y AGEMED (`snis-health-load.md`) las fuentes abiertas estaban agotadas — medido:
OpenStreetMap deja 117 lugares de salud con nombre sin cargar, y de los 4.281 de Overture
2026-09-23.0 que no están por identificador, **3.954 son el mismo lugar ya cargado con otro id**
(mismo nombre a menos de 150 m). Foursquare era la única fuente grande que faltaba.

## Cómo se obtuvo

`foursquare/fsq-os-places` en Hugging Face (Apache-2.0) está restringido: hace falta un token de
una cuenta que haya aceptado las condiciones del dataset. El bucket público
`fsq-os-places-us-east-1` ya solo tiene `LICENSE.txt`. Con el token en `HF_TOKEN`:

```python
con.execute("CREATE SECRET hf (TYPE HUGGINGFACE, TOKEN '<token>')")
con.execute("COPY (SELECT * FROM read_parquet('hf://datasets/foursquare/fsq-os-places/release/"
            "dt=2026-09-15/places/parquet/places_000025.parquet') WHERE country = 'BO') TO ...")
```

Son 100 archivos (11,6 GB); Bolivia está entera en `places_000025`, `000026` y `000030`:
**36.706 lugares**, de ellos unos 1.600 de salud. El 70 % no se actualiza desde antes de 2020.

## Qué entra: 835 lugares

`python scripts/places/build_fsq_health_poi_seed.py --extract fsq_bolivia_2026-09-15.parquet
--adm0 bol_admin0.geojson --retrieved 2026-09-28T02:30:00Z`

| Descartado | Filas | Por qué |
| --- | --- | --- |
| Ya en el corpus | 737 | mismo nombre a < 150 m, o nombre parecido a < 20 m |
| Viejo y el nombre no dice qué es | 301 | sin actualizar desde antes de 2020 y sin «farmacia», «clínica»… en el nombre: así caen los lugares de broma («Torturolandia» como centro médico) |
| Cerrado o marcado por Foursquare | 45 | `date_closed`, o `closed`/`doesnt_exist`/`duplicate`/`privatevenue`/`inappropriate` |
| Nombre de persona sola | 37 | regla de las cargas de salud |
| Nombre genérico | 27 | «Dentista», «Consultorio Odontológico» no nombran ningún local |
| Ficha repetida en Foursquare | 6 | queda la actualizada más tarde |

Los **585 que nadie actualiza desde antes de 2020** entran con
`dataLevel = DIRECTORIO_COLABORATIVO_SIN_ACTUALIZAR`, y el tablero los marca «Confianza baja»
igual que a Overture bajo 0,5 — decisión del usuario del 2026-09-28 («todo, marcado»). Los
contactos no viajan. La familia sale de la categoría de Foursquare, solo hacia familias que el
catálogo ya tenía. La localidad la pone el polígono (`assign_place_municipality.py`).

## Segunda parte: el resto de Foursquare (11.540 lugares)

`python scripts/places/build_fsq_poi_seed.py --extract fsq_bolivia_2026-09-15.parquet --adm0 bol_admin0.geojson --retrieved 2026-09-28T03:30:00Z`
→ `bolivia-fsq-poi`. Mismas reglas de calidad que salud; lo nuevo es la familia, que se decide
**por voto del corpus** (188 categorías) y un mapa escrito para las frecuentes sin voto claro.

| Descartado | Filas |
| --- | --- |
| Categoría sin familia decidible | 8.079 |
| No es un establecimiento (calles, barrios, casas, eventos, «Oficina») o es salud | 8.062 |
| Ya en el corpus | 6.625 |
| Cubierto por un registro oficial (bancos y cajeros: ASFI; colegios: SIE; pistas y puertas de aeropuerto) | 1.024 |
| Cerrado o marcado por Foursquare | 883 |
| Nombre genérico o de una casa | 359 |
| Ficha repetida / fuera de Bolivia | 82 / 52 |

8.706 de los 11.540 no se actualizan desde antes de 2020 y entran marcados. La construcción es
determinista (dos corridas, mismos bytes).
