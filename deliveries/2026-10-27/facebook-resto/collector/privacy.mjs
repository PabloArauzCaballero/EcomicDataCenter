// Reglas de privacidad de la entrega (revisión de seguridad del 27-oct):
// 1. Sólo se publican páginas de negocio confirmadas (status OK). Las demás van a un
//    resumen de conteos, sin títulos, extractos ni direcciones de perfil.
// 2. En todo texto libre se borran correos y teléfonos; el único teléfono que queda es
//    el campo `phone` de la página de empresa confirmada.
// 3. Las páginas que parecen de una persona se excluyen.

// Todo texto se normaliza con NFKC antes de comparar: así los dígitos de ancho completo,
// matemáticos u otros alfabetos y los signos compatibles caen en las mismas clases.
const SEP = '[\\s().\\-\\u2010-\\u2015\\u2212/·•_]';
// Siete o más dígitos (\p{Nd}: cualquier sistema de numeración) con hasta 3 separadores entre
// cada uno: espacios, puntos, paréntesis, guiones ASCII y Unicode (‐ ‑ ‒ – — ―, −), «/», «·».
const PHONE = new RegExp(`(?:\\+\\s*)?(?:\\p{Nd}${SEP}{0,3}){6,}\\p{Nd}`, 'gu');
// «@», «(at)», «arroba», «(arroba)», «[arroba]» como arroba; «.», «punto», « . » como punto.
const AT = '(?:@|[(\\[]\\s*(?:at|arroba)\\s*[)\\]]|\\barroba\\b)';
const DOT = '(?:\\s*\\.\\s*|\\s*[(\\[]\\s*(?:dot|punto)\\s*[)\\]]\\s*|\\s+(?:dot|punto)\\s+)';
const EMAIL = new RegExp(`[\\p{L}\\p{Nd}._%+\\-]+\\s*${AT}\\s*[\\p{L}\\p{Nd}\\-]+(?:${DOT}[\\p{L}\\p{Nd}\\-]+)+`, 'giu');

export function scrubText(text) {
  if (typeof text !== 'string') return text;
  return text.normalize('NFKC').replace(EMAIL, '[correo]').replace(PHONE, '[teléfono]');
}

/** ¿Lleva el texto una tira de 7+ dígitos (aunque esté separada)? */
export function hasLongDigits(text) {
  return typeof text === 'string' && new RegExp(PHONE.source, 'u').test(text.normalize('NFKC'));
}

// Claves de `raw` que son identificadores o cifras del sistema, no texto libre.
const RAW_IDS = new Set(['page_id', 'profile_id', 'html_sha256', 'osm', 'http_status', 'location_distance_km', 'posts_seen', 'likes', 'talking_about', 'were_here']);

export function scrubDeep(value, key) {
  if (key && RAW_IDS.has(key)) return value;
  if (typeof value === 'string') return scrubText(value);
  if (Array.isArray(value)) return value.map((v) => scrubDeep(v));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, scrubDeep(v, k)]));
  return value;
}

const WA = /wa\.me|whatsapp\.com|api\.whatsapp/i;
// Campos de nivel superior que no son texto libre: no se tocan.
const STRUCTURAL = new Set(['source', 'source_id', 'source_url', 'retrieved_at', 'source_updated_at', 'last_post_at', 'status', 'phone', 'lat', 'lon', 'followers', 'raw', 'website']);

/** Limpia un registro OK: todo texto libre pasa por el borrador; `phone` queda. */
export function scrubRecord(r) {
  const out = { ...r };
  const { discovery, whatsapp: _wa, websites, ...raw } = r.raw || {};
  out.raw = scrubDeep(raw);
  // Lista de permitidos: de cómo se halló la página sólo la vía, la consulta, el rubro y la ciudad.
  if (discovery) out.raw.discovery = { via: discovery.via ?? null, query: discovery.query ?? null, rubro: discovery.rubro ?? null, city: discovery.city ?? null };
  // El WhatsApp es un número: fuera, aun siendo de la empresa. Una web con 7+ dígitos seguidos
  // (wa.me/591…, profile.php?id=…) tampoco se publica.
  const okUrl = (w) => typeof w === 'string' && !WA.test(w) && !hasLongDigits(w);
  if (Array.isArray(websites)) {
    const kept = websites.filter(okUrl);
    if (kept.length) out.raw.websites = kept;
  }
  out.website = okUrl(r.website) ? r.website : null;
  for (const [k, v] of Object.entries(out)) if (!STRUCTURAL.has(k) && typeof v === 'string') out[k] = scrubText(v);
  return out;
}

const PERSON_CATEGORY = /\b(persona|creador\(?a?\)?\s*digital|creador de contenido|personaje p[uú]blico|figura p[uú]blica|perfil|blogger|bloguero|influencer|periodista|escritor\(?a?\)?|pol[ií]tico\(?a?\)?|artista|m[uú]sico|atleta|deportista|modelo|actor|actriz|comediante|presentador\(?a?\)?|fot[oó]grafo\(?a?\)?\s+personal|gamer|videojugador)\b/i;
const BUSINESS_WORD = /\b(restaurante?|pollos?|poller[ií]a|salte[nñ]er[ií]a|caf[eé]|cafeter[ií]a|panader[ií]a|pasteler[ií]a|farmacia|ferreter[ií]a|cl[ií]nica|consultorio|centro|hotel|hostal|alojamiento|tienda|store|shop|market|mercado|supermercado|distribuidora|importadora|constructora|inmobiliaria|taller|agencia|instituto|colegio|unidad educativa|academia|veterinaria|gimnasio|gym|sal[oó]n|spa|boutique|librer[ií]a|bazar|comercial|empresa|s\.?r\.?l\.?|s\.?a\.?|ltda|grupo|club|eventos|catering|studio|estudio|laboratorio|[oó]ptica|pizzer[ií]a|burger|grill|bar|pub|pens[ií]on|helader[ií]a|muebler[ií]a|lavander[ií]a|imprenta|celulares|repuestos|motors?|autos?|tours?|travel|viajes|radio|tv|canal|peri[oó]dico|noticias|bolivia|cochabamba|sucre|oruro|potos[ií]|tarija|trinidad|cobija)\b/i;
const TITLE = /^(dr|dra|lic|licda|ing|arq|abog|abg|prof|msc|mgr|odont|psic)\.?\s/i;
// Nombres de pila frecuentes en Bolivia: un nombre de página que empieza por uno de ellos y no
// tiene ninguna palabra de negocio se toma por nombre propio.
const GIVEN = new Set(`juan jose josé luis carlos jorge miguel mario pedro pablo daniel david diego fernando francisco javier jaime marco marcos victor víctor hugo oscar óscar ricardo roberto rodrigo rene rené raul raúl sergio alejandro andres andrés antonio alberto alvaro álvaro angel ángel cesar césar edwin eduardo freddy gonzalo gustavo hector héctor ivan iván jhonny johnny julio limbert marcelo mauricio nelson orlando ramiro remberto richard ruben rubén samuel wilson william wilfredo willy franz fabio gabriel gerardo grover ronald rolando teodoro ariel cristian christian kevin brayan bryan
maria maría ana carmen rosa patricia sandra claudia veronica verónica gabriela daniela carla paola lucia lucía silvia monica mónica elizabeth karina karen jhenny jenny marisol mirian miriam ruth roxana norma gloria lourdes martha marta fatima fátima lidia julia juana adriana andrea alejandra beatriz cecilia cinthia cynthia diana erika fabiola giovanna isabel janet jimena katherine laura liliana magaly marcela mariela milenka nancy natalia pamela raquel rocio rocío shirley sonia susana tatiana valeria vanessa ximena yolanda wendy`.split(/\s+/));

export function personReason(r) {
  const cat = r.category_raw || '';
  const parts = cat.split('·').map((s) => s.trim()).filter(Boolean);
  if (parts.length && PERSON_CATEGORY.test(parts[0]) && !parts.slice(1).some((p) => !PERSON_CATEGORY.test(p) && !/emprendedor/i.test(p))) {
    return 'categoría de persona';
  }
  if (parts.length && parts.every((p) => /emprendedor/i.test(p))) return 'categoría de persona';
  const name = (r.name || '').trim();
  if (TITLE.test(name)) return 'nombre propio (título profesional)';
  const first = name.split(/\s+/)[0]?.toLowerCase();
  const words = name.split(/\s+/).filter(Boolean);
  if (first && GIVEN.has(first) && words.length >= 2 && words.length <= 5 && !BUSINESS_WORD.test(name)) return 'nombre propio';
  return null;
}
