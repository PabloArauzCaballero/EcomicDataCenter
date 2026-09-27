/**
 * Los nombres que el INE publica con la codificación rota, arreglados.
 *
 * La base de comercio exterior del INE no es consistente consigo misma entre
 * años: la misma partida aparece como «CAÑA» en un año, «CA\u00f0A» en otro y
 * «CA\u251c\u00e6A» en un tercero. Son tres accidentes distintos de página de
 * códigos —texto de Windows leído como DOS (CP850), UTF-8 leído como DOS, DOS
 * leído como Latin-1— y cada uno se deshace con la conversión inversa.
 *
 * El catálogo prefiere siempre el nombre que algún año trajo limpio; esto sólo
 * se usa cuando ningún año lo trajo, y sólo acepta una reparación que deja el
 * texto limpio. Si ninguna lo logra, se queda el original: un carácter raro a
 * la vista es mejor que una letra inventada.
 */

/** Los 128 caracteres altos de la página de códigos 850, generados con Python (`bytes(range(128, 256)).decode('cp850')`). */
const CP850_HIGH: string =
  '\u00c7\u00fc\u00e9\u00e2\u00e4\u00e0\u00e5\u00e7\u00ea\u00eb\u00e8\u00ef\u00ee\u00ec\u00c4\u00c5\u00c9\u00e6\u00c6\u00f4\u00f6\u00f2\u00fb\u00f9\u00ff\u00d6\u00dc\u00f8\u00a3\u00d8\u00d7\u0192\u00e1\u00ed\u00f3\u00fa\u00f1\u00d1\u00aa\u00ba\u00bf\u00ae\u00ac\u00bd\u00bc\u00a1\u00ab\u00bb\u2591\u2592\u2593\u2502\u2524\u00c1\u00c2\u00c0\u00a9\u2563\u2551\u2557\u255d\u00a2\u00a5\u2510\u2514\u2534\u252c\u251c\u2500\u253c\u00e3\u00c3\u255a\u2554\u2569\u2566\u2560\u2550\u256c\u00a4\u00f0\u00d0\u00ca\u00cb\u00c8\u0131\u00cd\u00ce\u00cf\u2518\u250c\u2588\u2584\u00a6\u00cc\u2580\u00d3\u00df\u00d4\u00d2\u00f5\u00d5\u00b5\u00fe\u00de\u00da\u00db\u00d9\u00fd\u00dd\u00af\u00b4\u00ad\u00b1\u2017\u00be\u00b6\u00a7\u00f7\u00b8\u00b0\u00a8\u00b7\u00b9\u00b3\u00b2\u25a0\u00a0';

const CP850_BYTE = new Map<string, number>(
  [...CP850_HIGH].map((char, index) => [char, 128 + index]),
);

/** Lo que un nombre en castellano puede llevar sin sospecha. */
const CLEAN =
  /^[\x20-\x7E\u00C1\u00C9\u00CD\u00D3\u00DA\u00D1\u00DC\u00E1\u00E9\u00ED\u00F3\u00FA\u00F1\u00FC\u00BA\u00AA\u00B0\u00AB\u00BB\u00B2\u00B3\u201C\u201D]*$/u;

export const isClean = (text: string): boolean => CLEAN.test(text);

/** Cada carácter a su byte en CP850; `null` si alguno no existe en esa página. */
function cp850Bytes(text: string): Buffer | null {
  const bytes: number[] = [];
  for (const char of text) {
    const code = char.charCodeAt(0);
    if (code < 128) bytes.push(code);
    else {
      const byte = CP850_BYTE.get(char);
      if (byte === undefined) return null;
      bytes.push(byte);
    }
  }
  return Buffer.from(bytes);
}

function latin1Bytes(text: string): Buffer | null {
  return [...text].every((char) => char.charCodeAt(0) < 256) ? Buffer.from(text, 'latin1') : null;
}

const fromCp850 = (bytes: Buffer): string =>
  [...bytes]
    .map((byte) => (byte < 128 ? String.fromCharCode(byte) : (CP850_HIGH[byte - 128] ?? '')))
    .join('');

const REPAIRS: ReadonlyArray<(text: string) => string | null> = [
  // UTF-8 leído como DOS: «CA├æA» → «CAÑA».
  (text) => {
    const bytes = cp850Bytes(text);
    return bytes ? new TextDecoder('utf-8', { fatal: false }).decode(bytes) : null;
  },
  // Windows leído como DOS: «GRAÐONES» → «GRAÑONES», «ADICIËN» → «ADICIÓN».
  (text) => {
    const bytes = cp850Bytes(text);
    return bytes ? new TextDecoder('windows-1252').decode(bytes) : null;
  },
  // DOS leído como Latin-1: «CHU¥O» → «CHUÑO», «Energ¡a» → «Energía».
  (text) => {
    const bytes = latin1Bytes(text);
    return bytes ? fromCp850(bytes) : null;
  },
  // Lo que la conversión anterior deja a medias: la eñe tecleada como eth y la
  // o con tilde tecleada como e con diéresis, que el castellano no usa.
  (text) => {
    const bytes = cp850Bytes(text);
    const base = bytes ? new TextDecoder('windows-1252').decode(bytes) : text;
    return base.replace(/[ðÐ]/gu, 'Ñ').replace(/Ë/gu, 'Ó');
  },
];

export function repaired(raw: string): string {
  // Excel guarda un carácter de control como «_x0000_»; en un nombre no significa nada.
  const text = raw.replace(/_x[0-9A-Fa-f]{4}_/gu, '').trim();
  if (isClean(text)) return text;
  // Un nombre del INE en mayúsculas sigue en mayúsculas: «PEQUE±OS» → «PEQUEÑOS».
  const upper = text === text.toUpperCase();
  for (const repair of REPAIRS) {
    const found = repair(text);
    const candidate = found !== null && upper ? found.toUpperCase() : found;
    if (candidate !== null && isClean(candidate)) return candidate;
  }
  return text;
}

/**
 * El nombre que se queda: el nuevo si viene limpio; si no, el que ya había
 * limpio; si ninguno, el nuevo reparado.
 */
export function preferredName(previous: string | undefined, next: string): string {
  if (!next) return previous ?? next;
  if (isClean(next)) return next;
  if (previous && isClean(previous)) return previous;
  return repaired(next);
}
