# Lugares desde apps y webs de delivery — entrega 2026-10-27

Uno de los 12 carriles de recolección de lugares de Bolivia. Fuente de este carril: plataformas de
delivery y pedidos. Sin cuentas, sin pedidos y sin captchas resueltos.

## Qué hay

| archivo | plataforma | vigencia del dato | registros | con lat/lon |
|---|---|---|---|---|
| `yango.ndjson.gz` | Yango Food / Yango Deli (food.yango.com) | **en vivo, 27-oct-2026** | 2.220 | 2.220 (100.0 %) |
| `pedidosya.ndjson.gz` | PedidosYa | **mixta**: 2019-2025 archivada + 79 vistas hoy sin coordenadas | 1.494 | 1.415 (94.7 %) |
| `ubereats.ndjson.gz` | Uber Eats Bolivia (cerró; la web responde 410) | archivada 2020-2021 | 350 | 101 (28.9 %) |
| **total** | | | 4.064 | 3.736 (91.9 %) |

`stats.json` trae los conteos por municipio, categoría y año; `manifest.json`, los sha256.

**Advertencia de vigencia.** Solo Yango es un listado actual. Lo de PedidosYa y Uber Eats sale del
Internet Archive (Wayback Machine) y vale como «este local existió y operaba en delivery en esa
fecha»: el campo `source_updated_at` es la fecha de la captura y `raw.last_seen` la última vez que
se vio. No usarlo como padrón vigente sin cruzarlo con otra fuente.

## Formato

NDJSON comprimido con gzip, un local por línea, con los campos comunes de los 12 agentes:
`source`, `source_id`, `name`, `category_raw`, `address`, `locality`, `municipality`,
`department`, `lat`, `lon`, `phone`, `website`, `hours`, `source_updated_at`, `source_url`,
`retrieved_at`, `raw`, `rating`, `reviews`, `chain`.

Coordenadas fuera del rectángulo de Bolivia se anulan. `municipality`/`department` salen de la
ciudad que declara la plataforma (no de un cruce espacial): en el borde La Paz/El Alto o
Cochabamba/Sacaba/Quillacollo puede haber errores; con `lat/lon` se puede recalcular.

### Por plataforma

**Yango** (`source=yango`) — `source_id` es el id numérico del local; `chain` es el `brand.slug`
de Yango (marca: todas las sucursales de una marca lo comparten); `category_raw` = vertical
(`restaurant`/`shop`) + las etiquetas de cocina de la ficha (`tags`: Pollo, Salteña, Helado…); `address` = dos últimos componentes de la dirección geocodificada y
`raw.address_short` la completa (sale del geocodificador de Yandex: a veces mezcla inglés y ruso,
p. ej. «Department of Cochabamba» o «Боливия»; la dirección que declaró el vendedor está en
`raw.footer`); `locality` = distrito municipal cuando viene. En `raw`:
`legal_seller` y `nit` (el pie del local trae «Contratista (vendedor) NOMBRE … INN NIT»; INN es
el NIT), `footer` completo, `available_now`, `min_order_bs`, `price_category`, `shared_link`.
`hours` es el «Horario de oficina» del vendedor cuando está. Rating y número de reseñas solo
cuando el local tiene suficientes calificaciones (la mayoría dice «Pocas clasificaciones»).

**PedidosYa** (`source=pedidosya`) — `source_id` es el id numérico de PedidosYa (estable desde
2019: el mismo espacio de ids que usa la web actual). Dos vías en `raw.via`:
- `wayback`: listados por ciudad/barrio/cocina y fichas de local capturados por el Internet
  Archive. Traen nombre, dirección, lat/lon (4 decimales en 2019), cocinas, rating y número de
  opiniones, estado abierto/cerrado; las capturas 2020+ añaden teléfono, razón social de
  facturación (`raw.company`), horarios y `state` (`DELETED` = dado de baja).
- `home_lazy_load`: los locales que la portada pública mostró hoy (consulta por defecto en
  Santa Cruz, -17.78335/-63.1821): nombre, id, URL, tipo de negocio, rating, estado y distancia
  al punto de consulta. Sin dirección ni coordenadas; si el id estaba archivado,
  `raw.archived_match` trae la última ubicación conocida (no se copia a `lat/lon` para no mezclar
  vigencias).
`chain` = prefijo antes de « - » cuando lo comparten ≥2 locales (sucursal en `raw.branch`).

**Uber Eats** (`source=ubereats`) — `wayback`: fichas con JSON-LD `Restaurant` (dirección,
geo, teléfono, cocina, horario). `wayback_link_only`: locales que solo aparecen enlazados desde
listados archivados; el nombre sale del slug (`raw.name_from_slug=true`), sin ubicación.

## Método y endpoints

1. **Yango Food** (operador Yango/Yandex; cubre Santa Cruz, Cochabamba y La Paz; en El Alto,
   Sucre, Tarija, Oruro, Potosí, Trinidad y Montero el catálogo responde vacío).
   - `POST https://food.yango.com/eats/v1/layout-constructor/v1/layout` con
     `{"location":{"latitude":…,"longitude":…},"order_mode":"default"}` y las cabeceras de la web
     (`x-device-id` aleatorio, `x-platform: yango_desktop_web`). Es la llamada «cerca de ti» de
     la portada. Se recorrió una grilla de 2,5 km sobre cada ciudad y una segunda grilla
     desplazada 1,25 km (361 puntos) y se juntaron los slugs.
   - `GET https://food.yango.com/api/v2/catalog/{slug}?latitude=…&longitude=…` por local:
     ficha con id, marca, dirección geocodificada, lat/lon, rating, pie legal.
   - `scripts/yango_collect.py grid|detail` (reanudable; ~1 petición/s).
2. **PedidosYa** — ver «Bloqueos». Lo público sin desafío fue la portada
   (`GET /` y su XHR `/home-page/v44/home/lazy_load?country_id=17&area_id=36503&lat=…&lng=…`),
   capturada una vez. El histórico sale de la CDX API del Internet Archive
   (`https://web.archive.org/cdx/search/cdx?url=pedidosya.com.bo/restaurantes&matchType=prefix`,
   1.355 capturas distintas por digest, más `/cadenas` y `/restaurant-menu`) descargadas en crudo
   (`/web/{ts}id_/{url}`). `scripts/wayback_fetch.py`, `scripts/parse_pya_wayback.py`.
3. **Uber Eats Bolivia** — CDX de `ubereats.com/bo*` (234 capturas de `bo-en/santa-cruz`,
   `bo-en/la-paz`, categorías y «near-me»), JSON-LD de cada ficha.
4. `scripts/build.py` normaliza y escribe los `.ndjson.gz` y `stats.json`;
   `scripts/manifest.py` el manifiesto. Los crudos (≈220 MB) quedan fuera del repo (`_work/`).

## Conteos

Por municipio y plataforma (registros / con lat-lon):

| municipio | departamento | Yango | PedidosYa | Uber Eats | total |
|---|---|---|---|---|---|
| Santa Cruz de la Sierra | Santa Cruz | 1478 / 1478 | 783 / 704 | 320 / 77 | 2581 / 2259 |
| Cochabamba | Cochabamba | 565 / 565 | 281 / 281 | — | 846 / 846 |
| La Paz | La Paz | 177 / 177 | 390 / 390 | 30 / 24 | 597 / 591 |
| El Alto | La Paz | — | 35 / 35 | — | 35 / 35 |
| Sucre | Chuquisaca | — | 4 / 4 | — | 4 / 4 |
| Tarija | Tarija | — | 1 / 1 | — | 1 / 1 |

PedidosYa por año de la última captura: 2019: 1341, 2020: 27, 2021: 19, 2023: 18, 2024: 5, 2025: 5, 2026: 79.
PedidosYa con dirección: 1.403 (93.9 %); con rating: 1.112 (74.4 %).

Yango por vertical: restaurant: 2174, shop: 46.
Yango con NIT del vendedor: 2.220 (100.0 %); con cocina: 2.004 (90.3 %); con rating: 1.164 (52.4 %); marcas distintas: 1369.

## Bloqueos y lo que no se pudo

- **PedidosYa en vivo: bloqueado por PerimeterX.** La portada carga (200) pero cualquier otra
  página — `/restaurantes/{ciudad}`, `/restaurantes`, fichas `-menu`, `/cadenas`, `robots.txt`,
  `sitemap.xml` — y cualquier XHR posterior (incluida la misma `lazy_load` con otras
  coordenadas) devuelven 403 con la página «px-captcha». Con `curl` el 403 sale desde la
  portada. No se resolvió el captcha ni se intentó evadir la detección; por eso PedidosYa —la
  plataforma más grande del país— queda con histórico archivado y solo 79 locales vistos hoy.
  El sitemap archivado (feb-2023) confirma la cobertura de 30 ciudades: Santa Cruz, Cochabamba,
  La Paz, El Alto, Sacaba, Quillacollo, Warnes, Montero, Sucre, Oruro, Potosí, Tarija, Yacuiba,
  Villa Montes, Cobija, Trinidad, Riberalta, Guayaramerín, San Borja, Rurrenabaque, Santa Ana del
  Yacuma, San Andrés, Magdalena, Santa Rosa, Baures, San Ramón, Huacaraje, Loreto, Reyes y Puerto
  Siles; para casi todas ellas el Internet Archive no guardó listados.
- **El Internet Archive sesga a 2019** (la web era HTML del servidor; desde 2020 los listados se
  cargan por JavaScript y las capturas salen vacías) y a Santa Cruz/La Paz/Cochabamba.
- **Yaigo**: absorbida por Yummy (venezolana); `yaigoapp.com` ya no resuelve y Yummy no tiene
  catálogo web (solo app). En el archivo solo hay 1 ficha de comercio.
- **Uber Eats** salió de Bolivia (`/bo` responde 410 Gone).
- **Patio** (Patio Delivery Inc / Motoclick): solo app; sin dominio web con catálogo.
- **Toing**: la app con ese nombre en las tiendas es de India; no se halló operación en Bolivia.
- **Ahorita**, **TURBO** (`turbo.com.bo` es una página de imagen), **TaDa** (venta directa de
  Ambev, no lista locales), **elgenioX** (marketplace de vendedores sin ubicación física): sin
  locales con dirección que recoger.
- Yango: el catálogo web solo muestra lo que reparte en ese punto, así que locales fuera de las
  grillas o con zona de reparto pequeña pueden faltar; teléfono y web del local no se publican.
