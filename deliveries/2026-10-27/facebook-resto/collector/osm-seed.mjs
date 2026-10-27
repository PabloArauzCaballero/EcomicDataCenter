// Semilla complementaria: los lugares de OpenStreetMap en los siete departamentos que
// enlazan su página de Facebook (`facebook=*` o `contact:facebook=*`). Sólo aporta la
// dirección de la página; lo que se entrega sale de la página misma.
import fs from 'node:fs';
import { appendLine, file, log, normalizeFb } from './common.mjs';

fs.writeFileSync(file('osm.pending'), new Date().toISOString());
const query = `[out:json][timeout:180];
area["ISO3166-2"~"^BO-(C|O|P|H|T|B|N)$"]->.a;
nwr(area.a)[~"^(contact:)?facebook$"~"."];
out tags center;`;
const seen = new Set(fs.existsSync(file('candidates.ndjson'))
  ? fs.readFileSync(file('candidates.ndjson'), 'utf8').split('\n').map((l) => /"key":"([^"]+)"/.exec(l)?.[1]).filter(Boolean)
  : []);
const r = await fetch('https://overpass-api.de/api/interpreter', {
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded', 'user-agent': 'DatosBolivia-collector/1.0' },
  body: `data=${encodeURIComponent(query)}`,
});
const data = await r.json();
let added = 0;
for (const el of data.elements || []) {
  const t = el.tags || {};
  const raw = t['contact:facebook'] || t.facebook;
  const url = /^https?:|facebook\.com/i.test(raw) ? raw : `https://www.facebook.com/${raw}`;
  const n = normalizeFb(url.replace(/^(?!https?:)/, 'https://'));
  if (!n || seen.has(n.key)) continue;
  seen.add(n.key);
  added += 1;
  appendLine('candidates.ndjson', {
    key: n.key, url: n.url, found_url: url, title: t.name || null, snippet: null,
    query: null, rubro: t.amenity || t.shop || t.tourism || t.office || t.craft || t.leisure || t.healthcare || null,
    city: null, via: 'osm', osm: { type: el.type, id: el.id, lat: el.lat ?? el.center?.lat, lon: el.lon ?? el.center?.lon }, at: new Date().toISOString(),
  });
}
fs.rmSync(file('osm.pending'));
log(`osm: ${data.elements?.length ?? 0} elementos con Facebook, ${added} candidatas nuevas`);
