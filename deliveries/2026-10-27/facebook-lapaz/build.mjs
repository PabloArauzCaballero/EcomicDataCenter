/**
 * Arma la entrega a partir de `work/pages.ndjson`:
 *
 *   node build.mjs [--work=work]
 *
 * - Una fila por página (deduplicada por id de página; se juntan las consultas
 *   que la encontraron).
 * - Ubicación: la ciudad sale primero del campo de ciudad de Facebook (el
 *   penúltimo tramo de la dirección «…, <Ciudad>, Bolivia», o el «| <Ciudad>» del
 *   título), y sólo si falta, de las coordenadas (caja del departamento).
 * - Tres archivos:
 *   - `facebook-lapaz.ndjson.gz`: páginas con evidencia de estar en el
 *     departamento de La Paz.
 *   - `facebook-lapaz-sin-ubicacion.ndjson.gz`: páginas confirmadas halladas por
 *     consultas de La Paz, pero sin dirección, ciudad ni coordenadas.
 *   - `facebook-otros-departamentos.ndjson.gz`: páginas bolivianas de otros
 *     departamentos que salieron en las búsquedas (para los otros agentes).
 * - Sólo páginas de negocio confirmadas (status OK). Lo no confirmado
 *   (RESTRICTED/BLOCKED/NOT_FOUND), los perfiles personales, lo que parece de una
 *   persona y lo extranjero NO se entrega: va a `rejected-summary.json` como
 *   conteos por estado y ciudad, sin nombres ni URLs.
 * - Correos y teléfonos se borran de todo texto libre; el único teléfono es `phone`.
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { RUBROS, RUBROS_ZONA, RUBROS_MUNICIPIO, buildQueries } from './queries.mjs';

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? true];
  }),
);
const WORK = path.resolve(args.work || 'work');
const OUT = path.resolve(args.out || '.');

const fold = (s) =>
  (s || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

// Municipios del departamento de La Paz (los 87, por nombre corriente).
const LP_MUNIS = [
  'La Paz', 'El Alto', 'Viacha', 'Achocalla', 'Mecapaca', 'Palca', 'Laja', 'Pucarani', 'Copacabana', 'Coroico',
  'Caranavi', 'Chulumani', 'Coripata', 'Irupana', 'Achacachi', 'Sorata', 'Guanay', 'San Buenaventura', 'Apolo',
  'Patacamaya', 'Sica Sica', 'Sicasica', 'Desaguadero', 'Tiahuanacu', 'Tiwanaku', 'Batallas', 'Palos Blancos', 'Yanacachi',
  'Quime', 'Luribay', 'Colquiri', 'Caquiaviri', 'Corocoro', 'Coro Coro', 'Guaqui', 'Ixiamas', 'La Asunta', 'Teoponte',
  'Mapiri', 'Charazani', 'Escoma', 'Puerto Acosta', 'Tipuani', 'Inquisivi', 'Calamarca', 'Ayo Ayo', 'Huarina',
  'San Pedro de Tiquina', 'Tiquina', 'Cajuata', 'Chuma', 'Sapahaqui', 'Collana', 'Colquencha', 'Mocomoco', 'Taraco',
  'Jesus de Machaca', 'Puerto Perez', 'Santiago de Huata', 'Ancoraimes', 'Pelechuco', 'Cairoma', 'Malla', 'Yaco',
  'Licoma', 'Licoma Pampa', 'Ichoca', 'Quiabaya', 'Combaya', 'Tacacoma', 'Ayata', 'Aucapata', 'Curva', 'Humanata',
  'Chua Cocani', 'Tito Yupanqui', 'San Andres de Machaca', 'Santiago de Machaca', 'Catacora', 'Charana',
  'Waldo Ballivian', 'Nazacara de Pacajes', 'Comanche', 'Callapa', 'Umala', 'Chacarilla', 'Coroico Nor Yungas',
  'Huatajata', 'Calacoto',
];
const CITY_ALIASES = new Map([
  ['ciudad la paz', 'La Paz'],
  ['nuestra senora de la paz', 'La Paz'],
  ['la paz', 'La Paz'],
  ['ciudad de la paz', 'La Paz'],
  ['ciudad el alto', 'El Alto'],
  ['ciudad de el alto', 'El Alto'],
  ['el alto de la paz', 'El Alto'],
  ['zona sur', 'La Paz'],
  ['tiwanaku', 'Tiahuanacu'],
  ['sicasica', 'Sica Sica'],
  ['coro coro', 'Corocoro'],
  ['tiquina', 'San Pedro de Tiquina'],
  ['huatajata', 'Chua Cocani'],
  ['coroico nor yungas', 'Coroico'],
  // «Calacoto» es también un municipio de Pacajes, pero en Facebook casi siempre es
  // la zona de La Paz.
  ['calacoto', 'La Paz'],
]);
const LP_SET = new Map(LP_MUNIS.map((m) => [fold(m), CITY_ALIASES.get(fold(m)) || m]));
for (const [k, v] of CITY_ALIASES) LP_SET.set(k, v);

const OTHER_DEPTS = {
  'Santa Cruz': ['santa cruz de la sierra', 'santa cruz', 'montero', 'warnes', 'la guardia', 'cotoca', 'camiri', 'puerto quijarro', 'puerto suarez', 'san ignacio de velasco', 'portachuelo', 'yapacani', 'mineros', 'vallegrande', 'samaipata', 'san julian', 'concepcion', 'el torno', 'okinawa', 'pailon', 'ascension de guarayos', 'roboré', 'robore', 'san jose de chiquitos', 'buena vista', 'comarapa', 'cuatro canadas', 'fernandez alonso'],
  Cochabamba: ['cochabamba', 'quillacollo', 'sacaba', 'tiquipaya', 'colcapirhua', 'vinto', 'punata', 'cliza', 'sipe sipe', 'aiquile', 'ivirgarzama', 'shinahota', 'chimore', 'puerto villarroel', 'entre rios', 'tarata'],
  Oruro: ['oruro', 'challapata', 'huanuni', 'caracollo'],
  'Potosí': ['potosi', 'uyuni', 'llallagua', 'villazon', 'tupiza', 'uncia', 'betanzos'],
  Chuquisaca: ['sucre', 'monteagudo', 'camargo', 'padilla', 'muyupampa'],
  Tarija: ['tarija', 'yacuiba', 'bermejo', 'villamontes', 'entre rios tarija', 'caraparí', 'carapari'],
  Beni: ['trinidad', 'riberalta', 'guayaramerin', 'san borja', 'santa ana del yacuma', 'reyes', 'rurrenabaque', 'san ignacio de moxos', 'magdalena'],
  Pando: ['cobija', 'porvenir', 'puerto rico'],
};
const OTHER_CITY = new Map();
for (const [dept, cities] of Object.entries(OTHER_DEPTS)) for (const c of cities) OTHER_CITY.set(fold(c), dept);

const FOREIGN =
  /\b(peru|perú|chile|argentina|mexico|méxico|colombia|ecuador|paraguay|uruguay|brasil|brazil|venezuela|espana|españa|spain|united states|estados unidos|usa|honduras|el salvador|guatemala|nicaragua|costa rica|panama|panamá|cuba|republica dominicana|puerto rico|italia|italy|francia|france|alemania|germany|canada|china|philippines|filipinas)\s*$/i;

// Zonas y barrios (para `locality`). Se busca la coincidencia más larga.
const ZONES_LP = [
  'Sopocachi', 'Miraflores', 'Calacoto', 'Achumani', 'San Miguel', 'Centro', 'Casco Viejo', 'Villa Fátima', 'Obrajes',
  'Alto Obrajes', 'Bajo Obrajes', 'Irpavi', 'Irpavi II', 'Cota Cota', 'San Pedro', 'Zona Sur', 'Max Paredes',
  'Gran Poder', 'Villa Copacabana', 'Pampahasi', 'Tembladerani', 'Los Pinos', 'Chasquipampa', 'Ovejuyo', 'Mallasa',
  'Mallasilla', 'Següencoma', 'Seguencoma', 'Bolognia', 'La Florida', 'Auquisamaña', 'Aranjuez', 'Huajchilla',
  'Villa Armonía', 'Achachicala', 'Villa San Antonio', 'Kupini', 'El Tejar', 'Munaypata', 'Cotahuma', 'Llojeta',
  'Villa El Carmen', 'Alto Sopocachi', 'San Jorge', 'Bella Vista', 'Rosario', 'Garita de Lima', 'Chijini', 'Vino Tinto',
  'Pura Pura', 'Callampaya', 'Ciudadela Ferroviaria', 'Villa Pabón', 'Villa Pabon', 'Agua de la Vida', 'Las Lomas',
  'Ovejuyo', 'Koani', 'Jupapina', 'Chicani', 'Alto San Pedro', 'Villa Nuevo Potosí', 'Periférica', 'Zona Norte',
  'Prado', 'El Prado', 'Plaza Murillo', 'Plaza Abaroa', 'Plaza Avaroa', 'Plaza Humboldt', 'Plaza España', 'San Francisco',
  'Mercado Rodríguez', 'Rodríguez', 'Eloy Salmón', 'Huyustus', 'Uyustus', 'Tumusla', 'Achumani', 'Calacoto',
  'Següencoma', 'Obrajes', 'Los Rosales', 'San Alberto', 'Alto Seguencoma', 'Ciudad del Niño', 'Kantutani',
  'Villa Salomé', 'Alto Pampahasi', 'Valle Hermoso', 'Pasankeri', 'Chualluma', 'Tacagua', 'Villa Victoria',
];
const ZONES_EA = [
  'Ceja', 'La Ceja', '16 de Julio', 'Ciudad Satélite', 'Satélite', 'Senkata', 'Villa Adela', 'Río Seco', 'Villa Dolores',
  'Ballivián', 'Villa Bolívar', 'Rosas Pampa', 'Alto Lima', 'Villa Tunari', 'Villa Ingenio', 'Santiago II',
  'Santiago I', 'Mercedario', 'Villa Exaltación', 'Cosmos 79', 'Zona Franca', 'Alto Chijini', 'Villa Esperanza',
  'Villa Mercedes', 'Villa Brasil', 'Ventilla', 'Villa Alemania', 'Puente Vela', 'Villa Juliana', 'Ex Tranca',
  'Villa Santiago', 'Pacajes', 'Charapaqui', 'Huayna Potosí', 'Faro Murillo', 'Ciudad Nueva', 'Germán Busch',
  'Villa Cooperativa', 'Nuevos Horizontes', 'Calama', 'San Felipe de Seque', 'Seque', 'Distrito 8', 'Distrito 1',
  'Villa Avaroa', '12 de Octubre', 'Villa 12 de Octubre', 'Villa Tejada', 'Tejada Rectangular', 'Tejada Triangular',
  'Los Andes', 'Villa Pacajes', 'Kenko', 'Chacaltaya', 'Pasankeri', 'Villa Altiplano', 'Bautista Saavedra',
];
const zoneList = (arr, muni) => arr.map((z) => ({ z, f: fold(z), muni }));
const ZONES = [...zoneList(ZONES_LP, 'La Paz'), ...zoneList(ZONES_EA, 'El Alto')].sort((a, b) => b.f.length - a.f.length);

function findZone(text, muni) {
  const t = ` ${fold(text).replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ')} `;
  for (const z of ZONES) {
    if (muni && z.muni !== muni) continue;
    const zz = ` ${z.f.replace(/[^a-z0-9 ]/g, ' ')} `;
    if (t.includes(zz)) return z;
  }
  return null;
}

const inLpDept = (lat, lon) => lat != null && lat >= -17.9 && lat <= -10.9 && lon >= -69.7 && lon <= -66.6 && !(lat < -17.2 && lon > -67.6);
const inBolivia = (lat, lon) => lat != null && lat >= -22.95 && lat <= -9.6 && lon >= -69.7 && lon <= -57.4;

function cityOf(row) {
  // 1) penúltimo tramo de la dirección «…, Ciudad, Bolivia»
  const addr = (row.address || '').trim();
  const parts = addr.split(',').map((s) => s.trim()).filter(Boolean);
  let country = null;
  let city = null;
  if (parts.length) {
    const last = parts[parts.length - 1];
    if (/^bolivia$/i.test(last)) {
      country = 'Bolivia';
      city = parts.length >= 2 ? parts[parts.length - 2] : null;
      // «La Paz, La Paz, Bolivia»: ciudad y departamento repetidos
    } else if (FOREIGN.test(last) || FOREIGN.test(addr)) {
      country = 'foreign';
    }
  }
  // 2) el «| Ciudad» del título de la página
  const titleCity = /\|\s*([^|]{2,60})$/.exec(row.name || '')?.[1]?.trim() || null;
  return { country, city, titleCity };
}

function classify(row) {
  const { country, city, titleCity } = cityOf(row);
  const phones = row.phones || [];
  const foreignPhone = phones.length > 0 && phones.every((p) => p.startsWith('+') && !p.startsWith('+591'));
  if (country === 'foreign') return { scope: 'foreign', basis: 'direccion' };
  if (country !== 'Bolivia' && row.lat != null && !inBolivia(row.lat, row.lon)) return { scope: 'foreign', basis: 'coordenadas' };

  const tryCity = (c) => {
    if (!c) return null;
    const f = fold(c).replace(/^(ciudad de |ciudad )/, (m) => m); // se conserva para los alias
    if (LP_SET.has(f)) return { dept: 'La Paz', muni: LP_SET.get(f) };
    const f2 = fold(c).replace(/^ciudad (de )?/, '');
    if (LP_SET.has(f2)) return { dept: 'La Paz', muni: LP_SET.get(f2) };
    if (OTHER_CITY.has(f)) return { dept: OTHER_CITY.get(f) };
    if (OTHER_CITY.has(f2)) return { dept: OTHER_CITY.get(f2) };
    return null;
  };
  let hit = tryCity(city) || tryCity(titleCity) || tryCity(row.meta_city);
  let basis = hit ? 'ciudad_facebook' : null;
  const addrText = row.address || '';
  if (!hit && addrText) {
    // un municipio o ciudad nombrado en cualquier parte de la dirección
    const t = ` ${fold(addrText).replace(/[^a-z0-9 ]/g, ' ')} `;
    if (/ el alto /.test(t)) hit = { dept: 'La Paz', muni: 'El Alto' };
    else if (/ la paz /.test(t) && !FOREIGN.test(addrText)) hit = { dept: 'La Paz', muni: 'La Paz' };
    else {
      for (const [f, dept] of OTHER_CITY) if (f.length > 5 && t.includes(` ${f} `)) { hit = { dept }; break; }
    }
    if (!hit) {
      const z = findZone(addrText);
      if (z) hit = { dept: 'La Paz', muni: z.muni };
    }
    if (hit) basis = 'texto_direccion';
  }
  if (hit && row.lat != null && hit.dept === 'La Paz' && !inLpDept(row.lat, row.lon)) {
    // la ciudad dice La Paz pero el punto cae fuera: manda la ciudad, se anota
    basis += '+coordenadas_fuera';
  }
  if (!hit && row.lat != null) {
    if (inLpDept(row.lat, row.lon)) {
      hit = { dept: 'La Paz', muni: null };
      basis = 'coordenadas';
    } else hit = { dept: 'otro' }, (basis = 'coordenadas');
  }
  if (!hit && !foreignPhone) {
    // Evidencia débil: la página no fijó ubicación pero su nombre dice dónde está
    // («Salteñería Tradicional - La Paz»). Se marca en `geo_basis` para poder filtrarla.
    const n = ` ${fold(row.name).replace(/[^a-z0-9 ]/g, ' ')} `;
    if (/ el alto /.test(n)) hit = { dept: 'La Paz', muni: 'El Alto' };
    else if (/ la paz /.test(n) && !/ (mexico|baja california|honduras|entre rios|canelones) /.test(n)) hit = { dept: 'La Paz', muni: 'La Paz' };
    if (hit) basis = 'nombre_de_la_pagina';
  }
  if (!hit) return { scope: foreignPhone ? 'foreign' : 'unknown', basis: foreignPhone ? 'telefono_extranjero' : null };
  if (hit.dept !== 'La Paz') return { scope: 'other', dept: hit.dept === 'otro' ? null : hit.dept, basis };
  // El Alto nombrado en la dirección corrige a «La Paz» genérico
  let muni = hit.muni;
  if (muni === 'La Paz' && / el alto /.test(` ${fold(addrText).replace(/[^a-z0-9 ]/g, ' ')} `)) muni = 'El Alto';
  const z = findZone(addrText, muni === 'La Paz' || muni === 'El Alto' ? muni : undefined);
  if (!muni && z) muni = z.muni;
  // Un punto que contradice la ciudad (p. ej. «Obrajes, La Paz» clavado en el Beni)
  // es un pin mal puesto: se descarta y el enlace original queda en `raw.map_url`.
  let badCoords = basis.includes('coordenadas_fuera');
  const metro = (lat, lon) => lat >= -16.75 && lat <= -16.3 && lon >= -68.4 && lon <= -67.85;
  if (row.lat != null && (muni === 'La Paz' || muni === 'El Alto') && !metro(row.lat, row.lon)) badCoords = true;
  return { scope: 'lapaz', dept: 'La Paz', muni, locality: z ? z.z : null, basis, badCoords };
}

function phoneE164(p) {
  const d = p.replace(/[^\d+]/g, '');
  if (d.startsWith('+')) return d;
  const digits = d.replace(/\D/g, '');
  if (/^591\d{8}$/.test(digits)) return `+${digits}`;
  if (/^[2-7]\d{7}$/.test(digits)) return `+591${digits}`;
  return digits;
}

function canonicalUrl(row) {
  const u = row.final_url || row.fetch;
  try {
    const x = new URL(u);
    x.search = x.pathname.startsWith('/profile.php') ? `?id=${x.searchParams.get('id')}` : '';
    x.hash = '';
    return x.toString();
  } catch {
    return u;
  }
}

// ----------------------------------------------------------------- lectura
const lines = fs.readFileSync(path.join(WORK, 'pages.ndjson'), 'utf8').split('\n').filter(Boolean);
const byKey = new Map();
for (const l of lines) {
  const r = JSON.parse(l);
  const prev = byKey.get(r.key);
  // el último intento que no sea ERROR manda
  if (!prev || prev.status === 'ERROR' || r.status !== 'ERROR') byKey.set(r.key, r);
}
const queriesByKey = new Map();
for (const l of fs.readFileSync(path.join(WORK, 'candidates.ndjson'), 'utf8').split('\n').filter(Boolean)) {
  const c = JSON.parse(l);
  if (!queriesByKey.has(c.key)) queriesByKey.set(c.key, new Set());
  queriesByKey.get(c.key).add(c.query);
}

// ---------------------------------------------------------------- privacidad
//
// Reglas (pedido del coordinador, 27-oct):
// 1. Sólo se publican páginas de negocio CONFIRMADAS (status OK y tarjeta «Página»).
//    Las NOT_FOUND/RESTRICTED/BLOCKED no van al dataset: quedan como conteos por
//    estado y ciudad en `rejected-summary.json`, sin títulos, extractos ni URLs.
// 2. En todo texto libre se borran correos y teléfonos; el único teléfono que se
//    publica es el campo `phone` de la página confirmada.
// 3. Una página que parece de una persona (categoría de persona o nombre propio de
//    un profesional) se excluye.
import { scrub, verifyNoContacts, redactions, PHONE_G, EMAIL_G, STRUCTURED } from "./privacy.mjs";
// 4. Normalización NFKC, patrones de teléfono/correo y verificador: `privacy.mjs`.
/** De «site:facebook.com <rubro> <lugar>» a `{ via, query, rubro, city }`. */
const ALL_RUBROS = [...new Set([...RUBROS, ...RUBROS_ZONA, ...RUBROS_MUNICIPIO])].sort((a, b) => b.length - a.length);
function discoveryOf(query) {
  const q = query.replace(/^site:facebook\.com\s+/, '');
  const rubro = ALL_RUBROS.find((r) => q.toLowerCase().startsWith(`${r.toLowerCase()} `)) || null;
  const city = rubro ? q.slice(rubro.length).trim() : null;
  return { via: 'yahoo', query, rubro, city };
}

const fcat = (s) => fold(s).replace(/[^a-z0-9/ ]/g, ' ').replace(/\s+/g, ' ').trim();
const PERSON_CATS = [
  'persona', 'creador digital', 'creador de contenido digital', 'creador de videos', 'personaje publico',
  'figura publica', 'blogger', 'bloguero', 'blog personal', 'artista', 'musico/banda', 'musico', 'atleta',
  'deportista', 'politico', 'candidato', 'funcionario', 'periodista', 'escritor', 'autor', 'actor', 'actriz',
  'comediante', 'modelo', 'influencer', 'gamer', 'videojugador', 'personaje de ficcion', 'dj', 'cantante',
  'artista visual', 'fotografo', 'entrenador', 'entrenador personal', 'chef', 'presentador', 'conductor de television',
  'digital creator', 'public figure', 'personal blog', 'video creator', 'artist', 'musician/band', 'athlete',
  'politician', 'journalist', 'writer', 'author', 'comedian', 'model', 'gamer',
].map(fcat);
const PERSON_CAT_SET = new Set(PERSON_CATS);
// Profesiones que en Facebook suelen ser la página personal de alguien con título.
const PROFESSIONAL_CATS = ['medico', 'doctor', 'dentista', 'abogado', 'psicologo', 'nutricionista', 'terapeuta',
  'consultor', 'profesional', 'arquitecto', 'ingeniero', 'contador', 'quiropractico', 'pediatra', 'ginecologo',
  'cirujano', 'oftalmologo', 'dermatologo', 'odontologo', 'veterinario', 'psiquiatra', 'notario', 'coach'];
const TITLE_PREFIX = /^(dr|dra|doctor|doctora|lic|licda|licenciada|licenciado|ing|abog|abg|arq|prof|profe|mgr|msc|mg|phd|od|odont)\.?\s/i;
const BUSINESS_WORDS = /\b(clinica|consultorio|centro|estudio|bufete|despacho|instituto|laboratorio|farmacia|restaurante|tienda|store|shop|srl|s\.?a\.?|ltda|empresa|servicios|grupo|asociados|abogados|hermanos|hnos|y cia|compania|comercial|importadora|distribuidora|panaderia|polleria|salteneria|hotel|hostal|cafe|bar|pub|club|academia|colegio|unidad educativa|escuela|universidad|taller|ferreteria|boutique|spa|gym|gimnasio|market|super|bolivia|la paz|el alto)\b/i;

function personLike(r) {
  const cats = (r.categories || []).map(fcat);
  if (cats.some((c) => PERSON_CAT_SET.has(c))) return 'categoria_de_persona';
  const name = (r.name || '').replace(/\s*\|\s*[^|]{2,60}$/, '').trim();
  const fname = fold(name);
  if (TITLE_PREFIX.test(fname) && !BUSINESS_WORDS.test(fname)) return 'nombre_de_profesional';
  const professional = cats.some((c) => PROFESSIONAL_CATS.some((p) => c.includes(p)));
  // «Juan Pérez Mamani» con categoría de profesión: 2 a 4 palabras con mayúscula inicial,
  // sin cifras ni palabras de negocio.
  const words = name.split(/\s+/).filter(Boolean);
  const looksLikeName =
    words.length >= 2 && words.length <= 4 && words.every((w) => /^[A-ZÁÉÍÓÚÑ][a-záéíóúñü]+$/.test(w)) && !BUSINESS_WORDS.test(fname);
  if (professional && looksLikeName) return 'nombre_propio_con_categoria_profesional';
  if (!r.is_page) return 'sin_tarjeta_de_pagina';
  return null;
}

function queryCity(queries) {
  const qs = [...queries].join(' | ');
  if (/El Alto|Ceja|Senkata|Villa Adela|Rosas Pampa|Satelite|16 de Julio|Rio Seco/i.test(qs)) return 'El Alto';
  if (/La Paz Bolivia|Villa Copacabana|Calacoto/i.test(qs)) return 'La Paz';
  for (const m of LP_MUNIS) if (m !== 'La Paz' && m !== 'El Alto' && new RegExp(`\\b${m}\\b`, 'i').test(qs)) return m;
  return 'La Paz';
}

const removed = {
  perfil_personal_NOT_PAGE: 0,
  no_confirmada_RESTRICTED: 0,
  no_confirmada_BLOCKED: 0,
  no_confirmada_NOT_FOUND: 0,
  sin_leer_ERROR: 0,
  parece_persona: {},
  extranjera: 0,
};
const rejected = { by_status_and_city: {} };
const rejectCount = (status, city) => {
  rejected.by_status_and_city[status] ??= {};
  rejected.by_status_and_city[status][city] = (rejected.by_status_and_city[status][city] || 0) + 1;
};

const stats = { attempts: lines.length, keys: byKey.size, status: {}, foreign: 0 };
const byPage = new Map();
for (const r of byKey.values()) {
  stats.status[r.status] = (stats.status[r.status] || 0) + 1;
  const qs = queriesByKey.get(r.key) || new Set(r.queries || []);
  if (r.status !== 'OK') {
    const reason = r.status === 'NOT_PAGE' ? 'perfil_personal_NOT_PAGE' : r.status === 'ERROR' ? 'sin_leer_ERROR' : `no_confirmada_${r.status}`;
    removed[reason] = (removed[reason] || 0) + 1;
    rejectCount(r.status, queryCity(qs));
    continue;
  }
  const id = r.page_id || r.profile_id || r.key;
  const prev = byPage.get(id);
  if (prev) {
    for (const q of qs) prev._queries.add(q);
    prev._keys.add(r.key);
  } else byPage.set(id, { ...r, _queries: new Set(qs), _keys: new Set([r.key]) });
}

const files = { lapaz: [], sinUbicacion: [], otros: [] };
for (const [id, r] of byPage) {
  const person = personLike(r);
  if (person) {
    removed.parece_persona[person] = (removed.parece_persona[person] || 0) + 1;
    rejectCount(`EXCLUIDA_${person}`, queryCity(r._queries));
    continue;
  }
  const name = scrub((r.name || '').replace(/\s*\|\s*[^|]{2,60}$/, '').trim()) || null;
  const base = {
    source: 'facebook',
    source_id: id,
    name,
    category_raw: r.categories?.length ? r.categories.join(' · ') : null,
    address: scrub(r.address) || null,
    locality: null,
    municipality: null,
    department: null,
    lat: r.lat ?? null,
    lon: r.lon ?? null,
    phone: r.phones?.[0] ? phoneE164(r.phones[0]) : null,
    website: null,
    hours: null,
    source_updated_at: r.last_post_at || null,
    source_url: canonicalUrl(r),
    retrieved_at: r.retrieved_at,
    followers: r.followers ?? null,
    last_post_at: r.last_post_at || null,
    status: r.status,
  };
  const raw = {
    page_id: r.page_id || null,
    profile_id: r.profile_id || null,
    keys: [...r._keys],
    og_title: scrub(r.name) || null,
    meta_description: scrub(r.meta_description) || null,
    category_line: scrub(r.category_line) || null,
    categories: (r.categories || []).map(scrub),
    meta_city: scrub(r.meta_city) || null,
    // `map_url` no se publica: repite la dirección (texto libre) y las coordenadas ya
    // están en lat/lon.
    other_websites: [],
    has_whatsapp: (r.whatsapp || []).length > 0,
    extra_phones_count: Math.max(0, (r.phones || []).length - 1),
    hours_status_at_retrieval: scrub(r.hours_status) || null,
    services: scrub(r.services) || null,
    rating: scrub(r.rating) || null,
    other_intro: (r.other_intro || []).map((o) => ({ type: o.type, text: scrub(o.text) })),
    likes: r.likes ?? null,
    talking_about: r.talking_about ?? null,
    checkins: r.checkins ?? null,
    posts_seen: r.posts_seen ?? 0,
    is_business_page_active: r.is_business_page_active ?? null,
    http_status: r.http_status ?? null,
    html_sha256: r.html_sha256 || null,
    discovery: [...r._queries].sort().map(discoveryOf),
  };
  // Webs: una dirección con un tramo de 7+ dígitos (p. ej. un enlace con el número
  // del dueño) no se publica; las demás se publican tal cual.
  const okSites = (r.websites || []).filter((w) => {
    const bad = PHONE_G.test(w.normalize('NFKC')) || EMAIL_G.test(w.normalize('NFKC'));
    PHONE_G.lastIndex = 0;
    EMAIL_G.lastIndex = 0;
    if (bad) removed.web_con_numero = (removed.web_con_numero || 0) + 1;
    return !bad;
  });
  base.website = okSites[0] || null;
  raw.other_websites = okSites.slice(1);
  const c = classify(r);
  raw.geo_basis = c.basis;
  if (c.scope === 'foreign') {
    stats.foreign += 1;
    removed.extranjera += 1;
    continue;
  }
  if (c.scope === 'lapaz') {
    const coords = c.badCoords ? { lat: null, lon: null } : {};
    if (c.badCoords) raw.coords_discarded = { lat: r.lat, lon: r.lon, reason: 'el punto cae fuera de la ciudad declarada' };
    files.lapaz.push({ ...base, ...coords, department: 'La Paz', municipality: c.muni || null, locality: c.locality || null, raw });
  } else if (c.scope === 'other') {
    files.otros.push({ ...base, department: c.dept || null, raw });
  } else {
    files.sinUbicacion.push({ ...base, raw });
  }
}
rejected.removed_rows_by_reason = removed;
rejected.redactions_in_free_text = redactions;

const order = ['source', 'source_id', 'name', 'category_raw', 'address', 'locality', 'municipality', 'department', 'lat', 'lon', 'phone', 'website', 'hours', 'source_updated_at', 'source_url', 'retrieved_at', 'followers', 'last_post_at', 'status', 'raw'];
const ordered = (o) => Object.fromEntries(order.map((k) => [k, o[k] ?? null]));

const outputs = {
  'facebook-lapaz.ndjson.gz': files.lapaz,
  'facebook-lapaz-sin-ubicacion.ndjson.gz': files.sinUbicacion,
  'facebook-otros-departamentos.ndjson.gz': files.otros,
};
const manifest = { generated_at: new Date().toISOString(), source: 'facebook', scope: 'Departamento de La Paz, Bolivia', files: [] };
const findings = Object.entries(outputs).flatMap(([file, rows]) => verifyNoContacts(rows.map(ordered), file));
if (findings.length) {
  console.error(`verificador: ${findings.length} hallazgos de contacto fuera de \`phone\``);
  for (const f of findings.slice(0, 30)) console.error(JSON.stringify(f));
  process.exit(1);
}
manifest.privacy_check = {
  verifier: 'verifyNoContacts: tramos de 7+ dígitos (NFKC, \\p{Nd}, separadores) y correos, fuera de los campos estructurados',
  structured_fields_skipped: [...STRUCTURED],
  findings: 0,
};
for (const [file, rows] of Object.entries(outputs)) {
  rows.sort((a, b) => String(a.source_id).localeCompare(String(b.source_id)));
  const body = rows.map((r) => JSON.stringify(ordered(r))).join('\n') + (rows.length ? '\n' : '');
  const gz = zlib.gzipSync(Buffer.from(body, 'utf8'), { level: 9 });
  fs.writeFileSync(path.join(OUT, file), gz);
  manifest.files.push({ path: file, rows: rows.length, bytes: gz.length, sha256: crypto.createHash('sha256').update(gz).digest('hex') });
}

const pct = (rows, f) => (rows.length ? ((100 * rows.filter(f).length) / rows.length).toFixed(1) : '0.0');
const lp = files.lapaz;
const muniCount = {};
for (const r of lp) muniCount[r.municipality || '(sin municipio)'] = (muniCount[r.municipality || '(sin municipio)'] || 0) + 1;
const cutoff = Date.now() - 365 * 864e5;
const summary = {
  ...stats,
  pages_unique: byPage.size,
  lapaz: lp.length,
  sin_ubicacion: files.sinUbicacion.length,
  otros_departamentos: files.otros.length,
  lapaz_pct_latlon: pct(lp, (r) => r.lat != null),
  lapaz_pct_address: pct(lp, (r) => r.address && !/^\s*(la paz|el alto)\s*,\s*bolivia\s*$/i.test(r.address)),
  lapaz_pct_address_any: pct(lp, (r) => !!r.address),
  lapaz_pct_phone: pct(lp, (r) => !!r.phone),
  lapaz_pct_website: pct(lp, (r) => !!r.website),
  lapaz_pct_whatsapp: pct(lp, (r) => r.raw.has_whatsapp),
  lapaz_pct_followers: pct(lp, (r) => r.followers != null),
  lapaz_pct_last_post: pct(lp, (r) => !!r.last_post_at),
  lapaz_pct_active_12m: pct(lp, (r) => r.last_post_at && Date.parse(r.last_post_at) >= cutoff),
  lapaz_pct_locality: pct(lp, (r) => !!r.locality),
  municipalities: Object.fromEntries(Object.entries(muniCount).sort((a, b) => b[1] - a[1])),
  lapaz_geo_basis: lp.reduce((acc, r) => ((acc[r.raw.geo_basis] = (acc[r.raw.geo_basis] || 0) + 1), acc), {}),
  sin_ubicacion_por_status: files.sinUbicacion.reduce((acc, r) => ((acc[r.status] = (acc[r.status] || 0) + 1), acc), {}),
  otros_por_departamento: files.otros.reduce((acc, r) => ((acc[r.department || '(sin)'] = (acc[r.department || '(sin)'] || 0) + 1), acc), {}),
};
const queries = fs.readFileSync(path.join(WORK, 'queries_done.ndjson'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
summary.queries_done = queries.length;
summary.queries_with_facebook = queries.filter((q) => q.facebook > 0).length;
manifest.summary = summary;
summary.removed_rows_by_reason = removed;
summary.redactions_in_free_text = redactions;
const rejectedBody = JSON.stringify({ generated_at: manifest.generated_at, ...rejected }, null, 2) + '\n';
fs.writeFileSync(path.join(OUT, 'rejected-summary.json'), rejectedBody);
manifest.files.push({
  path: 'rejected-summary.json',
  rows: null,
  bytes: Buffer.byteLength(rejectedBody),
  sha256: crypto.createHash('sha256').update(rejectedBody).digest('hex'),
});
// Señales de bloqueo en la bitácora de la corrida.
const runLog = fs.existsSync(path.join(WORK, 'run.log')) ? fs.readFileSync(path.join(WORK, 'run.log'), 'utf8') : '';
summary.run_events = {
  yahoo_empty_or_challenge: (runLog.match(/yahoo vacío\/desafío/g) || []).length,
  yahoo_errors: (runLog.match(/yahoo error/g) || []).length,
  discovery_pauses: (runLog.match(/pausa de descubrimiento/g) || []).length,
  blocked_streak_pauses: (runLog.match(/muchas BLOCKED seguidas/g) || []).length,
  memory_waits: (runLog.match(/memoria libre .* cierro Chromium/g) || []).length,
  restarts: (runLog.match(/ reanudo: /g) || []).length,
};
fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

// README a partir de la plantilla.
const tpl = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), 'README.template.md');
if (fs.existsSync(tpl)) {
  const s = summary;
  const st = s.status;
  const results = [
    `- Consultas hechas: **${s.queries_done}** (con algún resultado de Facebook: ${s.queries_with_facebook}).`,
    `- Páginas abiertas: **${s.keys}** claves de URL → ${s.pages_unique} páginas confirmadas únicas tras deduplicar por id.`,
    `- Estados al abrir: ${Object.entries(st).map(([k, v]) => `${k} ${v}`).join(' · ')}.`,
    `- **Publicadas en La Paz: ${s.lapaz}**; sin ubicación: ${s.sin_ubicacion}; otros departamentos: ${s.otros_departamentos}` +
      (Object.keys(s.otros_por_departamento).length ? ` (${Object.entries(s.otros_por_departamento).map(([k, v]) => `${k} ${v}`).join(', ')})` : '') + '.',
    '',
    'Cobertura de `facebook-lapaz.ndjson.gz`:',
    '',
    '| Campo | % de filas |',
    '|---|---:|',
    `| lat/lon (punto fijado por el negocio) | ${s.lapaz_pct_latlon} % |`,
    `| dirección de calle (más que «La Paz, Bolivia») | ${s.lapaz_pct_address} % |`,
    `| dirección, cualquiera | ${s.lapaz_pct_address_any} % |`,
    `| teléfono | ${s.lapaz_pct_phone} % |`,
    `| web | ${s.lapaz_pct_website} % |`,
    `| WhatsApp de empresa (sólo la marca) | ${s.lapaz_pct_whatsapp} % |`,
    `| zona (\`locality\`) | ${s.lapaz_pct_locality} % |`,
    `| seguidores | ${s.lapaz_pct_followers} % |`,
    `| fecha del último post | ${s.lapaz_pct_last_post} % |`,
    `| último post en los últimos 12 meses | ${s.lapaz_pct_active_12m} % |`,
    '',
    `Por municipio: ${Object.entries(s.municipalities).map(([k, v]) => `${k} ${v}`).join(' · ')}.`,
    '',
    `Base de la ubicación: ${Object.entries(s.lapaz_geo_basis).map(([k, v]) => `\`${k}\` ${v}`).join(' · ')}.`,
  ].join('\n');
  const r = s.removed_rows_by_reason;
  const removedTxt = [
    '',
    '',
    `- perfil personal (sin tarjeta de página): ${r.perfil_personal_NOT_PAGE}`,
    `- no confirmadas: RESTRICTED ${r.no_confirmada_RESTRICTED}, BLOCKED ${r.no_confirmada_BLOCKED}, NOT_FOUND ${r.no_confirmada_NOT_FOUND}`,
    `- sin leer (error de red): ${r.sin_leer_ERROR}`,
    `- parecen de una persona: ${Object.entries(r.parece_persona).map(([k, v]) => `${k} ${v}`).join(', ') || '0'}`,
    `- fuera de Bolivia: ${r.extranjera}`,
    `- webs no publicadas por llevar un número: ${r.web_con_numero || 0}`,
    `- tramos borrados en texto libre: ${s.redactions_in_free_text.phone} numéricos, ${s.redactions_in_free_text.email} correos`,
    `- verificador independiente: **0 hallazgos**`,
  ].join('\n');
  const ev = s.run_events;
  const ritmo = `En esta corrida: ${ev.yahoo_empty_or_challenge} consultas de Yahoo vacías o con desafío, ${ev.discovery_pauses} pausas de descubrimiento, ${ev.blocked_streak_pauses} pausas por BLOCKED, ${ev.memory_waits} esperas por memoria y ${ev.restarts} arranques/reanudaciones.`;
  const out = fs
    .readFileSync(tpl, 'utf8')
    .replace('__ESTADO__', args.estado || 'corrida completa.')
    .replace('__N_LAPAZ__', String(s.lapaz))
    .replace('__N_SIN__', String(s.sin_ubicacion))
    .replace('__N_OTROS__', String(s.otros_departamentos))
    .replace('__N_QUERIES_TOTAL__', String(buildQueries().length))
    .replace('__N_QUERIES__', String(s.queries_done))
    .replace('__RESULTADOS__', results)
    .replace('__REMOVED__', removedTxt)
    .replace('__RITMO__', ritmo);
  fs.writeFileSync(path.join(OUT, 'README.md'), out);
}
console.log(JSON.stringify(summary, null, 2));
