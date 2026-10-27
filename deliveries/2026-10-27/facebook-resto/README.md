# Facebook — resto del país (2026-10-27)

Páginas de negocios en Facebook de **Cochabamba, Oruro, Potosí, Chuquisaca, Tarija, Beni y Pando**,
capitales y ciudades intermedias. La Paz y Santa Cruz las cubren otros agentes: las páginas que caen
allí se descartaron (ver «Excluidas»).

- Archivo: `facebook-resto.ndjson.gz` — NDJSON con gzip, un lugar por línea, 302 registros.
- Cifras completas: `stats.json`. Sumas de verificación: `manifest.json`.
- Código del recolector: `collector/` (Node 22 + Playwright sólo para el buscador).
- Generado: 2026-10-27T23:51:48.260Z.

## Resultado

Estados: OK 302.

| Departamento | Páginas | OK | lat/lon | Dirección | Teléfono | Web | Último post |
|---|---:|---:|---:|---:|---:|---:|---:|
| Cochabamba | 248 | 248 | 100 % | 81 % | 71 % | 48 % | 100 % |
| Oruro | 10 | 10 | 80 % | 70 % | 80 % | 10 % | 100 % |
| Potosí | 12 | 12 | 91,7 % | 75 % | 91,7 % | 58,3 % | 100 % |
| Chuquisaca | 11 | 11 | 90,9 % | 100 % | 90,9 % | 54,5 % | 100 % |
| Tarija | 11 | 11 | 63,6 % | 63,6 % | 72,7 % | 54,5 % | 100 % |
| Beni | 10 | 10 | 100 % | 70 % | 70 % | 50 % | 100 % |
| Pando | 0 | 0 | — | — | — | — | — |
| **Total** | **302** | **302** | **97,4 %** | **80,1 %** | **72,8 %** | **47,7 %** | **100 %** |

- Coordenadas fijadas por la propia página en Facebook: 229 (75,8 %).
  El resto de las que tienen lat/lon (65) vienen del nodo de
  OpenStreetMap que enlaza la página (`raw.coords_source = "osm"`).
- Sobre las páginas OK: lat/lon 97.4 %, dirección 80.1 %, teléfono 72.8 %.
- Cómo se ubicó cada página (`raw.location_source`): `osm_coords` 49 · `coords` 229 · `city_text` 10 · `query` 6 · `address` 8.
  `coords` = coordenadas de la página; `address`/`city_text` = texto de la dirección o del área de servicio;
  `osm_coords` = coordenadas del nodo OSM; `query` = sin ubicación propia, se asignó la ciudad de la
  búsqueda que la trajo (dato más débil: revisar antes de usarlo como ubicación).
- Descubrimiento: osm 274 · yahoo 28. Candidatas: 1.404
  (256 del buscador, 1.151 de OSM); consultas hechas: 56.

### Por localidad (las 40 mayores)

| Departamento · localidad | Páginas |
|---|---:|
| Cochabamba · Cochabamba | 240 |
| Chuquisaca · Sucre | 10 |
| Oruro · Oruro | 10 |
| Tarija · Tarija | 9 |
| Potosí · Potosí | 8 |
| Beni · Trinidad | 7 |
| Cochabamba · Quillacollo | 3 |
| Potosí · Tupiza | 2 |
| Potosí · Uyuni | 2 |
| Beni · (sin localidad) | 1 |
| Beni · San Borja | 1 |
| Beni · Santa Ana del Yacuma | 1 |
| Chuquisaca · (sin localidad) | 1 |
| Cochabamba · Cliza | 1 |
| Cochabamba · Colcapirhua | 1 |
| Cochabamba · Ivirgarzama | 1 |
| Cochabamba · Punata | 1 |
| Cochabamba · Sipe Sipe | 1 |
| Tarija · Villamontes | 1 |
| Tarija · Yacuiba | 1 |

### Excluidas

| Motivo | Candidatas |
|---|---:|
| fuera de alcance: La Paz | 16 |
| persona: categoría de persona | 10 |
| fuera de alcance: Santa Cruz | 6 |
| fuera de Bolivia | 6 |
| perfil personal | 2 |
| persona: nombre propio | 1 |

### No publicadas (no confirmadas como página de negocio)

Las candidatas NOT_FOUND, RESTRICTED o BLOCKED no se publican: `rejected-summary.json` lleva sólo
cuántas hubo por estado y por la ciudad de la búsqueda, sin nombres, extractos ni enlaces.
Totales: RESTRICTED 52.

## Privacidad

- Sólo páginas de negocio confirmadas (`status = OK`).
- Se excluyen las páginas que parecen de una persona: categoría de persona («Persona», «Creador(a)
  digital», «Personaje público», «Perfil · …», artista, periodista, político…), nombre con título
  profesional («Dr.», «Lic.», «Ing.»…) o nombre de pila sin ninguna palabra de negocio. Los perfiles
  personales (sin página) ni siquiera se guardan durante la recolección.
- Todo texto libre (`raw` entero —bio, `og_description`, `intro_items`…— y los campos de texto de nivel
  superior: `name`, `category_raw`, `address`, `locality`, `hours`…) se normaliza con NFKC y se le
  reemplazan los correos por `[correo]` («@», «(at)», «arroba», «(arroba)», «[arroba]»; «.», «punto»,
  «[punto]») y toda tira de 7 o más dígitos (`\p{Nd}`, cualquier alfabeto) separados por espacios,
  puntos, paréntesis, «/», «·» o guiones ASCII y Unicode (‐ ‑ ‒ – — ― −) por `[teléfono]`. Efecto
  colateral aceptado: un rango de años («2015 - 2021») también se borra. Una última pasada por
  ventanas (el tramo entre dos palabras de 3+ letras) borra cualquier grupo de 7+ dígitos aunque lo
  separen letras sueltas o «:» —por eso los horarios escritos en la bio («de 7:00 a 22:45») salen como
  `[número]`— y los enlaces `wa.me`/`whatsapp.com` salen como `[whatsapp]`. El único número que queda es
  `phone`, el teléfono de la página de empresa. El WhatsApp no se publica, ni una web con 7+ dígitos.
- De cómo se halló la página sólo se publica una lista de permitidos: `raw.discovery = { via, query,
  rubro, city }`. Ni el título ni el extracto del buscador ni el enlace hallado.
- `collector/verify.mjs` revisa el archivo publicado con un detector independiente y más estricto
  (ventanas sin letras de las que se quita todo lo que no es dígito, más una ventana deslizante de 24
  caracteres): la entrega publicada tiene **0 hallazgos** fuera de `phone` y de los campos de sistema.
- **Versiones anteriores en la rama:** el commit `5ed7c80` (primer avance, 54 filas) se subió antes de
  estas reglas: contenía 5 filas RESTRICTED con el título, el extracto y la URL del buscador, y los
  campos de texto libre sin borrar (bios y descripciones que pueden traer teléfonos o correos de las
  páginas, el WhatsApp y el enlace hallado). El commit `f1298fb` (75 filas) ya quitaba las filas no OK,
  pero aún publicaba `raw.discovery.search_title` y `search_snippet` y usaba un borrador más débil
  (sólo dígitos ASCII, sin «arroba»/«punto»). No se reescribió el historial: el usuario decide si hace
  falta purgarlo.

## Método

1. **Descubrimiento por buscador.** Consultas «<rubro> <ciudad> Bolivia facebook» con 91 rubros en las 7
   capitales (hasta 3 páginas de resultados) y 40 rubros en 24 ciudades intermedias (Quillacollo, Sacaba,
   Colcapirhua, Tiquipaya, Vinto, Punata, Villa Tunari, Shinahota, Aiquile, Llallagua, Uyuni, Villazón,
   Tupiza, Huanuni, Challapata, Yacuiba, Villamontes, Bermejo, Monteagudo, Camargo, Riberalta,
   Guayaramerín, San Borja, Rurrenabaque; hasta 2 páginas). Sólo se pide la página siguiente si la
   anterior trajo páginas nuevas. Cualquier enlace a una página (post, foto, reseña, `/p/Nombre-id`,
   `profile.php?id=`) se reduce a la página; grupos, eventos, reels y marketplace se descartan.
2. **Semilla OSM.** Los lugares de OpenStreetMap de los 7 departamentos con etiqueta `facebook` o
   `contact:facebook` (Overpass, áreas ISO BO-C/O/P/H/T/B/N) se suman como candidatas.
3. **Lectura de la página.** Un GET simple con el agente de un Chrome de escritorio, sin sesión, trae
   la página pública completa con su JSON embebido. De ahí:
   - la tarjeta «Detalles» (`timeline_context_list_item_type`): categoría (`INTRO_CARD_INFLUENCER_CATEGORY`),
     dirección (`INTRO_CARD_ADDRESS`, cuyo enlace a Google Maps lleva `q=lat,lon` → **lat/lon**),
     teléfono (`INTRO_CARD_PROFILE_PHONE`), web (`INTRO_CARD_WEBSITE`; un `wa.me` va a `raw.whatsapp`),
     horario (`INTRO_CARD_BUSINESS_HOURS`), rango de precios, servicios, calificación, área de servicio;
   - el id de la página (`delegate_page.id` → `source_id`) y el del perfil (`raw.profile_id`);
   - seguidores, «personas hablando» y «estuvieron aquí» de la `meta description`;
   - la fecha del post más reciente entre los embebidos (`last_post_at`, también `source_updated_at`).
4. **Ubicación.** Departamento por las coordenadas (centro urbano más cercano, con las capitales
   favorecidas en su mancha urbana); si no hay, por la dirección leída de derecha a izquierda (para no
   tomar «Cobija 345, Cochabamba» por Cobija); luego el área de servicio o la ciudad de la descripción;
   luego, OSM; por último la ciudad de la búsqueda.
5. **Filtro.** Se guardan sólo páginas: los perfiles personales (sin `delegate_page` ni categoría
   «Página ·») y los perfiles profesionales de personas («Perfil · Creador(a) digital») se descartan sin
   guardar nada de ellos. El correo de la página nunca se guarda. Duplicados por id de página.

Concurrencia: un solo Chromium (sólo para el buscador), un contexto limpio por búsqueda, reciclado cada
50 cargas; lectura de páginas con 2 en paralelo y pausas al azar de 1,5–3,5 s; antes de cada lote se
espera si la RAM libre baja de 800 MB. Todo se guarda tras cada página y el proceso se reanuda.

## Campos

`source`=facebook, `source_id` (id de la página), `name`, `category_raw` (categoría en español, tal como
la muestra Facebook; `raw.category_en` la trae en inglés), `address`, `locality`, `municipality`,
`department`, `lat`, `lon`, `phone`, `website`, `hours`, `source_updated_at`, `source_url`,
`retrieved_at`, `raw`, `followers`, `last_post_at`, `status` (OK / RESTRICTED / BLOCKED / NOT_FOUND).

`raw` lleva: `page_id`, `profile_id`, `category_en`, `og_description`, `bio`, `city_text`, `price_range`,
`services`, `rating`, `likes`, `talking_about`, `were_here`, `whatsapp`, `intro_items` (la tarjeta
entera, sin correo), `location_source`, `coords_source`, `osm` (si vino de OSM), `discovery` (consulta,
rubro, ciudad, título y extracto del buscador) y `html_sha256` de la página leída.

## Bloqueos y límites

- **Bing está envenenado para clientes automatizados** (27-oct): a cualquier consulta devuelve resultados
  ajenos (foros húngaros, calendarios, ayuda de YouTube), sin desafío visible. Se usó **Yahoo**, que sirve
  el índice de Bing y contesta bien desde Chromium. DuckDuckGo HTML, Brave, Mojeek y Startpage no
  devolvieron enlaces a Facebook. Yahoo por HTTP simple da 500: necesita navegador.
- **Horario:** sin sesión Facebook sólo muestra el estado («Abierto ahora», «Cierra pronto», «Siempre
  abierto»), no la grilla de días y horas; `hours` lleva ese estado. La página «Información» tampoco la
  trae y pesa 12 MB.
- **RESTRICTED:** Facebook responde «Este contenido no está disponible» sin sesión a las páginas de
  alcohol (licorerías, cervecerías, discotecas) y también a las páginas borradas: con ese texto no se
  distinguen. Se guardan con el nombre del buscador y la ciudad de la búsqueda.
- **BLOCKED:** una página que tres veces seguidas llega sin `og:title` (muro de inicio de sesión).
- Sin sesión sólo se ven los primeros posts: `last_post_at` es la fecha del más reciente de esos (puede
  ser un post fijado).
- WhatsApp: Facebook sólo lo muestra en la tarjeta cuando la página lo enlaza como web; casi ninguna lo hace.
- Muchas páginas son de alcance departamental o nacional (medios, comunidades): `category_raw` permite
  filtrarlas.
