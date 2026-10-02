import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { get as httpsGet } from 'node:https';
import { join } from 'node:path';
import { connect, rootCertificates } from 'node:tls';

/**
 * Lo común de los recolectores de las cuentas públicas.
 *
 * Cada recolector escribe un archivo por familia en `boot/public-accounts/`, con las
 * series que encontró y de dónde sale cada una. Aquí está lo que no cambia de un
 * recolector a otro: bajar el archivo y guardar su huella, escribir un valor tal como el
 * editor lo dice, y la forma del archivo que el sembrador espera.
 */

export const DIRECTORY = join('src', 'database', 'seeds', 'boot', 'public-accounts');
export const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

export type Frequency = 'ANNUAL' | 'MONTHLY';

/** La unidad como el lector la dibuja; ninguna otra cosa viaja como texto libre. */
export type Unit = 'PCT_GDP' | 'PCT_REVENUE' | 'MM_BOB' | 'MM_USD' | 'PCT';

export interface AccountSeries {
  readonly indicatorCode: string;
  readonly name: string;
  readonly family: string;
  /** Qué mide, para agruparla: `recaudacion`, `ingreso`, `gasto`, `resultado`, `deuda`, `subsidio`. */
  readonly topic: string;
  /** ISO3 del país que describe; `BOL` salvo en la comparación regional. */
  readonly place: string;
  /** El concepto dentro del tema, sin el país ni el perímetro: `IVA`, `SERVICIOS_PERSONALES`. */
  readonly concept: string;
  /** Qué parte del Estado cubre: `GG` gobierno general, `SPNF`, `EMP` empresas públicas… */
  readonly perimeter: string;
  readonly unit: Unit;
  readonly frequency: Frequency;
  readonly publisher: string;
  readonly locator: Record<string, string | number>;
  readonly sourceUrl: string;
  readonly upstreamSha256: string;
  readonly retrievedAt: string;
  readonly points: readonly (readonly [string, string])[];
}

export interface Download {
  readonly bytes: Buffer;
  readonly sha256: string;
  readonly retrievedAt: string;
}

/**
 * El certificado intermedio que un sitio olvidó mandar.
 *
 * El portal del Ministerio de Economía sirve su certificado sin la cadena completa: los
 * navegadores y `curl` la reconstruyen bajando el intermedio de la dirección que el propio
 * certificado declara (`CA Issuers`), y Node no lo hace. Desactivar la verificación sería
 * aceptar a cualquier servidor que diga ser el Ministerio; esto la mantiene entera y solo
 * añade el eslabón que faltaba, pedido a la dirección que el certificado nombra.
 */
const intermediates = new Map<string, string>();

async function missingIntermediate(host: string): Promise<string> {
  const held = intermediates.get(host);
  if (held) return held;
  // Sonda sin datos: no envia nada ni cree nada de lo que recibe; solo lee del certificado la
  // direccion del intermedio. La descarga real (abajo) verifica la cadena completa.
  const address = await new Promise<string>((resolve, reject) => {
    const socket = connect({ host, port: 443, servername: host, rejectUnauthorized: false }, () => {
      const issuers = socket.getPeerCertificate().infoAccess?.['CA Issuers - URI'];
      socket.end();
      const first = Array.isArray(issuers) ? issuers[0] : issuers;
      if (first) resolve(first);
      else reject(new Error(`${host}: el certificado no dice de donde bajar su intermedio`));
    });
    socket.on('error', reject);
  });
  const response = await fetch(address, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`${address}: respondio ${response.status}`);
  const der = Buffer.from(await response.arrayBuffer());
  const body = der.toString('base64').replace(/(.{64})/gu, '$1\n');
  const pem = `-----BEGIN CERTIFICATE-----\n${body}\n-----END CERTIFICATE-----\n`;
  intermediates.set(host, pem);
  return pem;
}

async function getWithIntermediate(url: string, accept: string): Promise<Buffer> {
  const ca = [...rootCertificates, await missingIntermediate(new URL(url).hostname)];
  return new Promise((resolve, reject) => {
    httpsGet(
      url,
      { ca, headers: { 'User-Agent': USER_AGENT, Accept: accept }, timeout: 120_000 },
      (response) => {
        if ((response.statusCode ?? 500) >= 400) {
          reject(new Error(`respondio ${response.statusCode}`));
          return;
        }
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () => resolve(Buffer.concat(chunks)));
        response.on('error', reject);
      },
    ).on('error', reject);
  });
}

async function fetchBytes(url: string, accept: string): Promise<Buffer> {
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: accept },
      signal: AbortSignal.timeout(120_000),
    });
    if (!response.ok) throw new Error(`respondio ${response.status}`);
    return Buffer.from(await response.arrayBuffer());
  } catch (error) {
    const code = (error as { cause?: { code?: string } }).cause?.code;
    if (code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE') return getWithIntermediate(url, accept);
    throw error;
  }
}

export async function download(url: string, accept = '*/*'): Promise<Download> {
  // Los servidores de las fuentes contestan 500 o 503 de vez en cuando y a la segunda
  // responden; una corrida que se cae por eso deja la familia sin refrescar sin motivo.
  let failure = '';
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const bytes = await fetchBytes(url, accept);
      return {
        bytes,
        sha256: createHash('sha256').update(bytes).digest('hex'),
        retrievedAt: new Date().toISOString().slice(0, 19),
      };
    } catch (error) {
      failure = error instanceof Error ? error.message : 'sin respuesta';
      // Un 4xx no se arregla esperando.
      if (/respondio 4\d\d/u.test(failure)) break;
    }
    await new Promise((resolve) => setTimeout(resolve, attempt * 3_000));
  }
  throw new Error(`${url}: ${failure}`);
}

/**
 * Un valor que el sembrador puede citar: decimal sin exponente.
 *
 * Un editor que escribe `1.2E-5` o `NaN` en una celda no dice una cantidad que se pueda
 * volver a encontrar como texto, así que se descarta en vez de sembrarse y fallar luego.
 */
export function plainValue(raw: string | undefined | null): string | null {
  const trimmed = (raw ?? '').trim();
  if (!/^-?\d+(?:\.\d+)?$/u.test(trimmed)) return null;
  // `-0` y `-0.0` son un cero; el signo no dice nada.
  return /^-0(?:\.0+)?$/u.test(trimmed) ? trimmed.slice(1) : trimmed;
}

/** Cantidad en miles pasada a millones sin pasar por un flotante: corre la coma, no divide. */
export function thousandsToMillions(raw: string | undefined | null): string | null {
  const value = plainValue(raw);
  if (value === null) return null;
  const negative = value.startsWith('-');
  const [whole = '0', fraction = ''] = value.replace('-', '').split('.');
  const padded = whole.padStart(4, '0');
  const integer = padded.slice(0, -3).replace(/^0+(?=\d)/u, '');
  const decimals = `${padded.slice(-3)}${fraction}`.replace(/0+$/u, '');
  const text = decimals ? `${integer}.${decimals}` : integer;
  return negative && /[1-9]/u.test(text) ? `-${text}` : text;
}

export const yearDate = (year: number | string): string => `${year}-01-01`;
export const monthDate = (year: number, month: number): string =>
  `${year}-${String(month).padStart(2, '0')}-01`;

export function describe(series: AccountSeries): string {
  const first = series.points[0]?.[0].slice(0, 7);
  const last = series.points.at(-1)?.[0].slice(0, 7);
  return (
    `  ${series.indicatorCode.padEnd(48)} ${String(series.points.length).padStart(4)} puntos  ` +
    `${first}..${last}  ${series.unit}`
  );
}

/** Escribe la familia entera: un recolector es dueño de su archivo y lo reemplaza. */
export function writeFamily(family: string, series: readonly AccountSeries[]): string {
  const codes = new Set<string>();
  for (const one of series) {
    if (codes.has(one.indicatorCode)) throw new Error(`${one.indicatorCode} esta dos veces`);
    codes.add(one.indicatorCode);
    if (one.points.length === 0) throw new Error(`${one.indicatorCode}: sin puntos`);
  }
  mkdirSync(DIRECTORY, { recursive: true });
  const path = join(DIRECTORY, `${family}.json`);
  const body = series.map((one) => ({
    ...one,
    retrievedAt: `${one.retrievedAt.slice(0, 19)}Z`.replace('ZZ', 'Z'),
  }));
  writeFileSync(path, `${JSON.stringify({ family, series: body }, null, 2)}\n`, 'utf-8');
  return path;
}

/** El año de una cabecera como «2021p» o «\r\n2023p». */
export function yearOf(text: string | undefined): number | null {
  const match = /(19|20)\d{2}/u.exec(text ?? '');
  return match ? Number(match[0]) : null;
}

export function fail(error: unknown): void {
  process.stderr.write(`${error instanceof Error ? error.message : 'recoleccion fallida'}\n`);
  process.exitCode = 1;
}
