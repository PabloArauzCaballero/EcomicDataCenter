// El README de la entrega: el método es fijo; las cifras salen de stats.json.
const n = (x) => (x ?? 0).toLocaleString('es-BO');
const p = (a, b) => (b ? `${(Math.round((1000 * a) / b) / 10).toLocaleString('es-BO')} %` : '—');

export function readme(s) {
  const t = s.total;
  const deptRows = Object.entries(s.by_department).map(([d, v]) =>
    `| ${d} | ${n(v.pages)} | ${n(v.ok)} | ${p(v.with_latlon, v.pages)} | ${p(v.with_address, v.pages)} | ${p(v.with_phone, v.pages)} | ${p(v.with_website, v.pages)} | ${p(v.with_last_post, v.pages)} |`).join('\n');
  const locRows = Object.entries(s.by_locality).slice(0, 40).map(([k, v]) => `| ${k} | ${n(v)} |`).join('\n');
  const excl = Object.entries(s.excluded).sort((a, b) => b[1] - a[1]).map(([k, v]) => `| ${k} | ${n(v)} |`).join('\n');
  const status = Object.entries(s.by_status).map(([k, v]) => `${k} ${n(v)}`).join(' · ');
  const locsrc = Object.entries(s.by_location_source).map(([k, v]) => `\`${k}\` ${n(v)}`).join(' · ');
  return `# Facebook — resto del país (2026-10-27)

Páginas de negocios en Facebook de **Cochabamba, Oruro, Potosí, Chuquisaca, Tarija, Beni y Pando**,
capitales y ciudades intermedias. La Paz y Santa Cruz las cubren otros agentes: las páginas que caen
allí se descartaron (ver «Excluidas»).

- Archivo: \`facebook-resto.ndjson.gz\` — NDJSON con gzip, un lugar por línea, ${n(t.pages)} registros.
- Cifras completas: \`stats.json\`. Sumas de verificación: \`manifest.json\`.
- Código del recolector: \`collector/\` (Node 22 + Playwright sólo para el buscador).
- Generado: ${s.generated_at}.

## Resultado

Estados: ${status}.

| Departamento | Páginas | OK | lat/lon | Dirección | Teléfono | Web | Último post |
|---|---:|---:|---:|---:|---:|---:|---:|
${deptRows}
| **Total** | **${n(t.pages)}** | **${n(t.ok)}** | **${p(t.with_latlon, t.pages)}** | **${p(t.with_address, t.pages)}** | **${p(t.with_phone, t.pages)}** | **${p(t.with_website, t.pages)}** | **${p(t.with_last_post, t.pages)}** |

- Coordenadas fijadas por la propia página en Facebook: ${n(t.with_latlon_from_facebook)} (${p(t.with_latlon_from_facebook, t.pages)}).
  El resto de las que tienen lat/lon (${n(t.with_latlon - t.with_latlon_from_facebook)}) vienen del nodo de
  OpenStreetMap que enlaza la página (\`raw.coords_source = "osm"\`).
- Sobre las páginas OK: lat/lon ${s.pct_of_ok_pages.latlon} %, dirección ${s.pct_of_ok_pages.address} %, teléfono ${s.pct_of_ok_pages.phone} %.
- Cómo se ubicó cada página (\`raw.location_source\`): ${locsrc}.
  \`coords\` = coordenadas de la página; \`address\`/\`city_text\` = texto de la dirección o del área de servicio;
  \`osm_coords\` = coordenadas del nodo OSM; \`query\` = sin ubicación propia, se asignó la ciudad de la
  búsqueda que la trajo (dato más débil: revisar antes de usarlo como ubicación).
- Descubrimiento: ${Object.entries(s.by_discovery).map(([k, v]) => `${k} ${n(v)}`).join(' · ')}. Candidatas: ${n(s.candidates.total)}
  (${n(s.candidates.yahoo)} del buscador, ${n(s.candidates.osm)} de OSM); consultas hechas: ${n(s.queries_done)}.

### Por localidad (las 40 mayores)

| Departamento · localidad | Páginas |
|---|---:|
${locRows}

### Excluidas

| Motivo | Candidatas |
|---|---:|
${excl}

## Método

1. **Descubrimiento por buscador.** Consultas «<rubro> <ciudad> Bolivia facebook» con 91 rubros en las 7
   capitales (hasta 3 páginas de resultados) y 40 rubros en 24 ciudades intermedias (Quillacollo, Sacaba,
   Colcapirhua, Tiquipaya, Vinto, Punata, Villa Tunari, Shinahota, Aiquile, Llallagua, Uyuni, Villazón,
   Tupiza, Huanuni, Challapata, Yacuiba, Villamontes, Bermejo, Monteagudo, Camargo, Riberalta,
   Guayaramerín, San Borja, Rurrenabaque; hasta 2 páginas). Sólo se pide la página siguiente si la
   anterior trajo páginas nuevas. Cualquier enlace a una página (post, foto, reseña, \`/p/Nombre-id\`,
   \`profile.php?id=\`) se reduce a la página; grupos, eventos, reels y marketplace se descartan.
2. **Semilla OSM.** Los lugares de OpenStreetMap de los 7 departamentos con etiqueta \`facebook\` o
   \`contact:facebook\` (Overpass, áreas ISO BO-C/O/P/H/T/B/N) se suman como candidatas.
3. **Lectura de la página.** Un GET simple con el agente de un Chrome de escritorio, sin sesión, trae
   la página pública completa con su JSON embebido. De ahí:
   - la tarjeta «Detalles» (\`timeline_context_list_item_type\`): categoría (\`INTRO_CARD_INFLUENCER_CATEGORY\`),
     dirección (\`INTRO_CARD_ADDRESS\`, cuyo enlace a Google Maps lleva \`q=lat,lon\` → **lat/lon**),
     teléfono (\`INTRO_CARD_PROFILE_PHONE\`), web (\`INTRO_CARD_WEBSITE\`; un \`wa.me\` va a \`raw.whatsapp\`),
     horario (\`INTRO_CARD_BUSINESS_HOURS\`), rango de precios, servicios, calificación, área de servicio;
   - el id de la página (\`delegate_page.id\` → \`source_id\`) y el del perfil (\`raw.profile_id\`);
   - seguidores, «personas hablando» y «estuvieron aquí» de la \`meta description\`;
   - la fecha del post más reciente entre los embebidos (\`last_post_at\`, también \`source_updated_at\`).
4. **Ubicación.** Departamento por las coordenadas (centro urbano más cercano, con las capitales
   favorecidas en su mancha urbana); si no hay, por la dirección leída de derecha a izquierda (para no
   tomar «Cobija 345, Cochabamba» por Cobija); luego el área de servicio o la ciudad de la descripción;
   luego, OSM; por último la ciudad de la búsqueda.
5. **Filtro.** Se guardan sólo páginas: los perfiles personales (sin \`delegate_page\` ni categoría
   «Página ·») y los perfiles profesionales de personas («Perfil · Creador(a) digital») se descartan sin
   guardar nada de ellos. El correo de la página nunca se guarda. Duplicados por id de página.

Concurrencia: un solo Chromium (sólo para el buscador), un contexto limpio por búsqueda, reciclado cada
50 cargas; lectura de páginas con 2 en paralelo y pausas al azar de 1,5–3,5 s; antes de cada lote se
espera si la RAM libre baja de 800 MB. Todo se guarda tras cada página y el proceso se reanuda.

## Campos

\`source\`=facebook, \`source_id\` (id de la página), \`name\`, \`category_raw\` (categoría en español, tal como
la muestra Facebook; \`raw.category_en\` la trae en inglés), \`address\`, \`locality\`, \`municipality\`,
\`department\`, \`lat\`, \`lon\`, \`phone\`, \`website\`, \`hours\`, \`source_updated_at\`, \`source_url\`,
\`retrieved_at\`, \`raw\`, \`followers\`, \`last_post_at\`, \`status\` (OK / RESTRICTED / BLOCKED / NOT_FOUND).

\`raw\` lleva: \`page_id\`, \`profile_id\`, \`category_en\`, \`og_description\`, \`bio\`, \`city_text\`, \`price_range\`,
\`services\`, \`rating\`, \`likes\`, \`talking_about\`, \`were_here\`, \`whatsapp\`, \`intro_items\` (la tarjeta
entera, sin correo), \`location_source\`, \`coords_source\`, \`osm\` (si vino de OSM), \`discovery\` (consulta,
rubro, ciudad, título y extracto del buscador) y \`html_sha256\` de la página leída.

## Bloqueos y límites

- **Bing está envenenado para clientes automatizados** (27-oct): a cualquier consulta devuelve resultados
  ajenos (foros húngaros, calendarios, ayuda de YouTube), sin desafío visible. Se usó **Yahoo**, que sirve
  el índice de Bing y contesta bien desde Chromium. DuckDuckGo HTML, Brave, Mojeek y Startpage no
  devolvieron enlaces a Facebook. Yahoo por HTTP simple da 500: necesita navegador.
- **Horario:** sin sesión Facebook sólo muestra el estado («Abierto ahora», «Cierra pronto», «Siempre
  abierto»), no la grilla de días y horas; \`hours\` lleva ese estado. La página «Información» tampoco la
  trae y pesa 12 MB.
- **RESTRICTED:** Facebook responde «Este contenido no está disponible» sin sesión a las páginas de
  alcohol (licorerías, cervecerías, discotecas) y también a las páginas borradas: con ese texto no se
  distinguen. Se guardan con el nombre del buscador y la ciudad de la búsqueda.
- **BLOCKED:** una página que tres veces seguidas llega sin \`og:title\` (muro de inicio de sesión).
- Sin sesión sólo se ven los primeros posts: \`last_post_at\` es la fecha del más reciente de esos (puede
  ser un post fijado).
- WhatsApp: Facebook sólo lo muestra en la tarjeta cuando la página lo enlaza como web; casi ninguna lo hace.
- Muchas páginas son de alcance departamental o nacional (medios, comunidades): \`category_raw\` permite
  filtrarlas.
`;
}
