import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync, gunzipSync } from 'node:zlib';

export const ROOT = join('src', 'database', 'seeds', 'boot', 'abi-news');
export const sha = (bytes: string | Buffer): string =>
  createHash('sha256').update(bytes).digest('hex');
export const pause = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));
export function atomicJson(path: string, data: unknown): void {
  writeFileSync(`${path}.tmp`, `${JSON.stringify(data)}\n`, 'utf8');
  renameSync(`${path}.tmp`, path);
}
export interface Capture {
  url: string;
  sha256: string;
  storage: string;
  retrievedAt: string;
  total: number | null;
  pages: number | null;
  contentType: string;
}
let lastRequest = 0;
/** Only public ABI hosts; redirects must stay on those hosts too. */
export function abiUrl(raw: string): URL {
  const url = new URL(raw);
  if (
    url.protocol !== 'https:' ||
    !['abi.bo', 'historico.abi.bo'].includes(url.hostname) ||
    url.username ||
    url.password
  )
    throw new Error(`Unsupported ABI URL: ${url.hostname}`);
  return url;
}
export function capturedText(capture: Capture): string {
  const bytes = gunzipSync(readFileSync(join(ROOT, capture.storage)));
  if (sha(bytes) !== capture.sha256) throw new Error('ABI evidence hash mismatch');
  return bytes.toString('utf8');
}
export async function capture(url: string): Promise<Capture> {
  abiUrl(url);
  mkdirSync(join(ROOT, 'evidence'), { recursive: true });
  let failure: unknown;
  for (let attempt = 0; attempt < 4; attempt++) {
    await pause(Math.max(0, 700 - (Date.now() - lastRequest)));
    lastRequest = Date.now();
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'ObservatorioEconomicoBO/1.0 (public news research)',
          Accept: 'application/json, application/xml, text/html',
        },
        signal: AbortSignal.timeout(45000),
        redirect: 'manual',
      });
      if (response.status >= 300 && response.status < 400) {
        const target = new URL(response.headers.get('location') ?? '', url).href;
        if (target === url) throw new Error('ABI redirect loop');
        abiUrl(target);
        throw new Error(`ABI redirected: ${response.status} ${target}`);
      }
      if (!response.ok) {
        if ([429, 502, 503, 504].includes(response.status)) {
          const retry = Number(response.headers.get('retry-after'));
          await pause(
            Number.isFinite(retry) && retry > 0
              ? Math.min(retry * 1000, 60000)
              : 1500 * 2 ** attempt,
          );
        }
        throw new Error(`ABI HTTP ${response.status} ${url}`);
      }
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length > 30_000_000) throw new Error('ABI response exceeds 30 MB');
      const digest = sha(bytes);
      const storage = `evidence/${digest}.gz`;
      if (!existsSync(join(ROOT, storage))) writeFileSync(join(ROOT, storage), gzipSync(bytes));
      const number = (header: string): number | null => {
        const value = response.headers.get(header);
        return value !== null && /^\d+$/u.test(value) ? Number(value) : null;
      };
      return {
        url,
        sha256: digest,
        storage,
        retrievedAt: new Date().toISOString(),
        total: number('x-wp-total'),
        pages: number('x-wp-totalpages'),
        contentType: response.headers.get('content-type') ?? '',
      };
    } catch (error) {
      failure = error;
      await pause(1000 * 2 ** attempt);
    }
  }
  throw failure;
}
