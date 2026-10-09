import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type {
  ExogenousFactorPoint,
  ExogenousFactorSeries,
} from '../../../src/database/seeds/schemas/exogenous-factors.schema';
import type { ParsedFactorPoint } from './factor-parsers';

export interface FactorDownload {
  sourceUrl: string;
  bytes: Buffer;
  upstreamSha256: string;
  retrievedAt: string;
}

export interface DownloadOptions {
  request?: typeof fetch;
  pause?: (milliseconds: number) => Promise<void>;
}

/** Series meaning is revisioned too; query windows and set ordering are not meaning. */
export function factorDefinitionKey(series: ExogenousFactorSeries): string {
  const { points, sourceUrl, ...metadata } = series;
  void points;
  const location = new URL(sourceUrl);
  const normalized = {
    ...metadata,
    sourceUrl: `${location.origin}${location.pathname}`,
    familyIds: [...metadata.familyIds].sort(),
    sectorIds: [...metadata.sectorIds].sort(),
  };
  return JSON.stringify(
    Object.fromEntries(
      Object.entries(normalized).sort(([left], [right]) => left.localeCompare(right)),
    ),
  );
}

export async function downloadFactor(
  sourceUrl: string,
  options: DownloadOptions = {},
): Promise<FactorDownload> {
  const request = options.request ?? fetch;
  const pause =
    options.pause ?? ((ms: number) => new Promise<void>((done) => setTimeout(done, ms)));
  const host = new URL(sourceUrl).hostname;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    let retryable = true;
    try {
      const response = await request(sourceUrl, {
        headers: { 'User-Agent': 'ObservatorioEconomicoBolivia/1.0 (public statistical data)' },
        signal: AbortSignal.timeout(25_000),
      });
      if (!response.ok) {
        retryable = response.status >= 500 || response.status === 408 || response.status === 429;
        throw new Error(`HTTP ${response.status} from ${host}`);
      }
      const bytes = Buffer.from(await response.arrayBuffer());
      retryable = false;
      if (bytes.length > 8_000_000) throw new Error('Response exceeds 8 MB evidence limit');
      return {
        sourceUrl,
        bytes,
        retrievedAt: new Date().toISOString(),
        upstreamSha256: createHash('sha256').update(bytes).digest('hex'),
      };
    } catch (error) {
      if (!retryable || attempt === 1) throw error;
      // NWS usage policy asks at least a minute between retries after errors.
      await pause(host.endsWith('.noaa.gov') ? 60_000 : 1_500);
    }
  }
  throw new Error('Download retry budget exhausted');
}

/** Current revision, not earliest-ever occurrence: A -> B -> A gets a new clock. */
export function attachEvidence(
  rows: ParsedFactorPoint[],
  download: FactorDownload,
  previous: readonly ExogenousFactorPoint[],
): ExogenousFactorPoint[] {
  const held = new Map(previous.map((point) => [point.period, point]));
  return rows.map((row) => {
    const old = held.get(row.period);
    const unchanged =
      old?.value === row.value && old.status === row.status && old.excerpt === row.excerpt;
    return {
      ...row,
      publishedAt: unchanged ? old.publishedAt : null,
      firstSeenAt: unchanged ? old.firstSeenAt : download.retrievedAt,
      retrievedAt: download.retrievedAt,
      sourceUrl: download.sourceUrl,
      upstreamSha256: download.upstreamSha256,
    };
  });
}

/** Downloads are content addressed; existing evidence is never overwritten. */
export function saveFactorEvidence(download: FactorDownload, directory: string): void {
  mkdirSync(directory, { recursive: true });
  const file = join(directory, `${download.upstreamSha256}.raw`);
  if (!existsSync(file)) writeFileSync(file, download.bytes);
  else if (
    createHash('sha256').update(readFileSync(file)).digest('hex') !== download.upstreamSha256
  ) {
    throw new Error('Evidence hash mismatch');
  }
}

export function writeFactorJson(file: string, value: unknown): void {
  mkdirSync(dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  renameSync(temporary, file);
}
