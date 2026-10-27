// Reglas de privacidad de la entrega (revisión de seguridad del 27-oct):
// 1. Sólo se publican páginas de negocio confirmadas (status OK). Las demás van a un
//    resumen de conteos, sin títulos, extractos ni direcciones de perfil.
// 2. En todo texto libre se borran correos y teléfonos; el único teléfono que queda es
//    el campo `phone` de la página de empresa confirmada.
// 3. Las páginas que parecen de una persona se excluyen.

const EMAIL = /[A-Za-z0-9._%+-]+\s*(?:@|\(at\)|\[at\])\s*[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
// Siete o más dígitos, con espacios, puntos, guiones o paréntesis entre medio, y prefijos +591.
const PHONE = /(?:\+?\d[\s().-]{0,3}){7,}/g;

export function scrubText(text) {
  if (typeof text !== 'string') return text;
  return text.replace(EMAIL, '[correo]').replace(PHONE, (m) => {
    if (m.replace(/\D/g, '').length < 7) return m;
    if (/^\s*(?:19|20)\d\d\s*[-–/]\s*(?:19|20)\d\d\s*$/.test(m)) return m; // «2015 - 2021»: años
    return '[teléfono]';
  });
}

export function scrubDeep(value) {
  if (typeof value === 'string') return scrubText(value);
  if (Array.isArray(value)) return value.map(scrubDeep);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, scrubDeep(v)]));
  return value;
}

const WA = /wa\.me|whatsapp\.com|api\.whatsapp/i;

/** Limpia un registro OK: todo `raw` y la dirección pasan por el borrador; `phone` queda. */
export function scrubRecord(r) {
  const out = { ...r };
  out.raw = scrubDeep(r.raw || {});
  // El WhatsApp es un número: fuera, aun siendo de la empresa (sólo `phone` conserva número).
  delete out.raw.whatsapp;
  if (Array.isArray(out.raw.websites)) out.raw.websites = out.raw.websites.filter((w) => !WA.test(w));
  if (out.website && WA.test(out.website)) out.website = null;
  if (out.raw.discovery) {
    // El enlace hallado puede ser un post o un permalink con id de terceros: se deja sólo la vía.
    const { found_url, ...rest } = out.raw.discovery;
    out.raw.discovery = rest;
  }
  out.address = scrubText(r.address);
  out.name = scrubText(r.name);
  out.hours = scrubText(r.hours);
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
