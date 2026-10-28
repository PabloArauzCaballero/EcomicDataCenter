/**
 * Fase 1: el listado completo del registro.
 *
 * `GET empresas/buscarEmpresas?filtro=%20&tipoFiltro=nombre&limite=1000&pagina=N`
 * — un filtro de un solo espacio coincide con toda razón social, y el listado
 * trae `datos.total` (422.530 el 27-oct-2026) con todas las unidades: vigentes,
 * no renovadas y canceladas. Un filtro vacío da 412 («caracteres especiales»).
 * Una fila por unidad (su establecimiento principal); el orden es por razón
 * social.
 *
 * Guarda cada página tal cual en `<out>/list/p-NNNN.json.gz` y salta las que ya
 * existen, así que se reanuda volviendo a correrlo.
 */
import { mkdirSync, existsSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';
import { fetchJson, pool, pastDeadline } from './seprec-browser.mjs';

export async function collectList(page, out, threads = 2, limit = 1000) {
  const dir = join(out, 'list');
  mkdirSync(dir, { recursive: true });
  const q = (p) => `empresas/buscarEmpresas?filtro=%20&tipoFiltro=nombre&limite=${limit}&pagina=${p}`;
  const file = (p) => join(dir, `p-${String(p).padStart(4, '0')}.json.gz`);
  const save = (p, json) =>
    writeFileSync(file(p), gzipSync(JSON.stringify({ pagina: p, limite: limit, retrieved_at: new Date().toISOString(), total: json.datos.total, filas: json.datos.filas })));

  const first = await fetchJson(page, q(1));
  const total = first.json.datos.total;
  const pages = Math.ceil(total / limit);
  console.log(`[listado] total=${total} paginas=${pages} limite=${limit}`);
  writeFileSync(join(out, 'list-meta.json'), JSON.stringify({ total, pages, limit, at: new Date().toISOString() }));
  if (!existsSync(file(1))) save(1, first.json);
  const todo = [];
  for (let p = 2; p <= pages; p++) if (!existsSync(file(p))) todo.push(p);
  let done = 0;
  await pool(todo, threads, async (p) => {
    const r = await fetchJson(page, q(p));
    if (r.status !== 200) throw new Error(`pagina ${p}: ${r.status} ${JSON.stringify(r.json).slice(0, 200)}`);
    save(p, r.json);
    if (++done % 20 === 0) console.log(`[listado] ${done}/${todo.length}`);
  });
  console.log(pastDeadline() ? '[listado] corte por plazo' : '[listado] completo');
}
