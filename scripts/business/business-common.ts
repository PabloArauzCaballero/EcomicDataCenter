import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { canonicalCompany } from '../macro/corporate-aliases';
import type { RegisterPoint, RegisterSeries } from '../macro/annual-register-shape';

/**
 * Lo que comparten los colectores del tejido empresarial.
 *
 * Cinco fuentes —el registro de comercio, el padrón y el ránking de Impuestos,
 * «Las 500» de Siles y los documentos de propiedad— con un mismo problema: un
 * documento oficial que hay que bajar, fechar, tomarle la huella y leer sin
 * transcribir. Lo que cada una sabe de su formato vive en su colector; aquí
 * sólo está lo que no depende de quién publica.
 */

export const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36';

/** Un documento bajado, con su huella y el momento en que se leyó. */
export interface Downloaded {
  readonly bytes: Buffer;
  readonly sha256: string;
  readonly retrievedAt: string;
}

const CACHE = join(tmpdir(), 'observatorio-business-cache');

/**
 * Baja un documento, o lo toma de la copia de esta máquina.
 *
 * Las memorias de Impuestos pesan entre cinco y quince megas y el colector se
 * corre varias veces mientras se ajusta un parser: bajarlas cada vez es
 * castigar a un servidor público por un error propio. La copia vive fuera del
 * repositorio y se ignora con `--fresh`, que es como corre la recolección de
 * verdad. La huella es la del contenido, así que la copia no la altera.
 */
export async function download(
  url: string,
  init: RequestInit = {},
  fresh = process.argv.includes('--fresh'),
): Promise<Downloaded> {
  mkdirSync(CACHE, { recursive: true });
  const key = createHash('sha256').update(`${url}|${String(init.body ?? '')}`).digest('hex');
  const cached = join(CACHE, key);
  if (!fresh && existsSync(cached)) {
    const bytes = readFileSync(cached);
    const stamp = readFileSync(`${cached}.at`, 'utf-8');
    return { bytes, sha256: sha(bytes), retrievedAt: stamp };
  }
  let failure = 'sin intentos';
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const response = await fetch(url, {
        ...init,
        headers: { 'User-Agent': USER_AGENT, ...(init.headers ?? {}) },
        signal: AbortSignal.timeout(120_000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const bytes = Buffer.from(await response.arrayBuffer());
      const retrievedAt = `${new Date().toISOString().slice(0, 19)}Z`;
      writeFileSync(cached, bytes);
      writeFileSync(`${cached}.at`, retrievedAt);
      return { bytes, sha256: sha(bytes), retrievedAt };
    } catch (error) {
      failure = error instanceof Error ? error.message : String(error);
      await new Promise((resolve) => setTimeout(resolve, attempt * 2_000));
    }
  }
  throw new Error(`${url}: no se pudo bajar (${failure})`);
}

export const sha = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex');

/**
 * Las formas societarias que una razón social arrastra al final.
 *
 * Impuestos escribe «BANCO GANADERO S.A.», Merco «BANCO GANADERO» y Siles
 * «Banco Ganadero S.A.»: es la misma empresa y el cruce entre ránkings es lo
 * que el capítulo promete. Se quitan sólo del final y sólo si queda nombre: una
 * empresa que se llama «S.A.» a secas no existe, pero una que termine en
 * «Ltda.» dentro de un paréntesis sí, y la sigla entre paréntesis se conserva.
 */
const LEGAL_TAIL =
  /(?:[\s,.-]+(?:S\.?\s?A\.?\s?M\.?|S\.?\s?A\.?|S\.?\s?R\.?\s?L\.?|LTDA\.?|LIMITADA|SOCIEDAD\s+AN[OÓ]NIMA(?:\s+MIXTA)?|R\.?\s?L\.?|SUCURSAL(?:\s+BOLIVIA)?|S\.?\s?A\.?\s?F\.?\s?I\.?|E\.?\s?I\.?\s?R\.?\s?L\.?))+\s*$/iu;

/** El nombre sin su forma societaria, para cruzar fuentes. */
export function withoutLegalForm(published: string): string {
  const trimmed = published.replace(/\s+/gu, ' ').trim();
  const stripped = trimmed.replace(LEGAL_TAIL, '').replace(/[\s,.-]+$/u, '').trim();
  return stripped.length >= 2 ? stripped : trimmed;
}

/**
 * El código y el nombre de una empresa de estas fuentes.
 *
 * Primero la tabla de equivalencias con el nombre entero —que es como la
 * escribieron Merco y Datasur—, después sin la forma societaria. Así una
 * empresa que ya está en el corpus conserva su código y el cruce funciona.
 */
export function companyIdentity(published: string): { slug: string; name: string } {
  const plain = withoutLegalForm(published);
  return canonicalCompany(plain);
}

/** Los nueve departamentos, escritos como el corpus los codifica. */
export const DEPARTMENTS: Readonly<Record<string, string>> = {
  CHUQUISACA: 'Chuquisaca',
  LA_PAZ: 'La Paz',
  COCHABAMBA: 'Cochabamba',
  ORURO: 'Oruro',
  POTOSI: 'Potosí',
  TARIJA: 'Tarija',
  SANTA_CRUZ: 'Santa Cruz',
  BENI: 'Beni',
  PANDO: 'Pando',
};

/** Un código de mayúsculas y guiones bajos a partir de cualquier texto. */
export function codeOf(text: string, length = 40): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/gu, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/gu, '_')
    .replace(/^_+|_+$/gu, '')
    .slice(0, length)
    .replace(/_+$/u, '');
}

/**
 * Una cifra impresa a la española, devuelta como el corpus la guarda.
 *
 * «4.676,4» es 4676.4 y «90.397» es 90397. La comprobación de anclaje entiende
 * las dos ortografías como el mismo número, así que el extracto cita la tabla
 * como está y el valor se guarda sin separadores de miles.
 */
export function spanishNumber(printed: string): string {
  const clean = printed.replace(/[%\s]/gu, '');
  if (!/^-?[\d.,]+$/u.test(clean)) throw new Error(`«${printed}» no es una cifra`);
  const negative = clean.startsWith('-');
  const unsigned = clean.replace(/^-/u, '');
  const comma = unsigned.lastIndexOf(',');
  const whole = (comma >= 0 ? unsigned.slice(0, comma) : unsigned).replace(/\./gu, '');
  const fraction = comma >= 0 ? unsigned.slice(comma + 1) : '';
  const text = fraction ? `${whole}.${fraction}` : whole;
  return negative ? `-${text}` : text;
}

/**
 * Las series de un archivo, armadas punto por punto.
 *
 * Dos puntos del mismo año en la misma serie son dos filas de la fuente que
 * colapsaron al mismo código —dos razones sociales que el cruce cree iguales—
 * y se detiene la corrida en vez de quedarse con la última.
 */
export class SeriesBook {
  private readonly book = new Map<string, RegisterSeries>();

  add(head: Omit<RegisterSeries, 'points' | 'frequency'>, point: RegisterPoint): void {
    const own = this.book.get(head.indicatorCode) ?? { ...head, frequency: 'ANNUAL', points: [] };
    if (own.points.some((existing) => existing.period === point.period)) {
      throw new Error(`${head.indicatorCode}: dos lecturas en ${point.period}`);
    }
    own.points.push(point);
    this.book.set(head.indicatorCode, own);
  }

  all(): RegisterSeries[] {
    return [...this.book.values()].map((one) => ({
      ...one,
      points: [...one.points].sort((left, right) => left.period.localeCompare(right.period)),
    }));
  }
}

/** Escribe la semilla y dice cuánto trae, que es lo único que prueba la corrida. */
export function writeSeed(file: string, series: readonly RegisterSeries[]): void {
  const path = join('src', 'database', 'seeds', 'boot', file);
  writeFileSync(path, `${JSON.stringify({ series }, null, 2)}\n`, 'utf-8');
  const points = series.reduce((count, one) => count + one.points.length, 0);
  console.log(`  -> ${path}: ${series.length} series, ${points} observaciones`);
}
