/**
 * Limpieza de contactos en texto libre y verificador independiente.
 *
 * Reglas de la revisión de seguridad (27-oct):
 * - El texto se normaliza con NFKC antes de buscar (dígitos de ancho completo,
 *   arrobas compatibles, etc.).
 * - Teléfono: cualquier tramo de 7 o más dígitos Unicode (\p{Nd}) unidos por
 *   espacios, guiones Unicode, punto, barra, «·» o paréntesis. Se borra aunque
 *   sea una cifra de seguidores: la cifra ya está en `followers`.
 * - Correo: «@», «(arroba)», «[arroba]», «arroba», «(at)», «[at]», con «.» o
 *   «punto», «(punto)», «[punto]», «(dot)» como separador de dominio.
 * - El único teléfono publicado es el campo `phone` de una página confirmada.
 */

const SEP = '[\\s\\-\\u2010-\\u2015\\u2212./·()]';
export const PHONE_G = new RegExp(`\\+?\\p{Nd}(?:${SEP}*\\p{Nd}){6,}`, 'gu');
const AT = '(?:@|\\(\\s*arroba\\s*\\)|\\[\\s*arroba\\s*\\]|\\barroba\\b|\\(\\s*at\\s*\\)|\\[\\s*at\\s*\\])';
const DOT = '(?:\\.|\\(\\s*punto\\s*\\)|\\[\\s*punto\\s*\\]|\\bpunto\\b|\\(\\s*dot\\s*\\)|\\[\\s*dot\\s*\\])';
export const EMAIL_G = new RegExp(
  `[\\p{L}\\p{N}._%+\\-]+\\s*${AT}\\s*[\\p{L}\\p{N}\\-]+(?:\\s*${DOT}\\s*[\\p{L}\\p{N}\\-]+)+`,
  'giu',
);

export const redactions = { email: 0, phone: 0 };

export function scrub(text) {
  if (typeof text !== 'string') return text;
  let out = text.normalize('NFKC').replace(EMAIL_G, () => {
    redactions.email += 1;
    return '[correo]';
  });
  out = out.replace(PHONE_G, () => {
    redactions.phone += 1;
    return '[número]';
  });
  return out;
}

/**
 * Verificador independiente (no comparte expresiones con `scrub`): recorre cada
 * cadena de cada fila publicada, salvo los campos estructurados de la lista, la
 * normaliza con NFKC, la recorre carácter a carácter en tramos de dígitos unidos
 * por separadores y marca todo tramo que, quitando lo que no sea dígito, tenga 7
 * o más dígitos. También marca lo que parezca un correo. La entrega exige 0.
 */
export const STRUCTURED = new Set([
  'phone',
  'source_id',
  'source_url',
  'retrieved_at',
  'source_updated_at',
  'last_post_at',
  'raw.page_id',
  'raw.profile_id',
  'raw.keys',
  'raw.html_sha256',
]);

export function verifyNoContacts(rows, file) {
  const findings = [];
  const isDigit = (ch) => /\p{Nd}/u.test(ch);
  const isSep = (ch) => /[\s\-‐-―−./·()_,:;+]/u.test(ch);
  const check = (value, where) => {
    const s = value.normalize('NFKC');
    let digits = 0;
    const flush = () => {
      if (digits >= 7) findings.push({ file, where, kind: 'digits', digits });
      digits = 0;
    };
    for (const ch of s) {
      if (isDigit(ch)) digits += 1;
      else if (!(isSep(ch) && digits > 0)) flush();
    }
    flush();
    if (
      /[\p{L}\p{N}._%+-]+\s*(?:@|[([]?\s*arroba\s*[)\]]?|[([]\s*at\s*[)\]])\s*[\p{L}\p{N}-]+\s*(?:\.|[([]?\s*(?:punto|dot)\s*[)\]]?)\s*\p{L}{2,}/iu.test(
        s,
      )
    )
      findings.push({ file, where, kind: 'email' });
  };
  const visit = (node, pathKey, rowId) => {
    if (STRUCTURED.has(pathKey)) return;
    if (typeof node === 'string') check(node, `${rowId}:${pathKey}`);
    else if (Array.isArray(node)) node.forEach((v) => visit(v, pathKey, rowId));
    else if (node && typeof node === 'object')
      for (const [k, v] of Object.entries(node)) visit(v, pathKey ? `${pathKey}.${k}` : k, rowId);
  };
  for (const row of rows) visit(row, '', row.source_id);
  return findings;
}
