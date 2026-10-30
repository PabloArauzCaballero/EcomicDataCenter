# Carga de lugares del barrido del 2026-10-27

Las entregas viven en las ramas `datos/2026-10-27-*` (cada una con `README.md` y `manifest.json`
con el sha256 de cada archivo). Esta carga suma **8.429 lugares** al corpus nacional
(`nationalPlace`), en seis carpetas nuevas del paquete `bolivia-national-poi` (versión 1.10.0), y da
municipio por polígono a los 1.356 que no declaran localidad.

| Carpeta | Lugares | De dónde |
| --- | ---: | --- |
| `bolivia-overture-2610-poi` | 2.690 | Overture 2026-10-21.0: de los 4.873 nuevos frente a 2026-09-23.0, los de confianza ≥ 0,3 que no estaban por nombre a < 150 m |
| `bolivia-osm-2610-poi` | 389 | Extracto de Geofabrik del 26-oct: objetos sin cargar, solo de etiquetas que el corpus ya archivó con una familia clara |
| `bolivia-official-2610-poi` | 1.143 | Oficinas del Estado (SEGIP, SIN, Aduana, ABC, ENTEL, Correos…), mercados de La Paz, aeropuertos de NAABOL, 103 estaciones de GNV y 7 de líquidos de la ANH, 682 puntos nuevos de la ASFI |
| `bolivia-yango-poi` | 1.365 | Catálogo público de Yango Deli (restaurantes y tiendas) |
| `bolivia-facebook-poi` | 197 | Páginas públicas de comercios con ubicación declarada |
| `bolivia-geoportal-poi` | 2.645 | GAMLP (guía turística, farmacias, supermercados, hospedajes) y Guía Urbana del GAMSCS |

## Reglas

- **Dedup antes de cargar, nunca fusión.** Cada carpeta se cruza con todo lo guardado y con las
  carpetas anteriores de la lista: por identificador y por nombre (mismas palabras) a menos de
  150 m. Lo que comparte alguna palabra a menos de 60 m entra marcado con `resemblesHeldPlace`.
  Lo descartado por parecido queda en `artifacts/<carpeta>-ya-guardados.json` (no versionado).
- **La familia sale del catálogo existente**: Overture y OSM por voto de los lugares ya cargados
  con la misma categoría (como `build_overture_refresh_seed.py`); el resto por tabla escrita en el
  constructor. Lo que no tiene familia no entra.
- **Privacidad**: ningún teléfono ni correo (los de Overture y Facebook son a menudo personales), ni
  vendedor legal ni NIT de Yango, ni las actividades de la ANH que son personas (instaladores de
  gas, puestos de garrafas). Facebook descarta «Negocio local», «Emprendedor(a)», creadores, etc.
- Facebook sin publicar desde antes de 2024 entra como `DIRECTORIO_COLABORATIVO_SIN_ACTUALIZAR`
  y el tablero lo marca «Confianza baja».

## Lo que NO se cargó y por qué

- **Directorios** (Páginas Amarillas 3.541, boliviaempresas 964, CADECOCRUZ 72): no traen
  coordenadas, y el corpus de lugares exige punto.
- **PedidosYa** (archivo de Wayback) y **Uber Eats** (2020): no es oferta vigente.
- **GAMLP `sit:restaurantes`** (2.747, padrón de actividades económicas): la razón social es a
  menudo el nombre de una persona; hace falta una regla para unipersonales antes de publicarlo.
- **Tiendas de barrio y consultorios dentales** de la Guía Urbana, **puntos de venta del doble
  aguinaldo** (2019, con nombres de personas), casas de acogida y centros de drogodependientes.
- Números de puerta, puestos de venta sin nombre, toponimia, edificios y Wikidata (rasgos naturales).

## Reconstruir

```sh
# <d> = el contenido de las ramas datos/2026-10-27-* (git show rama:ruta > <d>/ruta)
python scripts/places/build_oct27_places_seeds.py --deliveries <d>/deliveries/2026-10-27 all
# Siempre al final, con la misma capa y la misma fecha que la asignación anterior:
python scripts/places/assign_place_municipality.py --adm3 bol_admin3.geojson --adm0 bol_admin0.geojson \
  --retrieved-at 2026-09-24T14:52:00Z
```

Comprobado al construir: las 64.161 asignaciones de municipio anteriores salen idénticas (0
cambiadas, 0 desaparecidas) y las seis carpetas pasan el esquema `bolivia-national-poi-v3`.
Verificar tras desplegar: `nationalPlace` en `/api/readers` debe subir en 8.429 en cada servidor.

## Segunda tanda (2026-10-30): 899 más, paquete 1.11.0

| Carpeta | Lugares | De dónde |
| --- | ---: | --- |
| `bolivia-facebook-nacional-poi` | 31 | Lector nacional de páginas de Facebook (`C:/wt/fb-nacional`), lo leído hasta el corte; entrega `datos/2026-10-30-facebook-nacional` |
| `bolivia-gamlp-restaurant-poi` | 868 | Padrón de restaurantes del GAMLP (`sit:restaurantes`), solo nombres comerciales |

- **Regla para el padrón del GAMLP** (antes fuera por la razón social de los unipersonales): entra
  solo lo que se llama con un nombre comercial —palabra del rubro, forma societaria o nombre entre
  comillas— y no lleva ningún nombre de pila (`GIVEN_NAMES` en el constructor). Quedan fuera 1.601
  de 2.747. Se prefiere perder un local a publicar a una persona.
- **Teléfonos dentro de la dirección**: el padrón y algunas páginas los escriben en el texto.
  `without_phones` los quita en estas dos carpetas. Seis filas de la primera tanda llevan un
  teléfono en el nombre o la dirección (4 de Overture, 1 de IBMETRO, 1 del GAMLP); no se reescriben
  aquí porque el cargador es idempotente por huella y una fila corregida entraría al lado de la vieja.
- La entrega de Facebook ya viaja sin teléfono, WhatsApp, `intro_items` ni `profile_id`, y solo con
  las categorías de `FACEBOOK_FAMILY` (85 de 150 páginas leídas bien).

```sh
python scripts/places/build_oct27_places_seeds.py --deliveries <d>/deliveries/2026-10-27 facebook_nacional gamlp_restaurants
```

Comprobado: las 65.517 asignaciones de municipio anteriores salen idénticas y `bolivia-facebook-poi`
no cambia al reconstruirla con el constructor nuevo. Tras desplegar, `nationalPlace` sube en 899.
