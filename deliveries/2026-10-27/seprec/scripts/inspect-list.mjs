/**
 * Mide el listado descargado: filas, ids únicos, unidades con más de un
 * establecimiento, y los repartos por estado, tipo y departamento.
 *
 *   node inspect-list.mjs <out>
 */
import { readdirSync, readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join } from 'node:path';

const [out] = process.argv.slice(2);
const dir = join(out, 'list');
let rows = 0;
const ids = new Map();
const keys = new Set();
const count = (m, k) => m.set(k, (m.get(k) ?? 0) + 1);
const estado = new Map(), act = new Map(), tipo = new Map(), dep = new Map();
const files = readdirSync(dir).sort();
for (const f of files) {
  const { filas } = JSON.parse(gunzipSync(readFileSync(join(dir, f))).toString('utf8'));
  for (const r of filas) {
    rows++;
    const key = `${r.id}/${r.idEstablecimiento}`;
    if (keys.has(key)) continue;
    keys.add(key);
    count(ids, r.id);
    count(estado, r.estado);
    count(act, r.codEstadoActualizacion?.nombre);
    count(tipo, r.codTipoUnidadEconomica?.nombre);
    count(dep, r.direccion?.codDepartamento?.nombre);
  }
}
const multi = [...ids.values()].filter((v) => v > 1).length;
console.log({ files: files.length, rows, uniqueKeys: keys.size, uniqueIds: ids.size, idsWithSeveralEstablishments: multi });
for (const [name, m] of Object.entries({ estado, act, tipo, dep })) console.log(name, Object.fromEntries([...m].sort((a, b) => b[1] - a[1])));
