/**
 * Fase 3 (enriquecimiento): el índice de la Gaceta Electrónica de Comercio.
 *
 * `POST https://servicios.seprec.gob.bo/api/publicaciones` con el cuerpo que
 * arma `gacetadecomercio.gob.bo` (todos los filtros vacíos, `limite` ≤ 100,
 * `pagina`). Sin sesión ni captcha. 228.671 publicaciones el 27-oct-2026, de
 * 2017 (las de FUNDEMPRESA migradas) a hoy, cada una con la matrícula de la
 * empresa, el título del acto y la fecha. La API acepta la llamada desde la
 * página de `miempresa.seprec.gob.bo` igual que desde la de la Gaceta.
 *
 * De aquí sale la fecha de constitución de las sociedades cuya constitución se
 * publicó en la Gaceta; el registro (`buscarEmpresas`) no publica la fecha de
 * inscripción. **No se guarda el `resumen`**: es texto libre y nombra socios,
 * números de cédula y domicilios de personas.
 */
import { mkdirSync, existsSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';
import { fetchJson, pool } from './seprec-browser.mjs';

const LIMIT = 100;
const body = (pagina) => ({
  fechaInicial: '', fecha: '', fechaFinal: '', categoria: '', texto: '', razonSocial: '',
  tipoPublicacion: '', matricula: '', resumen: '', limite: LIMIT, pagina,
});
const keep = (f) => ({
  id: f.id,
  codigo: f.codigo,
  titulo: f.titulo,
  fechaPublicacion: f.fechaPublicacion,
  matricula: f.empresa?.matricula ?? null,
  matriculaAnterior: f.empresa?.matriculaAnterior ?? null,
  razonSocial: f.empresa?.razonSocial ?? null,
});

export async function collectGaceta(page, out, threads = 2) {
  const dir = join(out, 'gaceta');
  mkdirSync(dir, { recursive: true });
  const file = (p) => join(dir, `g-${String(p).padStart(5, '0')}.json.gz`);
  const save = (p, filas) => writeFileSync(file(p), gzipSync(JSON.stringify({ pagina: p, retrieved_at: new Date().toISOString(), filas: filas.map(keep) })));
  const first = await fetchJson(page, 'publicaciones', { body: body(1) });
  const total = first.json.datos.total;
  const pages = Math.ceil(total / LIMIT);
  console.log(`[gaceta] total=${total} paginas=${pages}`);
  writeFileSync(join(out, 'gaceta-meta.json'), JSON.stringify({ total, pages, limit: LIMIT, at: new Date().toISOString() }));
  if (!existsSync(file(1))) save(1, first.json.datos.filas);
  const todo = [];
  for (let p = 2; p <= pages; p++) if (!existsSync(file(p))) todo.push(p);
  let n = 0;
  await pool(todo, threads, async (p) => {
    const r = await fetchJson(page, 'publicaciones', { body: body(p) });
    if (!r.json.finalizado) throw new Error(`pagina ${p}: ${JSON.stringify(r.json).slice(0, 200)}`);
    save(p, r.json.datos.filas);
    if (++n % 100 === 0) console.log(`[gaceta] ${n}/${todo.length}`);
  });
  console.log('[gaceta] completa');
}
