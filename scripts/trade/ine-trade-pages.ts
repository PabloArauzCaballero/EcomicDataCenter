import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { USER_AGENT } from '../macro/department-sources';
import { sleep } from '../macro/ine-workbook';
import type { Flow } from './trade-catalogue';

/**
 * Dónde publica el INE cada año de su base de comercio exterior.
 *
 * Las bases viven en la nube del INE detrás de un enlace compartido por año
 * (`nube.ine.gob.bo/index.php/s/<id>/download`), y el `<id>` cambia cada vez
 * que el INE republica un año — lo que ocurre todos los meses con el año en
 * curso y cada vez que un año preliminar («2025p») se revisa. Por eso no se
 * anotan aquí: se leen de la página que los lista, con el rótulo que la
 * acompaña («EXPORTACIONES 2025p», «IMPORTACIONES ENE A JUL 2026p»). Si un año
 * pedido no aparece en la página, la corrida se detiene y lo dice.
 */

const PAGES: Readonly<Record<Flow, string>> = {
  X: 'https://www.ine.gob.bo/index.php/estadisticas-economicas/comercio-exterior/bases-de-datos-exportaciones/',
  M: 'https://www.ine.gob.bo/index.php/estadisticas-economicas/comercio-exterior/importaciones-bases-de-datos/',
};

const ATTEMPTS = 4;

export interface YearLink {
  readonly flow: Flow;
  readonly year: number;
  readonly label: string;
  readonly url: string;
  /** «p» en el rótulo: cifra preliminar que el INE todavía puede revisar. */
  readonly provisional: boolean;
}

async function fetchBytes(url: string, what: string, timeoutMs: number): Promise<Buffer> {
  let failure = 'sin intentos';
  for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (response.ok) return Buffer.from(await response.arrayBuffer());
      failure = `respondió ${response.status}`;
    } catch (error: unknown) {
      failure = error instanceof Error ? error.message : 'fallo de red';
    }
    await sleep(2_000 * attempt);
  }
  throw new Error(`${what}: el INE ${failure} tras ${ATTEMPTS} intentos`);
}

/** Los años que la página lista, con su enlace. Ignora el diccionario. */
export async function listYears(flow: Flow): Promise<YearLink[]> {
  const html = (await fetchBytes(PAGES[flow], `página de ${flow}`, 60_000)).toString('utf-8');
  const pattern =
    /<a[^>]*href="(https:\/\/nube\.ine\.gob\.bo\/index\.php\/s\/[A-Za-z0-9]+\/download)"[^>]*>([^<]+)<\/a>/gu;
  const links: YearLink[] = [];
  for (const match of html.matchAll(pattern)) {
    const url = match[1] ?? '';
    const label = (match[2] ?? '').replace(/\s+/gu, ' ').trim();
    if (!/^(EX|IM)PORTACIONES/u.test(label)) continue;
    const year = Number(/((?:19|20)\d{2})\s*p?\s*$/u.exec(label)?.[1]);
    if (!Number.isInteger(year)) continue;
    links.push({ flow, year, label, url, provisional: /\dp\s*$/u.test(label) });
  }
  if (!links.length) throw new Error(`la página de ${flow} no lista ninguna base anual`);
  return links;
}

export interface Download {
  readonly bytes: Buffer;
  readonly sha256: string;
  readonly retrievedAt: string;
}

/**
 * Baja un año, o lo toma de la copia local si ya se bajó con el mismo enlace.
 *
 * La copia vive fuera del repositorio (`--cache=<dir>`) y existe para iterar:
 * las importaciones son cincuenta megabytes por año. Se identifica por el `<id>`
 * del enlace, así que un año republicado —enlace nuevo— se vuelve a bajar.
 */
export async function downloadYear(link: YearLink, cache: string | null): Promise<Download> {
  const id = /\/s\/([A-Za-z0-9]+)\//u.exec(link.url)?.[1] ?? 'sin-id';
  const cached = cache ? join(cache, `${link.flow}-${link.year}-${id}.xlsx`) : null;
  let bytes: Buffer;
  let retrievedAt = new Date().toISOString();
  if (cached && existsSync(cached)) {
    bytes = readFileSync(cached);
    const stamp = `${cached}.retrieved`;
    if (existsSync(stamp)) retrievedAt = readFileSync(stamp, 'utf-8').trim();
  } else {
    bytes = await fetchBytes(link.url, link.label, 600_000);
    if (cache && cached) {
      mkdirSync(cache, { recursive: true });
      writeFileSync(cached, bytes);
      writeFileSync(`${cached}.retrieved`, retrievedAt);
    }
  }
  return { bytes, sha256: createHash('sha256').update(bytes).digest('hex'), retrievedAt };
}
