# Directorios comerciales y guías de cámaras: entrega del 2026-10-27

Lugares de Bolivia (solo empresas) sacados de directorios comerciales en línea y de los
directorios de socios que publican las cámaras empresariales. Google Maps queda fuera porque sus
términos prohíben este uso.

## Resultado

| Directorio | Fichas en Bolivia | Fichas bajadas | % con coordenadas | % con dirección | % con NIT | % con fecha |
|---|---:|---:|---:|---:|---:|---:|
| amarillas.bo (Páginas Amarillas de Bolivia) | 3.541 empresas únicas (4.660 pares rubro×empresa) | 3.541 (100 %) | 0 | 98,8 | 0 | 0 |
| boliviaempresas.com | 964 | 964 (100 %) | 0 | 17,0 | 0 | 100 (fecha de alta) |
| CADECOCRUZ (Cámara de la Construcción de Santa Cruz) | 72 | 72 (100 %) | 0 | 100 | 0 | 0 |
| **Total** | | **4.577** | | | | |

Teléfono comercial: amarillas.bo 47,1 %, boliviaempresas.com 49,6 % y CADECOCRUZ 100 %.
Departamento: 100 % en las tres.

**amarillas.bo: faltan algunas páginas de empresa.** Las 3.541 empresas tienen nombre, rubros,
departamento y, en el 98,8 %, dirección y zona. El teléfono y la web solo vienen en la página de
cada empresa, y en este corte se leyeron 2.811 de 3.541 (79 %). Las demás todavía no tienen
teléfono; `raw.company_page_fetched = false` las marca. Ese recorrido es reanudable (ver «Cómo
reanudar»).

«Fichas en Bolivia» es lo que el propio sitio publica, no lo que dice su publicidad. En
boliviaempresas.com, por ejemplo, el título promete «+50.000 empresas» y su API pública devuelve
964.

Ninguna fuente publica NIT ni matrícula, así que el campo `nit` no aparece en ningún archivo. El
cruce con el SEPREC tendrá que hacerse por nombre: las fichas de boliviaempresas copian el objeto
social del SEPREC en `raw.description`, lo que ayuda a desempatar.

## Archivos

Cada directorio tiene su carpeta con un `<directorio>.ndjson.gz` (UTF-8, una ficha por línea,
saltos LF). `manifest.json` lista cada archivo de datos con su sha256, su tamaño y su número de
filas. `scripts/` trae los recolectores que produjeron estos archivos (Python con `requests`, sin
navegador).

Campos comunes: `source`, `source_id`, `name`, `category_raw`, `address`, `locality`,
`municipality`, `department`, `lat`, `lon`, `phone`, `website`, `hours`, `source_updated_at`,
`source_url`, `retrieved_at` y `raw`, que conserva la ficha original sin el correo electrónico.
`municipality` va siempre vacío porque ninguna fuente lo da. Hay que asignarlo por polígono
(`assign_place_municipality.py`) cuando se tengan coordenadas, o por localidad.

## Cómo se trató cada fuente

### amarillas.bo (Páginas Amarillas de Bolivia)

- El `robots.txt` solo cierra recursos estáticos (`/js/`, `/img/`, `/css/`…). Se trabaja con un
  solo hilo y una pausa de 1 a 1,8 s entre peticiones.
- La lista completa de empresas sale de las 26 páginas de rubros por letra (584 rubros) y de cada
  rubro con su paginación: son 3.541 slugs únicos. «Fichas en Bolivia» es esa cifra. La suma de
  los contadores de los rubros da 4.660 porque cuenta dos veces la empresa que figura en más de un
  rubro.
- Se combinan dos vías.
  - **Listados** (`c_amarillas_list.py`): cada tarjeta de rubro da nombre, eslogan, rubros,
    dirección completa (en el atributo `title`), zona o barrio y ciudad. No trae teléfono.
  - **Página de empresa** (`c_amarillas.py`): el microdato `schema.org/LocalBusiness` agrega el
    teléfono, el celular y la página web.
  - `amarillas_post.py` las une: la base son las tarjetas y encima van las páginas de empresa ya
    leídas. `raw.company_page_fetched` dice si una ficha tiene página de empresa.
- No hay coordenadas. Los marcadores del mapa se cargan desde `/js/`, que el `robots.txt` cierra,
  y el HTML no las trae. Ninguna ficha publica fecha de actualización.
- El sitio rotula la ciudad con el nombre del departamento («La Paz», «Santa Cruz»…). Por eso
  `department` sale de ahí y `locality` queda vacía, salvo para Sucre, que se asigna a
  Chuquisaca. La zona o barrio va en `raw.zona`.
- Cuando una ficha trae varios teléfonos («5254323 - 5248417 - …»), `phone` guarda el primero.

### Cómo reanudar amarillas.bo

Los avances se guardan en `work/amarillas/` del recolector:

- `slugs.json`: los 3.541 slugs.
- `list_done_rubros.txt` y `list_cards.ndjson`: los rubros ya recorridos y sus tarjetas.
- `records.ndjson`: las páginas de empresa ya leídas.

`python c_amarillas_list.py` sigue por los rubros que faltan y `python c_amarillas.py` por las
empresas que faltan. Después, `python amarillas_post.py` y `python package.py <destino>`
regeneran el archivo y el manifiesto. Antes de cada lote, `common.wait_for_ram()` espera mientras
haya menos de 800.000 KB libres.

### boliviaempresas.com

- Es un WordPress con el plugin Directorist. Se leyó su API REST pública
  `/wp-json/directorist/v1/listings` (10 páginas de 100 fichas), que el `robots.txt` no prohíbe.
- Ninguna ficha trae coordenadas. La dirección aparece en el 17 % y el departamento sale de la
  ubicación de Directorist.
- `source_updated_at` es la fecha de alta de la ficha (`date_created_gmt`). No se usa
  `date_modified` porque el cron de vencimiento del plugin la reescribe todos los días.
- Hay exactamente 100 fichas por departamento, salvo Santa Cruz con 164. Parece una muestra del
  SEPREC, no un directorio completo.

### CADECOCRUZ (Cámara de la Construcción de Santa Cruz)

- La tabla pública de asociados (`index.php?op=5`) da nombre, tipo societario, dirección y
  teléfono. El sitio no tiene `robots.txt` y se bajó con una sola petición.
- La localidad se infiere de la dirección. Por defecto se asigna Santa Cruz de la Sierra, salvo
  que la dirección nombre Yacuiba, Tarija, La Paz o Warnes. La marca está en
  `raw.locality_inferred`.

## Privacidad

- Solo se guardan empresas. Cuando el nombre de la ficha parece el de una persona natural
  (unipersonales inscritas a nombre del titular), el teléfono no se guarda ni en `phone` ni en
  `raw`, y la ficha queda marcada con `raw.owner_looks_like_person = true`. El criterio es una
  heurística deliberadamente conservadora (`looks_like_person` en `scripts/common.py`): ante la duda,
  descarta el teléfono.
- No se guarda ningún correo electrónico. En estas fuentes suelen ser casillas personales del
  titular.

## Fuentes evaluadas sin datos que bajar

| Fuente | Qué se encontró |
|---|---|
| Guía Telefónica de Bolivia | `guiatelefonica.com.bo` y `paginasamarillas.com.bo`/`.bo` no resuelven en DNS. La guía en línea vigente es amarillas.bo. |
| Cylex | No tiene edición boliviana: `cylex.com.bo`, `cylex-bolivia.com` y `cylex-bo.com` no resuelven, y `bo.cylex.com` falla el TLS. |
| Infobel | `infobel.com/es/bolivia` redirige al índice mundial, sin Bolivia. Infobel Pro vende la base y no es un directorio público. |
| bolivia-empresas.com | No resuelve en DNS. |
| Guía de Negocios | No se encontró ningún dominio (`guianegocios.com.bo`, `guiadenegocios.com.bo` y `.bo` no resuelven). |
| Hotfrog | No tiene edición boliviana (`hotfrog.com/bo` da 404 y `hotfrog.com.bo` no resuelve). |
| Yelu | No tiene edición boliviana (`yelu.com.bo` y `yelu.bo` no resuelven). |
| Bolivia.com | Es un portal de noticias. Su sitemap solo cubre secciones editoriales y no tiene guía de empresas. |
| Encuentra24 | No opera en Bolivia: su `robots.txt` no menciona ningún mercado boliviano y `/bolivia-es/` devuelve el desafío de Cloudflare. |
| directoriobolivia.com | Tiene una sola ficha publicada, de demostración. |
| bo.all.biz | Es un catálogo de productos con unas 10 fichas de servicios y sin empresas con dirección. |
| Cybo / bo.todosnegocios.com | Exigen pasar un control antibot («Quick security check» o Cloudflare). No se intentó, porque la regla es no pasar captchas. |
| findglocal.com/BO | Agrega páginas de Facebook y mezcla empresas con personas. No es un directorio comercial y no se recorrió. |
| bo.kompass.com | Exige iniciar sesión. |
| CAINCO | No publica un directorio de socios: el tipo `ova_dir` está vacío y `/socios/` y `/directorio-de-socios/` redirigen a la portada. |
| Cámara Nacional de Comercio (cnc.bo) | Solo tiene páginas de afiliación y membresía, sin lista de socios. |
| Cámara Nacional de Industrias | `cnibolivia.com` responde 403 por HTTP y tiene el certificado inválido por HTTPS. |
| CADEX | El sitio tiene 4 páginas y ninguna lista de socios. |
| CAMIPA | `camipa.org` es la Cámara Minera de Panamá. No se encontró ninguna CAMIPA boliviana. |
| Cámara de Comercio de Cochabamba (hoy ICAM) | Se fusionó en ICAM en 2020. La página `icam.bo/business-directory/` muestra el shortcode `[businessdirectory]` sin procesar porque el plugin está apagado, y no hay ruta REST con fichas. |
| Cámara de Industria y Comercio de Tarija (CAINCOTAR) | `caincotar.com.bo/directorio/` está detrás de la verificación antibot de Imunify360, que necesita navegador. No se intentó por el límite de memoria de la máquina. |
| Cámara Boliviana de la Construcción (CABOCO) | Solo lista las cámaras departamentales asociadas, no empresas. |
| Cámaras de hotelería | No se encontró ningún sitio en línea de la Cámara Boliviana de Hotelería ni de la Cámara Hotelera de Santa Cruz. |
| Farmacias | No se encontró ningún sitio de una cámara de farmacias. CIFABOL (industria farmacéutica) lista 17 laboratorios solo por nombre, sin dirección, así que no sirve como fuente de lugares. |
