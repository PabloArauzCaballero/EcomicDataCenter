// Ciudades del alcance (y las de fuera, para descartar lo que cae en La Paz o Santa Cruz).
// [nombre, municipio, departamento, lat, lon, alias...]
export const PLACES = [
  // Cochabamba
  ['Cochabamba', 'Cochabamba', 'Cochabamba', -17.3935, -66.157, 'cercado', 'cbba'],
  ['Quillacollo', 'Quillacollo', 'Cochabamba', -17.392, -66.278],
  ['Sacaba', 'Sacaba', 'Cochabamba', -17.398, -66.04],
  ['Colcapirhua', 'Colcapirhua', 'Cochabamba', -17.39, -66.24],
  ['Tiquipaya', 'Tiquipaya', 'Cochabamba', -17.338, -66.215],
  ['Vinto', 'Vinto', 'Cochabamba', -17.397, -66.313],
  ['Sipe Sipe', 'Sipe Sipe', 'Cochabamba', -17.45, -66.38],
  ['Punata', 'Punata', 'Cochabamba', -17.547, -65.836],
  ['Cliza', 'Cliza', 'Cochabamba', -17.588, -65.933],
  ['Tarata', 'Tarata', 'Cochabamba', -17.61, -66.02],
  ['Aiquile', 'Aiquile', 'Cochabamba', -18.2, -65.18],
  ['Villa Tunari', 'Villa Tunari', 'Cochabamba', -16.97, -65.42],
  ['Shinahota', 'Shinahota', 'Cochabamba', -16.99, -65.25],
  ['Chimoré', 'Chimoré', 'Cochabamba', -16.99, -65.15, 'chimore'],
  ['Ivirgarzama', 'Puerto Villarroel', 'Cochabamba', -17.03, -64.85, 'puerto villarroel'],
  ['Entre Ríos (Cochabamba)', 'Entre Ríos', 'Cochabamba', -17.2, -64.65],
  // Oruro
  ['Oruro', 'Oruro', 'Oruro', -17.9667, -67.1167],
  ['Huanuni', 'Huanuni', 'Oruro', -18.289, -66.838],
  ['Challapata', 'Challapata', 'Oruro', -18.9, -66.78],
  ['Caracollo', 'Caracollo', 'Oruro', -17.64, -67.21],
  // Potosí
  ['Potosí', 'Potosí', 'Potosí', -19.5836, -65.7531, 'potosi'],
  ['Llallagua', 'Llallagua', 'Potosí', -18.42, -66.58],
  ['Uncía', 'Uncía', 'Potosí', -18.47, -66.57, 'uncia'],
  ['Uyuni', 'Uyuni', 'Potosí', -20.46, -66.825],
  ['Villazón', 'Villazón', 'Potosí', -22.087, -65.594, 'villazon'],
  ['Tupiza', 'Tupiza', 'Potosí', -21.44, -65.72],
  ['Betanzos', 'Betanzos', 'Potosí', -19.55, -65.45],
  // Chuquisaca
  ['Sucre', 'Sucre', 'Chuquisaca', -19.0333, -65.2627],
  ['Monteagudo', 'Monteagudo', 'Chuquisaca', -19.8, -63.95],
  ['Camargo', 'Camargo', 'Chuquisaca', -20.64, -65.21],
  ['Tarabuco', 'Tarabuco', 'Chuquisaca', -19.18, -64.92],
  ['Padilla', 'Padilla', 'Chuquisaca', -19.31, -64.3],
  ['Muyupampa', 'Villa Vaca Guzmán', 'Chuquisaca', -19.87, -63.75],
  // Tarija
  ['Tarija', 'Tarija', 'Tarija', -21.5355, -64.7296, 'cercado'],
  ['Yacuiba', 'Yacuiba', 'Tarija', -22.015, -63.677],
  ['Villamontes', 'Villamontes', 'Tarija', -21.26, -63.47, 'villa montes'],
  ['Bermejo', 'Bermejo', 'Tarija', -22.73, -64.34],
  ['Entre Ríos', 'Entre Ríos', 'Tarija', -21.53, -64.17, 'entre rios'],
  ['Padcaya', 'Padcaya', 'Tarija', -21.88, -64.71],
  ['Caraparí', 'Caraparí', 'Tarija', -21.83, -63.75, 'carapari'],
  ['San Lorenzo', 'San Lorenzo', 'Tarija', -21.42, -64.75],
  // Beni
  ['Trinidad', 'Trinidad', 'Beni', -14.8333, -64.9],
  ['Riberalta', 'Riberalta', 'Beni', -11.0, -66.07],
  ['Guayaramerín', 'Guayaramerín', 'Beni', -10.83, -65.36, 'guayaramerin'],
  ['San Borja', 'San Borja', 'Beni', -14.86, -66.75],
  ['Rurrenabaque', 'Rurrenabaque', 'Beni', -14.44, -67.53],
  ['Santa Ana del Yacuma', 'Santa Ana del Yacuma', 'Beni', -13.75, -65.43, 'santa ana'],
  ['San Ignacio de Moxos', 'San Ignacio', 'Beni', -14.99, -65.64, 'moxos'],
  // Pando
  ['Cobija', 'Cobija', 'Pando', -11.03, -68.77],
  ['Porvenir', 'Porvenir', 'Pando', -11.25, -68.68],
  ['Puerto Rico', 'Puerto Rico', 'Pando', -11.1, -67.55],
  // Fuera del alcance de este agente (otros agentes los cubren)
  ['La Paz', 'La Paz', 'La Paz', -16.5, -68.15],
  ['El Alto', 'El Alto', 'La Paz', -16.51, -68.19],
  ['Viacha', 'Viacha', 'La Paz', -16.65, -68.3],
  ['Copacabana', 'Copacabana', 'La Paz', -16.17, -69.09],
  ['Caranavi', 'Caranavi', 'La Paz', -15.83, -67.57],
  ['Coroico', 'Coroico', 'La Paz', -16.19, -67.73],
  ['Santa Cruz de la Sierra', 'Santa Cruz de la Sierra', 'Santa Cruz', -17.7833, -63.1821, 'santa cruz'],
  ['Montero', 'Montero', 'Santa Cruz', -17.34, -63.25],
  ['Warnes', 'Warnes', 'Santa Cruz', -17.51, -63.17],
  ['Cotoca', 'Cotoca', 'Santa Cruz', -17.75, -62.99],
  ['Camiri', 'Camiri', 'Santa Cruz', -20.05, -63.52],
  ['San Ignacio de Velasco', 'San Ignacio de Velasco', 'Santa Cruz', -16.37, -60.96],
  ['Puerto Suárez', 'Puerto Suárez', 'Santa Cruz', -18.96, -57.8],
  ['Vallegrande', 'Vallegrande', 'Santa Cruz', -18.49, -64.11],
  ['Yapacaní', 'Yapacaní', 'Santa Cruz', -17.4, -63.88],
  ['San Julián', 'San Julián', 'Santa Cruz', -17.78, -62.87],
];

export const IN_SCOPE = new Set(['Cochabamba', 'Oruro', 'Potosí', 'Chuquisaca', 'Tarija', 'Beni', 'Pando']);

export const DEPARTMENTS = {
  cochabamba: 'Cochabamba', oruro: 'Oruro', potosi: 'Potosí', chuquisaca: 'Chuquisaca', tarija: 'Tarija',
  beni: 'Beni', pando: 'Pando', 'la paz': 'La Paz', 'santa cruz': 'Santa Cruz',
};

export const fold = (s) => (s || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();

function km(a, b, c, d) {
  const r = Math.PI / 180;
  const x = (d - b) * r * Math.cos(((a + c) / 2) * r);
  const y = (c - a) * r;
  return Math.sqrt(x * x + y * y) * 6371;
}

// Las capitales y El Alto ocupan una mancha urbana mayor que su centro: a igual
// distancia, un punto pertenece antes a la capital que a un municipio vecino.
const CAPITALS = new Set(['Cochabamba', 'Oruro', 'Potosí', 'Sucre', 'Tarija', 'Trinidad', 'Cobija', 'La Paz', 'El Alto', 'Santa Cruz de la Sierra']);

export function nearest(lat, lon) {
  let best = null;
  for (const p of PLACES) {
    const raw = km(lat, lon, p[3], p[4]);
    const d = CAPITALS.has(p[0]) ? raw * 0.6 : raw;
    if (!best || d < best.score) best = { p, d: raw, score: d };
  }
  return best;
}

const inBolivia = (lat, lon) => lat > -23.1 && lat < -9.6 && lon > -69.8 && lon < -57.4;

function placeByName(text) {
  const t = fold(text).replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!t) return null;
  for (const p of PLACES) {
    const names = [p[0], p[1], ...p.slice(5)].map(fold);
    if (names.includes(t)) return p;
  }
  return null;
}

/**
 * Ubica una página: primero por sus coordenadas, luego por los componentes de la
 * dirección leídos de derecha a izquierda (para no tomar «Cobija 345» —una calle
 * de Cochabamba— por la ciudad de Cobija), luego por la ciudad del texto de la
 * página, y por último la ciudad de la consulta que la trajo.
 */
export function locate({ lat, lon, address, cityText, descCity, queryCity }) {
  if (typeof lat === 'number' && typeof lon === 'number') {
    if (!inBolivia(lat, lon)) return { department: null, out: 'fuera de Bolivia', source: 'coords' };
    const n = nearest(lat, lon);
    const r = { department: n.p[2], source: 'coords', distance_km: Math.round(n.d * 10) / 10 };
    const byText = locateText([address, cityText, descCity]);
    if (byText?.locality && byText.department === r.department) {
      r.locality = byText.locality; r.municipality = byText.municipality;
    } else if (n.d <= 15) { r.locality = n.p[0]; r.municipality = n.p[1]; }
    return r;
  }
  const byText = locateText([address, cityText, descCity], address);
  if (byText) return byText;
  if (queryCity) {
    const p = PLACES.find((x) => x[0] === queryCity);
    if (p) return { department: p[2], locality: p[0], municipality: p[1], source: 'query' };
  }
  return { department: null, source: 'none' };
}

function locateText(texts, address) {
  for (const text of texts) {
    if (!text) continue;
    const parts = text.split(/[,·|\-–]/).map((s) => s.trim()).filter(Boolean).reverse();
    if (parts.length && /^bolivia$/i.test(fold(parts[0]))) parts.shift();
    else if (text === address && /\b(argentina|peru|per[uú]|brasil|brazil|chile|paraguay|espa[nñ]a|usa|mexico)\b/i.test(fold(text))) {
      return { department: null, out: 'fuera de Bolivia', source: 'address' };
    }
    let dept = null;
    for (const part of parts.slice(0, 3)) {
      const f = fold(part).replace(/^(departamento de|depto\.?|ciudad de|ciudad)\s+/, '');
      const p = placeByName(f);
      if (p) return { department: p[2], locality: p[0], municipality: p[1], source: text === address ? 'address' : 'city_text' };
      if (!dept && DEPARTMENTS[f]) dept = DEPARTMENTS[f];
    }
    if (dept) return { department: dept, source: text === address ? 'address' : 'city_text' };
  }
  return null;
}
