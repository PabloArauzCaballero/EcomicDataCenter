// Lectura de una página pública de Facebook (HTML sin sesión) a un registro plano.
// Todo sale del JSON embebido: la tarjeta «Detalles» (intro) trae los campos
// tipados por `timeline_context_list_item_type`; la dirección viene con un enlace
// a Google Maps que lleva las coordenadas que la página fijó.

export function jsonBlobs(html) {
  const blobs = [];
  for (const m of html.matchAll(/<script type="application\/json"[^>]*>([\s\S]*?)<\/script>/g)) {
    try { blobs.push(JSON.parse(m[1])); } catch { /* bloque no JSON: se ignora */ }
  }
  return blobs;
}

function walk(node, visit) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) { for (const x of node) walk(x, visit); return; }
  if (visit(node)) return;
  for (const v of Object.values(node)) walk(v, visit);
}

const decodeEntities = (s) => s
  ?.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&#x27;/g, "'")
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));

export function meta(html, key) {
  const re = new RegExp(`<meta[^>]+(?:property|name)="${key.replace(/[.:]/g, (c) => `\\${c}`)}"[^>]+content="([^"]*)"`, 'i');
  const m = re.exec(html);
  return m ? decodeEntities(m[1]) : null;
}

// «2,819 followers», «10 mil seguidores», «1.234 Me gusta», «3,6 mil seguidores»
export function parseCount(raw) {
  if (!raw) return null;
  const m = /(\d+(?:[.,\s ]\d+)*)\s*(mil|k|m|mill(?:ones|\.)?)?$/i.exec(raw.trim());
  if (!m) return null;
  const suffix = m[2]?.toLowerCase();
  const parts = m[1].split(/[.,\s ]/);
  let num;
  if (parts.length === 1) num = Number(parts[0]);
  else if (!suffix && (parts[parts.length - 1].length === 3 || parts.length > 2)) num = Number(parts.join(''));
  else num = Number(`${parts.slice(0, -1).join('')}.${parts[parts.length - 1]}`);
  const mult = suffix === 'mil' || suffix === 'k' ? 1e3 : suffix ? 1e6 : 1;
  return Number.isFinite(num) ? Math.round(num * mult) : null;
}

export function countBefore(text, word) {
  const re = new RegExp(`(\\d[\\d.,\\s\\u00a0]*(?:\\s*(?:mil|k|mill(?:ones|\\.)?|m))?)\\s*${word}`, 'i');
  const m = re.exec(text || '');
  return m ? parseCount(m[1]) : null;
}

function textOf(node) {
  if (!node) return null;
  if (typeof node.text === 'string') return node.text;
  return null;
}

function unwrapFbLink(url) {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (/(^|\.)facebook\.com$/.test(u.hostname) && u.pathname === '/l.php') return u.searchParams.get('u');
    return url;
  } catch { return url; }
}

/** Coordenadas del enlace a Google Maps: `q=-17.39081958,-66.18493935(Dirección)`. */
export function coordsFromMaps(url) {
  if (!url) return null;
  const decoded = decodeURIComponent(decodeURIComponent(url));
  const m = /[?&]q=(-?\d{1,2}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)/.exec(decoded);
  if (!m) return null;
  const lat = Number(m[1]); const lon = Number(m[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || (lat === 0 && lon === 0)) return null;
  return { lat, lon };
}

const PHONE = /^[+()\d][\d\s()+.-]{5,}$/;

export function parsePage(html) {
  const blobs = jsonBlobs(html);
  const out = {
    name: meta(html, 'og:title'),
    description: meta(html, 'description') ?? meta(html, 'og:description'),
    og_url: meta(html, 'og:url'),
    al_url: meta(html, 'al:android:url'),
    page_id: null,
    profile_id: null,
    category_api: null,
    intro: [],
    category: null,
    address: null,
    lat: null,
    lon: null,
    phone: null,
    website: null,
    websites: [],
    whatsapp: null,
    hours: null,
    price: null,
    services: null,
    rating: null,
    city_text: null,
    bio: null,
    posts: [],
    is_business_page_active: null,
  };
  // Identificadores: la página «nueva» es un usuario con una `delegate_page`.
  walk(blobs, (r) => {
    if (r.delegate_page && typeof r.delegate_page === 'object' && r.delegate_page.id) {
      out.page_id ??= String(r.delegate_page.id);
      out.has_delegate = true;
      if (r.delegate_page.category_name) out.category_api ??= r.delegate_page.category_name;
      if (typeof r.delegate_page.name === 'string') out.page_name ??= r.delegate_page.name;
      if (typeof r.delegate_page.is_business_page_active === 'boolean') out.is_business_page_active ??= r.delegate_page.is_business_page_active;
      if (typeof r.id === 'string' && /^\d+$/.test(r.id)) out.profile_id ??= r.id;
    }
    return false;
  });
  if (!out.profile_id) {
    const m = /"userID":"(\d+)"/.exec(html) || /fb:\/\/(?:profile|page)\/(\d+)/.exec(out.al_url || '');
    if (m) out.profile_id = m[1];
  }
  if (!out.page_id) {
    const m = /"pageID":"(\d+)"/.exec(html) || /"page_id":"(\d+)"/.exec(html);
    if (m) out.page_id = m[1];
  }
  // Tarjeta «Detalles».
  const seen = new Set();
  walk(blobs, (r) => {
    if (r.__typename !== 'TimelineContextItemWrapper' || !r.timeline_context_item) return false;
    const item = r.timeline_context_item;
    const type = item.timeline_context_list_item_type || null;
    const renderer = item.renderer || {};
    const ci = renderer.context_item || {};
    const text = textOf(ci.plaintext_title) || textOf(ci.title);
    const key = `${type}|${text}`;
    if (seen.has(key)) return true;
    seen.add(key);
    const links = [];
    walk(ci, (x) => {
      if (x.__typename === 'ExternalUrl' || x.__typename === 'ExternalWebLink') {
        const u = x.external_url || x.url;
        if (u) links.push(unwrapFbLink(u));
      }
      return false;
    });
    out.intro.push({ type, renderer: renderer.__typename, text, links: [...new Set(links)].slice(0, 3) });
    const t = type || '';
    if (/EMAIL/.test(t)) return true; // no se guarda: puede ser personal
    if (/INFLUENCER_CATEGORY|CATEGORY/.test(t) && text) out.category = text.replace(/^P[aá]gina\s*·\s*/i, '').trim();
    else if (/ADDRESS/.test(t) || renderer.__typename === 'AddressContextItemRenderer') {
      out.address ??= text;
      for (const l of links) {
        const c = coordsFromMaps(l);
        if (c) { out.lat ??= c.lat; out.lon ??= c.lon; }
      }
    } else if (/PHONE/.test(t) && text && PHONE.test(text.trim())) out.phone ??= text.trim();
    else if (/WHATSAPP/.test(t)) out.whatsapp ??= text;
    else if (/WEBSITE|SOCIAL/.test(t) || renderer.__typename === 'WebsiteContextItemRenderer') {
      const url = links[0] || text;
      if (url) {
        if (/wa\.me|whatsapp\.com/i.test(url)) out.whatsapp ??= url;
        else out.websites.push(url);
      }
    } else if (/BUSINESS_HOURS/.test(t)) out.hours = text;
    else if (/PRICE/.test(t)) out.price = text;
    else if (/SERVICES/.test(t)) out.services = text;
    else if (/RATING/.test(t) || renderer.__typename === 'RatingContextItemRenderer') out.rating = text;
    else if (/CITY|LOCATION|HOMETOWN|SERVICE_AREA/.test(t)) out.city_text ??= text;
    else if (!type && text && /,\s*Bolivia$/i.test(text)) out.city_text ??= text;
    return true;
  });
  // Ítems sin tipo reconocible: «Sucre, Bolivia» como ciudad; números como teléfono.
  for (const it of out.intro) {
    if (!it.text) continue;
    if (!out.city_text && /^[^\d,]{2,40},\s*Bolivia$/i.test(it.text)) out.city_text = it.text;
    if (!out.phone && /DEFAULT/.test(it.renderer || '') && PHONE.test(it.text.trim()) && /\d{6,}/.test(it.text.replace(/\D/g, ''))) out.phone = it.text.trim();
  }
  out.website = out.websites.find((w) => !/facebook\.com|instagram\.com|tiktok\.com|youtube\.com|twitter\.com|x\.com/i.test(w)) || out.websites[0] || null;
  // Biografía.
  walk(blobs, (r) => {
    if (r.__typename === 'ProfileTileViewIntroBioRenderer') {
      walk(r, (x) => { if (x.__typename === 'ProfileStatus' || typeof x.text === 'string') { out.bio ??= x.text || null; return Boolean(out.bio); } return false; });
      return true;
    }
    return false;
  });
  // Posts embebidos: fecha del más reciente.
  const posts = new Map();
  walk(blobs, (r) => {
    if (typeof r.post_id === 'string' && typeof r.creation_time === 'number') posts.set(r.post_id, r.creation_time);
    return false;
  });
  walk(blobs, (r) => {
    if (r.story && typeof r.story.creation_time === 'number' && typeof r.story.url === 'string') posts.set(r.story.url, r.story.creation_time);
    return false;
  });
  out.posts = [...posts.values()];
  const ogName = out.name;
  out.name = out.page_name || (ogName ? ogName.replace(/s+|s+[^|]+s*$/, '').trim() : null);
  delete out.page_name;
  const desc = out.description || '';
  out.followers = countBefore(desc, '(?:seguidores|followers)');
  out.likes = countBefore(desc, '(?:Me gusta|likes)');
  out.talking_about = countBefore(desc, '(?:personas están hablando|talking about)');
  out.were_here = countBefore(desc, '(?:estuvieron aquí|personas estuvieron|were here)');
  // «Nombre, Ciudad. 2,819 followers» → ciudad
  if (out.name && desc.startsWith(`${out.name}, `)) {
    const rest = desc.slice(out.name.length + 2);
    const m = /^([^.\d]{2,60})\.\s/.exec(rest);
    if (m) out.desc_city = m[1].trim();
  }
  return out;
}

export function classify(html, status) {
  if (status === 404) return 'NOT_FOUND';
  if (/Este contenido no está disponible|This content isn't available|Este contenido no est\\u00e1 disponible/.test(html)) return 'RESTRICTED';
  if (!/og:title/.test(html)) {
    if (/login|iniciar sesi/i.test(html.slice(0, 20000))) return 'BLOCKED';
    return 'BLOCKED';
  }
  return 'OK';
}
