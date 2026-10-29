/**
 * Verificador independiente de privacidad de la entrega de la Gaceta: lee los
 * `seprec-gaceta-NN.ndjson.gz` ya armados (no comparte código con el armador) y
 * busca correos, teléfonos y cédulas en cada campo de texto libre.
 *
 * Normaliza con NFKC (cifras de ancho completo, superíndices, «＠», etc.) y
 * detecta dígitos con separadores (espacios, puntos, guiones, paréntesis). Los
 * campos estructurales (ids, matrícula, fecha, URL) no se escanean como texto:
 * se validan por formato exacto. Sale con código 1 si hay algún hallazgo o una
 * clave fuera de la lista permitida.
 *
 *   node verify-gaceta-privacy.mjs <destino>
 */
import { readdirSync, readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join } from 'node:path';

const dest = process.argv[2];
if (!dest) throw new Error('uso: node verify-gaceta-privacy.mjs <destino>');

const ALLOWED = ['source', 'id_publicacion', 'codigo', 'matricula', 'matricula_anterior', 'razon_social', 'tipo_publicacion', 'fecha_publicacion', 'enlace', 'fuente_api'];
const FORMAT = {
  id_publicacion: /^\d{1,9}$/u,
  codigo: /^\d{1,9}\/\d{4}$/u,
  matricula: /^\d{4,13}$/u,
  matricula_anterior: /^\d{4,13}$/u,
  fecha_publicacion: /^\d{4}-\d{2}-\d{2}$/u,
  enlace: /^https:\/\/gacetadecomercio\.gob\.bo\/#\/publicaciones$/u,
  fuente_api: /^https:\/\/servicios\.seprec\.gob\.bo\/api\/publicaciones$/u,
  source: /^seprec_gaceta$/u,
};
const TEXT_FIELDS = ['razon_social', 'tipo_publicacion'];

const EMAIL = /[\p{L}\p{N}._%+'-]+\s*(?:@|\(\s*at\s*\)|\[\s*at\s*\]|\barroba\b)\s*[\p{L}\p{N}-]+(?:\s*(?:\.|\bpunto\b)\s*[\p{L}\p{N}-]+)+/iu;
const DIGIT_RUN = /(?:\d[\s.\-–—()/]*){6,}/u; // ≥ 6 dígitos seguidos, con separadores: teléfono o cédula
const CI_WORD = /\b(?:c\s*\.?\s*i\s*\.?|c[eé]dula|carnet|ci\s*n[º°o]?)\b\s*[:.\-]?\s*\d/iu;
const PHONE_WORD = /\b(?:tel[eé]fono|tel|cel|celular|whatsapp|fono|cont[aá]cto)\b\s*[:.\-]?\s*\+?\d/iu;

const findings = [];
const flag = (kind, id, field, value) => findings.push({ kind, id, field, value: String(value).slice(0, 80) });
let rows = 0;
for (const name of readdirSync(dest).filter((f) => /^seprec-gaceta-\d+\.ndjson\.gz$/.test(f)).sort()) {
  for (const line of gunzipSync(readFileSync(join(dest, name))).toString('utf8').split('\n')) {
    if (!line) continue;
    rows++;
    const r = JSON.parse(line);
    for (const k of Object.keys(r)) if (!ALLOWED.includes(k)) flag('clave_no_permitida', r.id_publicacion, k, k);
    for (const [k, re] of Object.entries(FORMAT)) {
      if (r[k] != null && !re.test(String(r[k]))) flag('formato', r.id_publicacion, k, r[k]);
    }
    for (const k of TEXT_FIELDS) {
      if (r[k] == null) continue;
      const t = String(r[k]).normalize('NFKC');
      // Un «@» suelto dentro de una palabra (VI@S, CAN@$) es estilo de marca, no un correo.
      if (EMAIL.test(t)) flag('correo', r.id_publicacion, k, t);
      if (DIGIT_RUN.test(t)) flag('digitos_6+', r.id_publicacion, k, t);
      if (CI_WORD.test(t)) flag('cedula', r.id_publicacion, k, t);
      if (PHONE_WORD.test(t)) flag('telefono', r.id_publicacion, k, t);
    }
  }
}
console.log(JSON.stringify({ filas_verificadas: rows, hallazgos: findings.length, muestra: findings.slice(0, 25) }, null, 1));
process.exit(findings.length ? 1 : 0);
