/**
 * Las cifras que una red social imprime, devueltas a número.
 *
 * Cada red redondea a su manera y en el idioma de la visita: Instagram escribe
 * «20K» y «2,030», TikTok «61.6K», LinkedIn «166.183», YouTube «1,2 mil». El
 * separador es ambiguo por sí solo —«2,030» son dos mil treinta y «1,2 mil» es
 * mil doscientos— y lo desambigua lo que viene detrás:
 *
 * - con sufijo (K, mil, M, mill., millones) el separador es decimal;
 * - sin sufijo, un separador seguido de exactamente tres dígitos agrupa miles;
 *   cualquier otro es decimal.
 *
 * Lo que no se puede leer devuelve `null`, nunca 0: un cero es una cifra y una
 * página que no se dejó leer no lo es.
 */

const SUFFIX: ReadonlyArray<readonly [RegExp, number]> = [
  [/^(?:mil\s*mill(?:ones|\.)?|b)$/iu, 1_000_000_000],
  [/^(?:m|mill(?:ones|\.)?|mln)$/iu, 1_000_000],
  [/^(?:k|mil)$/iu, 1_000],
];

const NUMBER =
  /(\d+(?:[.,\s\u00a0\u202f]\d+)*)\s*(mil\s*mill(?:ones|\.)?|mill(?:ones|\.)?|mln|mil|[kmb])?(?![a-z])/iu;

function multiplierOf(suffix: string | undefined): number {
  if (!suffix) return 1;
  const found = SUFFIX.find(([pattern]) => pattern.test(suffix.trim()));
  return found ? found[1] : 1;
}

/** Une los grupos de miles y deja, a lo sumo, un punto decimal. */
function plainDigits(raw: string, hasSuffix: boolean): string {
  const parts = raw.split(/[.,\s\u00a0\u202f]/u);
  if (parts.length === 1) return raw;
  const separators = raw.match(/[.,\s\u00a0\u202f]/gu) ?? [];
  const last = parts[parts.length - 1] ?? '';
  const spaced = separators.some((separator) => /\s|\u00a0|\u202f/u.test(separator));
  const thousands = !hasSuffix && (last.length === 3 || spaced || parts.length > 2);
  if (thousands) return parts.join('');
  return `${parts.slice(0, -1).join('')}.${last}`;
}

export function parseCount(text: string | null | undefined): number | null {
  if (!text) return null;
  const match = NUMBER.exec(text.replace(/\u00a0/gu, ' '));
  if (!match?.[1]) return null;
  const suffix = match[2];
  const value = Number(plainDigits(match[1], Boolean(suffix))) * multiplierOf(suffix);
  return Number.isFinite(value) ? Math.round(value) : null;
}

/**
 * La cifra que precede a una palabra: «18K seguidores», «4,301 publicaciones».
 * Se busca por la palabra y no por la posición porque cada red ordena distinto.
 */
export function countBefore(text: string, word: RegExp): number | null {
  const pattern = new RegExp(
    `(\\d[\\d.,\\s\\u00a0\\u202f]*(?:\\s*(?:mil\\s*mill(?:ones|\\.)?|mill(?:ones|\\.)?|mln|mil|[kmb]))?)\\s*${word.source}`,
    'iu',
  );
  const match = pattern.exec(text.replace(/\u00a0/gu, ' '));
  return match?.[1] ? parseCount(match[1].trim()) : null;
}
