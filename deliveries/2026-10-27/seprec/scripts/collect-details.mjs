/**
 * Fase 2: la ficha pública de cada unidad con matrícula renovada.
 *
 * `GET empresas/informacionBasicaEmpresa/{id}/establecimiento/{idEstablecimiento}`
 * — es la ficha «Más información» del portal. Solo responde para matrículas
 * renovadas: para las no renovadas y las canceladas devuelve 412 «No se
 * encontró la empresa o esta inactiva» (el portal tampoco la muestra: «Como la
 * matrícula no se encuentra actualizada, no se muestra la información»).
 *
 * Trae NIT, objeto social, mes de cierre, último año renovado y el domicilio
 * (vía, número, edificio, piso, coordenadas, departamento, provincia y
 * municipio). También trae teléfonos y correos: **se descartan aquí, antes de
 * escribir nada a disco**. Solo se conserva el sitio web, que es de la empresa.
 *
 * Escribe NDJSON en `<out>/details/w-<hilo>.ndjson` (una línea por unidad,
 * también las 412) y se reanuda leyendo lo ya escrito.
 */
import { mkdirSync, readdirSync, readFileSync, appendFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join } from 'node:path';
import { fetchJson, pool } from './seprec-browser.mjs';

/** Quita teléfonos y correos; deja solo el sitio web declarado. */
export function scrub(datos) {
  const { contactos, ...rest } = datos;
  const web = [];
  for (const c of contactos ?? []) {
    if (c.tipoContacto !== 'SITIO WEB') continue;
    for (const d of c.descripcion ?? []) if (d.web) web.push(d.web);
  }
  return { ...rest, sitio_web: web.length ? [...new Set(web)] : null };
}

export async function collectDetails(page, out, threads = 2, { all = false } = {}) {
  const listDir = join(out, 'list');
  const dir = join(out, 'details');
  mkdirSync(dir, { recursive: true });
  const done = new Set();
  for (const f of readdirSync(dir)) {
    for (const line of readFileSync(join(dir, f), 'utf8').split('\n')) {
      if (!line) continue;
      try {
        const d = JSON.parse(line);
        if (d.status !== 'error') done.add(d.key);
      } catch {}
    }
  }
  const todo = [];
  const seen = new Set();
  for (const f of readdirSync(listDir).sort()) {
    const { filas } = JSON.parse(gunzipSync(readFileSync(join(listDir, f))).toString('utf8'));
    for (const r of filas) {
      const key = `${r.id}/${r.idEstablecimiento}`;
      if (seen.has(key) || done.has(key)) continue;
      seen.add(key);
      if (!all && r.codEstadoActualizacion?.nombre !== 'MATRICULA RENOVADA') continue;
      todo.push({ id: r.id, est: r.idEstablecimiento, key });
    }
  }
  console.log(`[fichas] ya hechas=${done.size} por pedir=${todo.length}`);
  let n = 0;
  let ok = 0;
  const t0 = Date.now();
  await pool(
    todo.map((t, i) => ({ ...t, w: i % threads })),
    threads,
    async (t) => {
      let r;
      try {
        r = await fetchJson(page, `empresas/informacionBasicaEmpresa/${t.id}/establecimiento/${t.est}`, { tries: 4 });
      } catch (e) {
        // Error persistente del servidor (p. ej. 500 en fichas a medio crear):
        // se anota y se sigue; la próxima corrida lo vuelve a pedir.
        appendFileSync(join(dir, `w-${t.w}.ndjson`), JSON.stringify({ key: t.key, status: 'error', network: e.network ?? null, retrieved_at: new Date().toISOString() }) + '\n');
        n++;
        return;
      }
      const line =
        r.status === 200 && r.json.datos
          ? { key: t.key, status: 200, retrieved_at: new Date().toISOString(), datos: scrub(r.json.datos) }
          : { key: t.key, status: r.status, retrieved_at: new Date().toISOString(), mensaje: r.json.mensaje };
      if (line.status === 200) ok++;
      appendFileSync(join(dir, `w-${t.w}.ndjson`), JSON.stringify(line) + '\n');
      if (++n % 1000 === 0) {
        const rate = n / ((Date.now() - t0) / 1000);
        console.log(`[fichas] ${n}/${todo.length} ok=${ok} ${rate.toFixed(1)}/s eta=${((todo.length - n) / rate / 60).toFixed(0)}min`);
      }
    },
  );
  console.log(`[fichas] fin: ${n} pedidas, ${ok} con ficha`);
}
