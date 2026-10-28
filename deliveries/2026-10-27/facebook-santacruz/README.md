# Facebook: páginas de negocios del departamento de Santa Cruz (27-oct-2026)

Entrega de lugares tomados de páginas públicas de Facebook, leídas sin sesión.
Formato común de los 12 agentes: NDJSON comprimido con gzip, un objeto por página.
Las cifras exactas de esta versión están en `manifest.json`, que manda sobre este texto.

## Resumen (versión del 28-oct, 04:10)

| | |
|---|---|
| Páginas publicadas, archivo principal | **384** (363 con departamento Santa Cruz, 21 sin ubicación declarada) |
| Fuera del departamento (aparte) | 9 (6 La Paz, 1 Cochabamba, 2 extranjero) |
| Con lat/lon | 345 (89,8 %) |
| Con dirección | 353 (91,9 %) |
| Con teléfono | 339 (88,3 %) |
| Con lat/lon + dirección + teléfono | 305 (79,4 %) |
| Con web · con WhatsApp de empresa | 131 (34,1 %) · 117 (30,5 %) |
| Con horario semanal | 17 (4,4 %; sólo las leídas con navegador, ver «Método») |
| Con post en los últimos 12 meses | 237 (61,7 %) |
| Por municipio | Santa Cruz de la Sierra 327, Montero 28, Pailón 7, Cotoca 1 |
| Consultas hechas | 25 de 11.280 previstas (89 páginas de resultados) |
| Candidatos | 479 hallados, 428 leídos, 51 sin leer |
| No publicados | 12 BLOCKED, 3 perfiles personales, 4 páginas de persona, 16 duplicados |

**La entrega es parcial.** El descubrimiento cubrió 25 consultas (restaurantes, churrasquerías,
pollerías, heladerías, cafeterías, panaderías, farmacias, ferreterías, agroveterinarias,
maquinaria agrícola, ropa, peluquerías, supermercados; capital, Montero, Pailón, Equipetrol
y algunos municipios chicos) de 11.280 previstas. Lo frenó la memoria de la laptop, no
Facebook ni Yahoo (ver «Bloqueos»). Con `node run.mjs` o las tandas por el candado se
retoma desde `work/` sin repetir nada.

## Archivos

| Archivo | Qué trae |
|---|---|
| `facebook-santacruz.ndjson.gz` | Páginas de negocio confirmadas en el departamento de Santa Cruz, más las confirmadas que no declaran ubicación (`department: null`). |
| `facebook-santacruz-fuera-del-departamento.ndjson.gz` | Páginas confirmadas que salieron en búsquedas de Santa Cruz pero están en otro departamento o país. |
| `rejected-summary.json` | Lo leído y no publicado, sólo en conteos por motivo, estado y ciudad. |
| `manifest.json` | sha256 de cada archivo y script, conteos y porcentajes de cobertura. |
| `discover.mjs`, `fetch.mjs`, `run.mjs`, `package.mjs`, `verify-privacy.mjs` | El código que produjo la entrega. |

Campos de cada fila: `source` (= `facebook`), `source_id` (id de la página), `name`,
`category_raw` (categoría de Facebook en español), `address`, `locality`, `municipality`,
`department`, `lat`, `lon`, `phone`, `website`, `hours`, `source_updated_at`, `source_url`,
`retrieved_at`, `followers`, `last_post_at`, `status` (siempre `OK` en lo publicado) y `raw`.

- `source_updated_at` = `last_post_at`: la fecha del post más reciente visible. Facebook no
  muestra sin sesión cuándo se editó la ficha; el último post es lo único que dice si la
  página sigue viva.
- `phone` es el teléfono que la página publica como de contacto. Si además publica un
  WhatsApp de empresa distinto, va en el mismo campo: `70000000 · WhatsApp +59170000001`.
  `raw.whatsapp_business` y `raw.whatsapp_same_as_phone` dicen si lo hay y si coincide.
- `hours` sólo trae el horario semanal (`Lunes: 11:00 a. m. - 3:00 p. m.; …`). El estado del
  momento («Abierto ahora») va en `raw.hours_status_at_read`.
- `municipality` sale de la ciudad que declara la página (dirección o título). Facebook pone
  «Santa Cruz de la Sierra» a muchos negocios del área metropolitana: una dirección
  «Km 23 carretera antigua a Cochabamba, La Guardia» queda con municipio Santa Cruz de la
  Sierra porque así la registró el dueño. Con `lat`/`lon` se puede reasignar con polígonos.
- `raw` guarda: ids (`page_id`, `profile_id`, `vanity_or_key`), `category_fb_en`, `page_kind`
  (`pagina` o `lugar_no_reclamado`), `page_city`, `likes`, `talking_about`, `were_here`,
  `price_range`, la lista «Detalles» de la portada (`intro_items`, ya limpia) y
  `discovery` = `{ via, query, rubro, city }`.

## Método

1. **Descubrimiento (Yahoo).** Consultas `site:facebook.com <rubro> <lugar> Bolivia`, una a la
   vez, cada una en un contexto de Chromium limpio y con pausa al azar, leyendo hasta tres
   páginas de resultados mientras cada una traiga al menos 3 páginas nuevas. Hay 160 rubros
   (restaurante, churrasquería, pollería, heladería, farmacia, ferretería, agroveterinaria,
   maquinaria agrícola, silos, acopio de granos, mueblería, colegio privado, inmobiliaria,
   importadora, constructora, etc.) y los lugares son: la capital; 24 municipios grandes
   (Montero, Warnes, La Guardia, Cotoca, El Torno, Camiri, San Ignacio de Velasco, Puerto
   Quijarro, Puerto Suárez, Yapacaní, Mineros, San Julián, Pailón, Vallegrande, Samaipata,
   Roboré, San José de Chiquitos, Concepción, Guarayos, Portachuelo, Buena Vista, Comarapa,
   Cuatro Cañadas, Porongo); 39 municipios y localidades chicos, y 50 zonas de la capital
   (Equipetrol, Urbarí, Las Palmas, Plan 3000, Villa 1ro de Mayo, Pampa de la Isla, Los Lotes,
   Zona Norte, del 2do al 8vo anillo, Doble Vía La Guardia, Av. Banzer, Sirari, Urubó…).
   Los tramos se intercalan: si el tiempo se acaba, la muestra cubre capital, municipios y
   zonas, no sólo la capital. Las consultas hechas y su rendimiento quedan en `manifest.json`.
2. **Lectura.** Cada página se lee por HTTPS con las cabeceras de navegación de un Chrome de
   escritorio (agente de usuario, `accept`, `sec-fetch-*`), sin Chromium: ~1 s por página.
   Facebook entrega el mismo HTML público que a un navegador, con el JSON embebido; sin las
   cabeceras `sec-fetch-*` responde 400. No hay desafío ni login de por medio. De ahí salen: el id y la categoría de la página (`delegate_page`), la
   lista «Detalles» (dirección con lat/lon en el enlace a Google Maps, teléfono, web,
   estado del horario, rango de precios), las cifras de la `meta description` (seguidores,
   «Me gusta», «estuvieron aquí») y el `creation_time` de los posts embebidos. Si la página
   tiene dirección pero sin coordenadas se lee también su sección «Información»
   (`map_pin_coordinates`). Las páginas de lugar no reclamadas (`/pages/<nombre>/<id>`) traen
   `latitude`, `longitude`, `full_address` y `formatted_phone_number` sueltos.
   Las primeras ~30 páginas se leyeron con Chromium; sólo a ésas se les abrió el diálogo
   del horario, por eso el horario semanal es más frecuente en ellas.
3. **Reanudación.** Cada consulta y cada página se guardan al terminar (`work/`, no
   versionado). Un BLOCKED o un error se reintenta una vez en otra tanda.
4. **Empaquetado.** `package.mjs` deduplica por id de página (vanity y número apuntan a la
   misma), aplica las reglas de privacidad y escribe los archivos; `verify-privacy.mjs` los
   revisa después con reglas propias.

## Privacidad

- **Sólo páginas.** Un perfil personal se descarta al leerlo y no se guarda ningún dato suyo
  (sólo su clave, en `work/`, para no volver a visitarlo).
- **Lo no confirmado no se publica.** Las filas NOT_FOUND, RESTRICTED y BLOCKED no están en
  los NDJSON: `rejected-summary.json` las cuenta por estado y por la ciudad que mostraba el
  buscador, sin nombres, títulos, extractos ni URLs.
- **Páginas de personas fuera.** Se excluye la página con categoría de persona («Persona»,
  «Personaje público», «Creador digital», «Artista», «Blogger»…, o su equivalente en inglés)
  y la de un profesional con nombre propio (Dr./Dra./Lic./Ing. delante, o nombre y apellido
  con categoría de médico, abogado, psicólogo, etc. y sin palabra de negocio).
- **Ni correos ni teléfonos en texto libre.** Todo texto se normaliza con NFKC; se borran los
  correos (también «arroba», «(arroba)», «[arroba]», «punto») y todo tramo de 7 o más
  dígitos (`\p{Nd}`, unidos por espacios, puntos, comas, guiones —también Unicode—, «/», «·»,
  paréntesis o «+»). El único teléfono publicado es `phone` de la página confirmada. Los
  correos de la página no se guardan nunca, ni en `work/`.
- **Del buscador sólo la consulta.** `raw.discovery` es una lista de permitidos
  `{ via, query, rubro, city }`; no lleva título ni extracto del resultado.
- **Verificador independiente.** `node verify-privacy.mjs` recorre cada texto publicado y
  marca cualquier tramo de 7+ dígitos o correo. Exentos, por ser estructurales: `phone`,
  los ids de la página (`source_id`, `raw.page_id`, `raw.profile_id`, `raw.vanity_or_key`
  numérico), `source_url` cuando el número que lleva es uno de esos ids, y las marcas de
  tiempo ISO. Resultado de esta versión: **0 hallazgos**.
- **Una web con «@»** (perfil de otra red: `tiktok.com/@cuenta`) se retira de `website`
  (`raw.website_removed_for_privacy`), porque el verificador no distingue un handle de un
  correo. Una clave numérica que no es uno de los ids de la página tampoco se publica.
- **Historial.** El primer push (`e5a7099`, 35 páginas) ya llevaba la lista de permitidos,
  el limpiador NFKC y sólo filas OK; pasado por el verificador actual da 0 hallazgos. No
  contiene filas no confirmadas ni texto con datos personales: no hace falta reescribir.

## Bloqueos y cómo se evitaron

- **Bing** (el buscador que usaba el repo) devolvía resultados envenenados desde esta red:
  «churrasquería Santa Cruz Bolivia facebook» → letras de canciones; «Aproximadamente 57
  resultados». **Google, Brave, Mojeek, Startpage y Yandex** responden con un desafío
  anti-robots y **DuckDuckGo** (versión lite, en navegador) con un error. No se intentó
  resolver ni esquivar ningún desafío. **Yahoo** sí contesta y respeta `site:facebook.com`:
  es el buscador de esta entrega. Por HTTP sin navegador Yahoo responde 500, así que el
  descubrimiento necesita Chromium.
- **Facebook sin sesión** no pidió login en ninguna lectura. Las 12 BLOCKED son fichas que
  llegaron con HTTP 200 pero sin metadatos ni `delegate_page`; cada una se intentó dos
  veces y no se publica.
- **Memoria de la laptop.** La máquina es compartida con otros 11 agentes y estuvo casi
  todo el tiempo con menos de 800 MB libres. Por orden del coordinador: un solo Chromium a
  la vez, espera de 60 s mientras la memoria libre esté bajo el umbral (800 MB al principio;
  700 para Chromium y 300 para HTTP desde que existe el candado compartido `gate.sh`) y
  tandas de 35 min como máximo (`TANDA_MIN`). Claude Code mató por falta de memoria tres
  veces los procesos de esta entrega (el orquestador `run.mjs` y dos tandas por el
  candado); otra sesión mató por error un `discover.mjs`. Tras la segunda muerte de una
  tanda relanzada se paró, como pedía la regla, y se entregó lo leído. Para no quedarse
  sin lecturas, la lectura pasó de Chromium a HTTPS: con eso 315 páginas se leyeron en una
  sola tanda.

## Cómo reproducir o continuar

```
# por el candado compartido, en tandas de 35 min
TANDA_MIN=35 MIN_FREE_MB=700 bash gate.sh chromium 700 node discover.mjs
TANDA_MIN=35 MIN_FREE_MB=300 bash gate.sh http 300 node fetch.mjs 1 --once
# o todo en serie, sin candado
node run.mjs <horas> <consultasPorTanda> <paginasPorTanda>
node package.mjs
node verify-privacy.mjs   # debe dar 0 hallazgos
```

Playwright se toma del `node_modules` del checkout principal (ruta fija al principio de
`discover.mjs`). `work/` guarda el estado y no se versiona.
