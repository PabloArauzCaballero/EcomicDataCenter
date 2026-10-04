import { decode } from '../press-sources';

/** Strip executable blocks before decoding; retain paragraph boundaries for evidence. */
export function plain(html: string): string {
  return decode(html.replace(/<(script|style|noscript)\b[^>]*>[\s\S]*?<\/\1>/giu, '')
    .replace(/<\/(?:p|div|h[1-6]|li|blockquote|tr)>|<br\s*\/?\s*>/giu, '\n')
    .replace(/<[^>]*>/gu, ' '))
    .replace(/[\t \u00a0]+/gu, ' ').replace(/ *\n */gu, '\n').replace(/\n{3,}/gu, '\n\n').trim();
}
export const fold = (text: string): string => text.normalize('NFD').replace(/[\u0300-\u036f]/gu, '').toLowerCase();
export function safeLink(value: string, base: string): string | null {
  try {
    const url = new URL(decode(value), base);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return null;
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) if (/^(utm_|fbclid|gclid)/u.test(key)) url.searchParams.delete(key);
    return url.href;
  } catch { return null; }
}
export function attributes(tag: string): Record<string, string> {
  return Object.fromEntries([...tag.matchAll(/([\w:-]+)\s*=\s*["']([^"']*)["']/gu)].map(m => [m[1]!, decode(m[2]!)]));
}
export function links(html: string, base: string): Array<{ url: string; text: string; kind: 'DOCUMENT' | 'WEB' }> {
  const found = new Map<string, { url: string; text: string; kind: 'DOCUMENT' | 'WEB' }>();
  for (const match of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/giu)) {
    const url = safeLink(attributes(match[1]!).href ?? '', base);
    if (url) found.set(url, { url, text: plain(match[2]!), kind: /\.(pdf|xlsx?|csv|docx?)(\?|$)/iu.test(url) ? 'DOCUMENT' : 'WEB' });
  }
  return [...found.values()];
}
export function quantities(text: string): Array<{ text: string; context: string; start: number }> {
  const pattern = /(?:\bBs\.?\s*|\$us\s*|\bUSD\s*|\bUS\$\s*)\d[\d.,]*(?:\s*(?:miles de millones|millones?|mil)\b)?|\b\d[\d.,]*\s*(?:%|(?:millones? de (?:bolivianos|d[oó]lares)|toneladas|hect[aá]reas|megavatios|MW|kil[oó]metros|empleos)\b)/giu;
  return [...text.matchAll(pattern)].map(m => ({ text: m[0], start: m.index,
    context: text.slice(Math.max(0, m.index - 100), m.index + m[0].length + 160) }));
}
const TOPICS: ReadonlyArray<readonly [string, RegExp]> = [
  ['FINANCIAMIENTO', /\b(bonos|credito|financiamiento|prestamo|emision|bursatil)\b/u],
  ['INVERSION', /\b(inversion|invierte|inaugura|construccion|planta|proyecto)\b/u],
  ['RESULTADOS', /\b(utilidades|ganancias|ventas|ingresos|perdidas|balance)\b/u],
  ['GESTION', /\b(gerente|directorio|designacion|presidente ejecutivo|accionistas)\b/u],
  ['OPERACIONES', /\b(produccion|exportacion|abastecimiento|distribucion|suministro)\b/u],
  ['REGULACION', /\b(asfi|decreto|regulacion|ley|sancion|multa|auditoria)\b/u],
  ['CONFLICTO', /\b(bloqueo|huelga|denuncia|incumplimiento|suspension)\b/u],
  ['ACUERDOS', /\b(convenio|contrato|acuerdo|alianza)\b/u],
];
export const topics = (text: string): string[] => TOPICS.filter(([, r]) => r.test(fold(text))).map(([label]) => label);
