import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The one seed every rated index lands in, shared by more than one collector.
 *
 * The indices arrive from three places — a redistributor's CSVs, Freedom
 * House's workbook, the Fraser Institute's workbook — and each collector runs
 * on its own, whenever its publisher releases. Overwriting the file from any
 * one of them would erase what the others brought. So each collector replaces
 * only the series it owns, by indicator code, and leaves the rest as it found
 * them. The boot loader reads the file whole and does not care who wrote which
 * half.
 */

export const COMPOSITE_SEED = join('src', 'database', 'seeds', 'boot', 'composite-indices.json');

export interface SeedPoint {
  readonly period: string;
  readonly value: string;
  readonly excerpt: string;
}

export interface SeedSeries {
  readonly indicatorCode: string;
  readonly name: string;
  readonly unit: 'INDEX' | 'SCORE';
  readonly provenance: {
    readonly publisher: string;
    readonly distributor: string;
    readonly sourceUrl: string;
    readonly valueColumn: string;
    readonly retrievedAt: string;
    readonly upstreamSha256: string;
    readonly frequency: 'ANNUAL';
    readonly format?: 'CSV' | 'XLSX';
  };
  readonly points: readonly SeedPoint[];
}

/**
 * A figure the grounding check can find again.
 *
 * Some publishers write values at full floating precision, and an exponent
 * reads as two numbers to the check rather than one, so a value that only
 * renders exponentially is dropped rather than written and left to fail its
 * own evidence downstream.
 */
export function plainValue(raw: string | undefined): string | null {
  const trimmed = (raw ?? '').trim();
  return /^-?\d+(?:\.\d+)?$/u.test(trimmed) ? trimmed : null;
}

export function mergeIntoSeed(owned: readonly SeedSeries[]): number {
  const ownedCodes = new Set(owned.map((series) => series.indicatorCode));
  const held: SeedSeries[] = existsSync(COMPOSITE_SEED)
    ? (JSON.parse(readFileSync(COMPOSITE_SEED, 'utf-8')) as { series: SeedSeries[] }).series
    : [];
  const kept = held.filter((series) => !ownedCodes.has(series.indicatorCode));
  const series = [...kept, ...owned];
  writeFileSync(COMPOSITE_SEED, `${JSON.stringify({ series }, null, 2)}\n`, 'utf-8');
  return series.length;
}

export function describeSeries(series: SeedSeries): string {
  const first = series.points[0]?.period;
  const last = series.points.at(-1)?.period;
  return (
    `  ${series.indicatorCode.padEnd(36)} ${String(series.points.length).padStart(3)} puntos  ` +
    `${first}-${last}  (${series.provenance.publisher})`
  );
}
