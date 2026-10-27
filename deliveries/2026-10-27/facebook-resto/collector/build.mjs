// Arma la entrega a partir del estado: deduplica, completa con OSM lo que la página no
// trae, escribe el NDJSON comprimido, las cifras y el manifest con los sha256.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { HERE, readLines } from './common.mjs';
import { IN_SCOPE, locate } from './geo.mjs';
import { readme } from './readme.mjs';
import { personReason, scrubRecord } from './privacy.mjs';

const OUT = path.join(HERE, '..');
const candidates = readLines('candidates.ndjson');
const osmByUrl = new Map(candidates.filter((c) => c.via === 'osm').map((c) => [c.found_url, c]));
const fetched = readLines('fetched.ndjson');

const ORDER = ['source', 'source_id', 'name', 'category_raw', 'address', 'locality', 'municipality', 'department', 'lat', 'lon',
  'phone', 'website', 'hours', 'source_updated_at', 'source_url', 'retrieved_at', 'raw', 'followers', 'last_post_at', 'status'];

const byId = new Map();
const excluded = {};
const bump = (k) => { excluded[k] = (excluded[k] || 0) + 1; };
// Filas no confirmadas como página de negocio: sólo se cuentan, por estado y ciudad.
const rejected = {};
const rejectedKeys = new Set();
const okKeys = new Set();
const allRecords = readLines('records.ndjson');
for (const r of allRecords) if (r.status === 'OK') okKeys.add(r.source_id || r.source_url);
for (const r0 of allRecords) {
  const r = { ...r0, raw: { ...r0.raw } };
  if (r.status !== 'OK') {
    const k = r.source_id || r.source_url;
    if (okKeys.has(k) || rejectedKeys.has(k)) continue;
    rejectedKeys.add(k);
    const city = r.raw.discovery?.city || r.locality || '(sin ciudad: semilla OSM)';
    rejected[r.status] ??= {};
    rejected[r.status][city] = (rejected[r.status][city] || 0) + 1;
    continue;
  }
  if (/^Perfil\b/i.test(r.category_raw || '')) { bump('persona: categoría de persona'); continue; }
  const person = personReason(r);
  if (person) { bump(`persona: ${person}`); continue; }
  if (r.whatsapp !== undefined) { r.raw.whatsapp = r.whatsapp; delete r.whatsapp; }
  const osm = osmByUrl.get(r.raw.discovery?.found_url);
  if (osm) {
    r.raw.osm = osm.osm;
    if (r.lat == null && osm.osm?.lat != null) {
      r.lat = osm.osm.lat; r.lon = osm.osm.lon; r.raw.coords_source = 'osm';
    }
    if (!r.department || ['none', 'query'].includes(r.raw.location_source)) {
      const loc = locate({ lat: r.lat, lon: r.lon, address: r.address, cityText: r.raw.city_text, descCity: r.raw.desc_city });
      if (loc.out) { bump(loc.out); continue; }
      if (loc.department) {
        r.department = loc.department; r.locality = loc.locality || null; r.municipality = loc.municipality || null;
        r.raw.location_source = r.raw.coords_source === 'osm' ? 'osm_coords' : loc.source;
      }
    }
  } else if (r.lat != null) {
    r.raw.coords_source = 'facebook';
  }
  if (r.lat != null && !r.raw.coords_source) r.raw.coords_source = 'facebook';
  if (!r.department) { bump('sin ubicación'); continue; }
  if (!IN_SCOPE.has(r.department)) { bump(`fuera de alcance: ${r.department}`); continue; }
  const key = r.source_id || r.source_url;
  const prev = byId.get(key);
  if (prev && prev.status === 'OK' && r.status !== 'OK') continue;
  const clean = scrubRecord(r);
  byId.set(key, Object.fromEntries(ORDER.map((k) => [k, clean[k] ?? null])));
}
for (const f of fetched) if (f.status === 'SKIP') bump(f.why || 'omitida');

const records = [...byId.values()].sort((a, b) => (a.department + a.locality + a.name).localeCompare(b.department + b.locality + b.name, 'es'));
const ndjson = records.map((r) => JSON.stringify(r)).join('\n') + '\n';
const gzPath = path.join(OUT, 'facebook-resto.ndjson.gz');
fs.writeFileSync(gzPath, zlib.gzipSync(Buffer.from(ndjson, 'utf8'), { level: 9 }));

const pct = (n, d) => (d ? Math.round((1000 * n) / d) / 10 : 0);
const ok = records.filter((r) => r.status === 'OK');
const stat = (list) => ({
  pages: list.length,
  ok: list.filter((r) => r.status === 'OK').length,
  with_latlon: list.filter((r) => r.lat != null).length,
  with_latlon_from_facebook: list.filter((r) => r.raw.coords_source === 'facebook').length,
  with_address: list.filter((r) => r.address).length,
  with_phone: list.filter((r) => r.phone).length,
  with_website: list.filter((r) => r.website).length,
  with_hours: list.filter((r) => r.hours).length,
  with_followers: list.filter((r) => r.followers != null).length,
  with_last_post: list.filter((r) => r.last_post_at).length,
});
const byDept = {};
for (const d of [...IN_SCOPE]) byDept[d] = stat(records.filter((r) => r.department === d));
const byStatus = {};
for (const r of records) byStatus[r.status] = (byStatus[r.status] || 0) + 1;
const byLocality = {};
for (const r of records) { const k = `${r.department} · ${r.locality || '(sin localidad)'}`; byLocality[k] = (byLocality[k] || 0) + 1; }
const byVia = {};
for (const r of records) { const k = r.raw.discovery?.via || '?'; byVia[k] = (byVia[k] || 0) + 1; }
const byLocSource = {};
for (const r of records) { const k = r.raw.location_source || '?'; byLocSource[k] = (byLocSource[k] || 0) + 1; }
const total = stat(records);
const stats = {
  generated_at: new Date().toISOString(),
  total,
  pct_ok: { latlon: pct(total.with_latlon, records.length), latlon_from_facebook: pct(total.with_latlon_from_facebook, records.length), address: pct(total.with_address, records.length), phone: pct(total.with_phone, records.length), website: pct(total.with_website, records.length), last_post: pct(total.with_last_post, records.length) },
  pct_of_ok_pages: { latlon: pct(ok.filter((r) => r.lat != null).length, ok.length), address: pct(ok.filter((r) => r.address).length, ok.length), phone: pct(ok.filter((r) => r.phone).length, ok.length) },
  by_status: byStatus,
  by_department: byDept,
  by_locality: Object.fromEntries(Object.entries(byLocality).sort((a, b) => b[1] - a[1])),
  by_discovery: byVia,
  by_location_source: byLocSource,
  excluded,
  candidates: { total: new Set(candidates.map((c) => c.key)).size, yahoo: new Set(candidates.filter((c) => c.via === 'yahoo').map((c) => c.key)).size, osm: osmByUrl.size, fetched: fetched.length },
  queries_done: fs.existsSync(path.join(OUT, '.work', 'state', 'queries.done')) ? fs.readFileSync(path.join(OUT, '.work', 'state', 'queries.done'), 'utf8').split('\n').filter(Boolean).length : 0,
};
const rejectedTotals = Object.fromEntries(Object.entries(rejected).map(([k, v]) => [k, Object.values(v).reduce((a, b) => a + b, 0)]));
fs.writeFileSync(path.join(OUT, 'rejected-summary.json'), `${JSON.stringify({
  note: 'Filas no confirmadas como página de negocio (NOT_FOUND, RESTRICTED, BLOCKED): no se publican. Sólo conteos por estado y por la ciudad de la búsqueda que las trajo.',
  totals: rejectedTotals,
  by_status_and_city: rejected,
}, null, 2)}\n`);
stats.rejected = rejectedTotals;
fs.writeFileSync(path.join(OUT, 'stats.json'), `${JSON.stringify(stats, null, 2)}\n`);

fs.writeFileSync(path.join(OUT, 'README.md'), readme(stats));

const sha = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const files = ['facebook-resto.ndjson.gz', 'stats.json', 'rejected-summary.json', 'README.md', ...fs.readdirSync(path.join(OUT, 'collector')).map((f) => `collector/${f}`)]
  .filter((f) => fs.existsSync(path.join(OUT, f)));
const manifest = {
  delivery: 'facebook-resto',
  date: '2026-10-27',
  source: 'facebook',
  scope: [...IN_SCOPE],
  records: records.length,
  files: files.map((f) => ({ path: f, bytes: fs.statSync(path.join(OUT, f)).size, sha256: sha(path.join(OUT, f)), ...(f.endsWith('.gz') ? { records: records.length, format: 'ndjson+gzip' } : {}) })),
};
fs.writeFileSync(path.join(OUT, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify({ records: records.length, by_status: byStatus, pct: stats.pct_ok, by_department: Object.fromEntries(Object.entries(byDept).map(([k, v]) => [k, v.pages])), excluded }, null, 1));
