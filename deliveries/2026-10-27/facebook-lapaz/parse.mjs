/**
 * Lectura de una página de Facebook vista SIN sesión.
 *
 * Todo sale del HTML que Facebook pinta detrás del aviso de «Iniciar sesión»:
 *
 * - `meta description`: «<Nombre>, <Ciudad>. 315.066 seguidores · 2.433 personas
 *   están hablando de esto · 14 personas estuvieron aquí. <bio>».
 * - La tarjeta «Detalles» (INTRO) llega como JSON embebido: una lista de
 *   `timeline_context_item.renderer` con `__typename`:
 *   - `InfluencerCategoryContextItemRenderer` → «Página · Farmacia · …». Que diga
 *     «Página» es lo que separa una página de un perfil personal.
 *   - `AddressContextItemRenderer` → la dirección; cuando el negocio fijó el punto,
 *     el texto enlaza a `maps.google.com/maps?q=<lat>,<lon>(<dirección>)`: de ahí
 *     salen las coordenadas. Una dirección sólo de ciudad no trae enlace.
 *   - `ContextItemDefaultRenderer` → teléfono, correo u otra línea suelta.
 *   - `WebsiteContextItemRenderer` → web (o wa.me / Instagram), tras `l.facebook.com`.
 *   - `BusinessHoursContextItemRenderer` → sólo «Abierto/Cerrado ahora».
 *   - `BusinessServicesContextItemRenderer`, `RatingContextItemRenderer`, …
 * - `delegate_page.id` es el id de la página; el perfil «nuevo» tiene otro id.
 * - Los primeros posts vienen embebidos con `creation_time` (epoch).
 *
 * Los correos NO se guardan (regla del proyecto: nada de datos de particulares,
 * y muchas páginas pequeñas publican el gmail de su dueño).
 */

function jsonBlobs(html) {
  const blobs = [];
  for (const m of html.matchAll(/<script type="application\/json"[^>]*>([\s\S]*?)<\/script>/g)) {
    try {
      blobs.push(JSON.parse(m[1]));
    } catch {
      // bloque que no es JSON: se ignora
    }
  }
  return blobs;
}

function walk(node, visit) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const item of node) walk(item, visit);
    return;
  }
  if (visit(node)) return;
  for (const value of Object.values(node)) walk(value, visit);
}

const decodeEntities = (s) =>
  s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#039;|&#x27;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)));

export function meta(html, name) {
  const re = new RegExp(`<meta[^>]+(?:name|property)="${name}"[^>]+content="([^"]*)"`, 'i');
  const m = re.exec(html);
  return m ? decodeEntities(m[1]).trim() : null;
}

/** «315.066» / «1,2 mil» / «3 M» → número. */
export function parseCount(text) {
  if (!text) return null;
  const m = /([\d.,]+)\s*(mil|k|m|mill(?:ones|ón)?)?/i.exec(text.trim());
  if (!m) return null;
  let raw = m[1];
  const unit = (m[2] || '').toLowerCase();
  let value;
  if (unit) {
    value = parseFloat(raw.replace(/\./g, '').replace(',', '.'));
    value *= unit === 'mil' || unit === 'k' ? 1e3 : 1e6;
  } else {
    value = parseInt(raw.replace(/[.,]/g, ''), 10);
  }
  return Number.isFinite(value) ? Math.round(value) : null;
}

function countBefore(desc, label) {
  const m = new RegExp(`([\\d.,]+(?:\\s*(?:mil|k|M))?)\\s*${label}`, 'i').exec(desc);
  return m ? parseCount(m[1]) : null;
}

/** El destino real de un enlace `l.facebook.com/l.php?u=…`. */
export function unwrap(url) {
  if (!url) return url;
  try {
    const u = new URL(url);
    if (/(^|\.)facebook\.com$/.test(u.hostname) && u.pathname === '/l.php') return u.searchParams.get('u') || url;
  } catch {
    // no es URL
  }
  return url;
}

/** Lat/lon de un enlace de mapa de Google o Bing. */
export function coordsFromMapUrl(url) {
  if (!url) return null;
  let m = /[?&]q=(-?\d{1,2}\.\d+)(?:,|%2C)\s*(-?\d{1,3}\.\d+)/i.exec(url);
  if (!m) m = /[?&]cp=(-?\d{1,2}\.\d+)(?:~|%7E)(-?\d{1,3}\.\d+)/i.exec(url);
  if (!m) m = /@(-?\d{1,2}\.\d+),(-?\d{1,3}\.\d+)/.exec(url);
  if (!m) return null;
  const lat = Number(m[1]);
  const lon = Number(m[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  if (lat === 0 && lon === 0) return null;
  return { lat, lon };
}

const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/;
const PHONE = /^\+?[\d][\d\s().-]{5,}\d$/;

export function normalizePhone(text) {
  const digits = text.replace(/[^\d+]/g, '');
  if (digits.replace(/\D/g, '').length < 7) return null;
  return digits;
}

function waNumber(url) {
  const m = /(?:wa\.me\/|api\.whatsapp\.com\/send\/?\?phone=|whatsapp\.com\/send\?phone=)(\+?\d{7,15})/i.exec(url || '');
  return m ? m[1].replace(/^\+?/, '+') : null;
}

function rangeUrls(title) {
  const out = [];
  for (const r of title?.ranges ?? []) {
    const e = r.entity || {};
    for (const u of [e.external_url, e.url, e.web_link?.url]) if (u) out.push(unwrap(u));
  }
  return [...new Set(out)];
}

export function parsePage(html, finalUrl) {
  const out = {
    status: 'OK',
    note: null,
    is_page: false,
    page_id: null,
    profile_id: null,
    name: meta(html, 'og:title'),
    meta_description: meta(html, 'description') ?? meta(html, 'og:description'),
    categories: [],
    category_line: null,
    address: null,
    map_url: null,
    lat: null,
    lon: null,
    phones: [],
    websites: [],
    whatsapp: [],
    hours_status: null,
    services: null,
    rating: null,
    other_intro: [],
    followers: null,
    likes: null,
    talking_about: null,
    checkins: null,
    meta_city: null,
    last_post_at: null,
    posts_seen: 0,
    is_business_page_active: null,
  };

  if (/\/login(?:\/|\.php|\?)|\/checkpoint\//.test(finalUrl || '')) {
    out.status = 'BLOCKED';
    out.note = 'redirigida al login';
    return out;
  }
  if (/Este contenido no está disponible|This content isn't available|Esta página no está disponible|This page isn't available/.test(html)) {
    out.status = /no está disponible en este momento|isn't available right now/.test(html) ? 'RESTRICTED' : 'NOT_FOUND';
    out.note = 'Facebook no muestra la página sin sesión';
    // Una página borrada responde igual que una restringida por edad; si no hay og:title
    // ni descripción, se trata como inexistente.
    if (!out.name && !out.meta_description) out.status = 'NOT_FOUND';
    return out;
  }

  const desc = out.meta_description || '';
  out.followers = countBefore(desc, '(?:seguidores|followers)');
  out.likes = countBefore(desc, '(?:Me gusta|likes)');
  out.talking_about = countBefore(desc, '(?:personas están hablando|talking about)');
  out.checkins = countBefore(desc, '(?:personas estuvieron aquí|were here)');
  if (out.name && desc.startsWith(out.name + ', ')) {
    const rest = desc.slice(out.name.length + 2);
    const m = /^(.{2,80}?)\.\s+[\d]/.exec(rest);
    if (m) out.meta_city = m[1].trim();
  }

  const blobs = jsonBlobs(html);
  const seenRenderers = new Set();
  let maxCreated = 0;
  for (const blob of blobs) {
    walk(blob, (node) => {
      if (node.delegate_page && typeof node.delegate_page.id === 'string' && !out.page_id) out.page_id = node.delegate_page.id;
      if (typeof node.is_business_page_active === 'boolean' && out.is_business_page_active === null)
        out.is_business_page_active = node.is_business_page_active;
      if (node.variables && typeof node.variables.userID === 'string' && !out.profile_id) out.profile_id = node.variables.userID;
      if (typeof node.creation_time === 'number' && node.creation_time > 1.0e9) {
        out.posts_seen += 1;
        if (node.creation_time > maxCreated) maxCreated = node.creation_time;
      }
      const r = node.renderer;
      if (!r || typeof r.__typename !== 'string' || !r.context_item) return false;
      const key = r.__typename + JSON.stringify(r.context_item.title?.text ?? r.context_item.plaintext_title?.text ?? '');
      if (seenRenderers.has(key)) return true;
      seenRenderers.add(key);
      const text = (r.context_item.title?.text ?? '').trim();
      const urls = rangeUrls(r.context_item.title);
      switch (r.__typename) {
        case 'InfluencerCategoryContextItemRenderer': {
          out.category_line = text;
          const parts = text.split('·').map((s) => s.trim()).filter(Boolean);
          if (/^(Página|Page)$/i.test(parts[0] || '')) {
            out.is_page = true;
            out.categories = parts.slice(1);
          } else {
            out.categories = parts;
          }
          break;
        }
        case 'AddressContextItemRenderer': {
          out.address = text || out.address;
          for (const u of urls) {
            const c = coordsFromMapUrl(u);
            if (c) {
              out.lat = c.lat;
              out.lon = c.lon;
              out.map_url = u;
            }
          }
          break;
        }
        case 'WebsiteContextItemRenderer': {
          const target = urls[0] || r.context_item.plaintext_title?.text || text;
          const wa = waNumber(target);
          if (wa) out.whatsapp.push(wa);
          else if (target) out.websites.push(target);
          break;
        }
        case 'BusinessHoursContextItemRenderer':
          out.hours_status = text || null;
          break;
        case 'BusinessServicesContextItemRenderer':
          out.services = text || null;
          break;
        case 'RatingContextItemRenderer':
          out.rating = text || null;
          break;
        default: {
          if (!text) break;
          if (EMAIL.test(text)) break; // correos: no se guardan
          const wa = urls.map(waNumber).find(Boolean);
          if (wa) {
            out.whatsapp.push(wa);
            break;
          }
          if (PHONE.test(text)) {
            const p = normalizePhone(text);
            if (p) out.phones.push(p);
            break;
          }
          if (/,\s*Bolivia$/i.test(text) && !out.address) {
            out.address = text;
            break;
          }
          out.other_intro.push({ type: r.__typename, text: text.slice(0, 200) });
        }
      }
      return true;
    });
  }
  if (maxCreated) out.last_post_at = new Date(maxCreated * 1000).toISOString();
  out.phones = [...new Set(out.phones)];
  out.websites = [...new Set(out.websites)];
  out.whatsapp = [...new Set(out.whatsapp)];
  if (!out.page_id && !out.is_page) {
    out.status = 'NOT_PAGE';
    out.note = 'perfil personal o sin tarjeta de página';
  } else if (!out.name) {
    out.status = 'BLOCKED';
    out.note = 'llegó sin og:title';
  }
  return out;
}
