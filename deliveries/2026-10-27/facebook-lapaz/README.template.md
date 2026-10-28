# Facebook: páginas de negocios del departamento de La Paz (27-oct-2026)

Lugares de La Paz, El Alto y los demás municipios del departamento, sacados de
páginas públicas de negocios en Facebook vistas **sin sesión**. Una fila por página
de negocio confirmada, con la ubicación más precisa que la página publica.

> Estado: __ESTADO__

## Archivos

| Archivo | Filas | Qué tiene |
|---|---:|---|
| `facebook-lapaz.ndjson.gz` | __N_LAPAZ__ | Páginas con evidencia de estar en el departamento de La Paz. |
| `facebook-lapaz-sin-ubicacion.ndjson.gz` | __N_SIN__ | Páginas confirmadas que salieron en búsquedas de La Paz pero no publican dirección, ciudad ni punto. |
| `facebook-otros-departamentos.ndjson.gz` | __N_OTROS__ | Páginas bolivianas de otros departamentos que aparecieron en las búsquedas (para cruzar con los agentes de Santa Cruz y del resto). |
| `rejected-summary.json` | — | Sólo conteos, por estado y ciudad de la consulta, de lo que NO se publica. |
| `manifest.json` | — | sha256 y tamaño de cada archivo, más el resumen de la corrida. |
| `collect.mjs`, `parse.mjs`, `queries.mjs`, `build.mjs`, `privacy.mjs`, `privacy.test.mjs` | — | El recolector, el lector de la página, las consultas, el armado de la entrega y la limpieza de privacidad. |

Cada fila trae los campos comunes (`source`=facebook, `source_id`, `name`,
`category_raw`, `address`, `locality`, `municipality`, `department`, `lat`, `lon`,
`phone`, `website`, `hours`, `source_updated_at`, `source_url`, `retrieved_at`,
`raw`) más `followers`, `last_post_at` y `status`.

- `source_id`: id de la página (`delegate_page.id`); el id del perfil «nuevo» va en `raw.profile_id`.
- `lat`/`lon`: el punto que el negocio fijó en su página (ver Método). `null` si no lo fijó
  o si contradice la ciudad declarada (`raw.coords_discarded`).
- `phone`: el primer teléfono de la tarjeta de la página, en E.164 (`+591…`). Es el único teléfono
  que se publica.
- `hours`: siempre `null`. Sin sesión Facebook sólo muestra «Abierto ahora / Cerrado ahora»
  (va en `raw.hours_status_at_retrieval`); el horario completo exige abrir el diálogo con sesión.
- `source_updated_at` = `last_post_at`: fecha del post más reciente embebido en la página (sirve
  para saber si sigue activa; ojo: un post fijado viejo puede dejarla antes de tiempo).
- `status`: siempre `OK` en los archivos publicados (ver Privacidad).
- `raw.geo_basis`: de dónde salió la ubicación: `ciudad_facebook` (la ciudad del campo de dirección
  o del título «Nombre | Ciudad»), `texto_direccion` (municipio o zona nombrados en la dirección),
  `coordenadas` (sólo el punto, dentro del departamento), `nombre_de_la_pagina` (evidencia débil:
  «Salteñería X - La Paz», sin dirección ni punto).
- `raw.discovery`: `{ via, query, rubro, city }` de cada consulta que la encontró.
- `raw.has_whatsapp`: la página enlaza un WhatsApp de empresa (el número no se publica).

## Resultados

__RESULTADOS__

**Alcance real:** las consultas van en el orden de `queries.mjs` (primero «<rubro> La Paz
Bolivia», luego El Alto, luego zonas y luego municipios). Esta entrega sólo llegó a los primeros
rubros de la ciudad de La Paz; El Alto, las zonas y los demás municipios casi no están, y por eso El
Alto tiene tan pocas filas. No es un techo de la fuente: cada consulta devolvió 7 de 7 resultados
de Facebook y ~6 páginas nuevas.

## Método

1. **Descubrimiento.** Yahoo con `site:facebook.com <rubro> <lugar>`, una consulta a la vez, cada
   una en un contexto de navegador limpio y con 3-7 s de pausa. Combinaciones (`queries.mjs`):
   108 rubros × {La Paz, El Alto}; 20 rubros de calle × 37 zonas (Sopocachi, Miraflores, Calacoto,
   Achumani, San Miguel, Centro, Villa Fátima, Obrajes, Irpavi, …, Ceja, 16 de Julio, Ciudad
   Satélite, Senkata, Villa Adela, Río Seco, …); 12 rubros × 44 municipios (Viacha, Achocalla,
   Copacabana, Coroico, Caranavi, Chulumani, Achacachi, Sorata, Patacamaya, …). En total
   __N_QUERIES_TOTAL__ consultas posibles; se hicieron __N_QUERIES__.
2. **Lectura.** Cada página se abre con Playwright/Chromium **sin sesión**, agente de usuario de
   Chrome de escritorio, **sin JavaScript** y sin cargar nada más que el documento: Facebook pinta
   en el servidor todo lo que se lee (`<script type="application/json">` dentro del HTML), así que
   no hace falta cerrar el aviso de inicio de sesión. Una página tarda ~1 s y pesa poca RAM.
3. **Qué se lee** (`parse.mjs`): la tarjeta «Detalles» llega como una lista de
   `timeline_context_item.renderer`:
   - `InfluencerCategoryContextItemRenderer` → «Página · Farmacia · …». Que diga «Página» es lo que
     separa una página de un perfil personal.
   - `AddressContextItemRenderer` → dirección; si el negocio fijó el punto, el texto enlaza a
     `maps.google.com/maps?q=<lat>,<lon>(<dirección>)` y de ahí salen las coordenadas.
   - `ContextItemDefaultRenderer` → teléfono (y correo, que se descarta).
   - `WebsiteContextItemRenderer` → web (o wa.me).
   - `BusinessHoursContextItemRenderer`, `BusinessServicesContextItemRenderer`, `RatingContextItemRenderer`.
   - `meta description` → seguidores, «personas están hablando», «estuvieron aquí».
   - `creation_time` de los posts embebidos → último post.
4. **Ubicación** (`build.mjs`): la ciudad sale del penúltimo tramo de «…, Ciudad, Bolivia» o del
   título «Nombre | Ciudad»; si falta, del texto de la dirección (municipio o zona); si falta, del
   punto (caja del departamento). Un punto que cae fuera de la ciudad declarada se descarta.
   `locality` es la zona (Sopocachi, Calacoto, Ceja, Senkata, …) cuando la dirección la nombra.
5. **Reanudable.** Todo se guarda línea a línea tras cada consulta y cada página (`work/`, no se
   versiona); al relanzar se saltan las consultas y páginas hechas.

## Privacidad

- Sólo se publican páginas de negocio **confirmadas** (status OK y tarjeta «Página»).
  RESTRICTED/BLOCKED/NOT_FOUND, los perfiles personales y las páginas que parecen de una persona
  (categorías Persona, Creador digital, Personaje público, Artista, …; nombre con título
  profesional —Dr., Lic., Ing.— o nombre propio con categoría de profesión) **no se publican**:
  quedan sólo como conteos en `rejected-summary.json`, sin títulos, extractos ni URLs.
- Ningún correo se guarda. En todo texto libre (título, descripción, dirección, categorías,
  servicios, líneas sueltas de la tarjeta) se borran, tras normalizar con NFKC, los tramos de 7 o
  más dígitos Unicode (`\p{Nd}`, con espacios, guiones Unicode, `.`, `/`, `·` y paréntesis como
  separadores) y los correos (también «arroba», «(arroba)», «[arroba]», «(at)», «punto»). El único
  teléfono publicado es `phone`. Las webs con un tramo así no se publican. No se guardan extractos
  ni títulos del buscador.
- `privacy.mjs` tiene además un **verificador independiente** que recorre cada cadena de cada fila
  publicada (salvo ids, URL de la página, fechas y `phone`) y exige **0 hallazgos**; `build.mjs`
  aborta si encuentra alguno. `node privacy.test.mjs` prueba los casos de la revisión (ancho
  completo, guiones Unicode, dígitos árabe-índicos, «arroba/punto», …).
- La limpieza ya estaba aplicada desde el primer push de esta rama (`01f718b`); los commits
  siguientes sólo añaden filas. No se reescribió el historial ni se hizo force-push.
- No se tocó ninguna base.

Filas quitadas, por motivo: __REMOVED__

## Bloqueos y cómo se evitaron

- **Muro de inicio de sesión de Facebook:** no apareció como muro. Sin JavaScript ni siquiera se
  pinta el aviso; el HTML del servidor ya trae la tarjeta de la página. No se usó sesión, ni se
  resolvió captcha alguno. Una petición HTTP «pelada» (sin navegador) recibe **400**; con un
  navegador real sí entrega la página.
- **Páginas restringidas:** las de alcohol y algunas otras responden «Este contenido no está
  disponible en este momento» → RESTRICTED (no se publican; sólo cuentan).
- **Bing, envenenado:** ese día Bing devolvía a Chromium sin cabeza resultados ajenos a la consulta
  (Google, Transfermarkt, Zhihu…), también por RSS. Se cambió a **Yahoo**, que sí respeta `site:`.
- **Yahoo, sin segunda página:** la página 2 redirige a `_bv/v.gif` (detección de robots). No se
  intentó esquivar: se usa sólo la primera página (7 resultados) y la cobertura sale de multiplicar
  rubros × lugares. Brave devolvía una página sin resultados y Mojeek un captcha; no se usaron.
  DuckDuckGo HTML, desafío.
- **Ritmo:** una consulta a la vez con 3-7 s de pausa y 1,5-4 s entre páginas; tras 3 consultas
  vacías seguidas el descubrimiento se pausa (2-15 min); tras 4 páginas BLOCKED seguidas, 10 min.
  __RITMO__
- **Memoria de la laptop (el verdadero límite):** el equipo es compartido con otros 11 agentes y
  pasó buena parte de la corrida con < 800 MB libres (llegó a 1 MB). Por pedido del coordinador:
  un solo Chromium, un solo contexto abierto, nada en paralelo, y antes de cada consulta y cada
  página se exige ~800 MB libres; si no, se cierra Chromium y se espera 60 s. Leer sin JavaScript
  y sin subrecursos bajó el costo por página a ~1 s y una fracción de la RAM.

## Reproducir

```bash
node collect.mjs --work=work            # descubre y lee; reanudable; espera si hay < ~800 MB libres
node build.mjs --work=work --out=.      # arma los .ndjson.gz, rejected-summary.json y manifest.json
node privacy.test.mjs
```

Requiere `playwright` (el del repositorio) y su Chromium descargado.
