import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { freemem } from 'node:os';
import { join } from 'node:path';

/**
 * La configuración de una noche de captura y lo que se escribe en su carpeta.
 * Lo comparten el recolector, la captura de cada sala y el proceso de medios.
 */

export type Json = Record<string, unknown>;

export const ROOT = process.cwd();
export const RAW = join(ROOT, 'artifacts', 'live-raw');

export function flag(name: string, fallback: number): number {
  const raw = process.argv.find((arg) => arg.startsWith(`--${name}=`))?.split('=')[1];
  const parsed = Number(raw);
  return raw && Number.isFinite(parsed) ? parsed : fallback;
}

export function option(name: string, fallback: string): string {
  return process.argv.find((arg) => arg.startsWith(`--${name}=`))?.split('=')[1] ?? fallback;
}

/** La noche de captura: hora de La Paz menos 6 h, para que la 1 de la madrugada cuente en la noche anterior. */
export function nightOf(epochMs = Date.now()): string {
  return new Date(epochMs - (4 + 6) * 3_600_000).toISOString().slice(0, 10);
}

export const RUN = option('run', nightOf());
export const RUN_DIR = join(RAW, RUN);
export const MINUTES = flag('minutes', 300);
export const ROOMS = flag('rooms', 2);
export const ROOM_MINUTES = flag('room-minutes', 30);
export const MIN_VIEWERS = flag('min-viewers', 8);
export const MIN_FREE_MB = flag('min-free-mb', 900);
/**
 * Con el portátil en uso, la memoria libre rara vez llega a 900 MB (7-oct: 802 MB y la noche entera
 * sin abrir una sola sala). La primera sala solo exige este piso; la segunda sigue pidiendo MIN_FREE_MB.
 */
export const FIRST_ROOM_FREE_MB = flag('first-room-free-mb', 450);
export const WEEKLY_CAP = flag('weekly-cap', 2);
export const MEDIA = !process.argv.includes('--no-media');

export function freeMb(): number {
  return Math.round(freemem() / 1_048_576);
}

export function log(file: string, row: Json): void {
  appendFileSync(join(RUN_DIR, file), `${JSON.stringify(row)}\n`, 'utf8');
}

export function say(message: string, extra: Json = {}): void {
  const row = { t: new Date().toISOString(), message, ...extra };
  console.log(JSON.stringify(row));
  log('night.jsonl', row);
}

// ---------------------------------------------------------------- vendedores

export interface SellerRecord {
  sellerId: string;
  firstSeen: string;
  captures: { run: string; roomId: string; at: string }[];
}

export const SELLERS_PATH = join(RAW, 'sellers.json');

export function loadSellers(): Record<string, SellerRecord> {
  return existsSync(SELLERS_PATH)
    ? (JSON.parse(readFileSync(SELLERS_PATH, 'utf8')) as Record<string, SellerRecord>)
    : {};
}

export function saveSellers(sellers: Record<string, SellerRecord>): void {
  writeFileSync(SELLERS_PATH, `${JSON.stringify(sellers, null, 1)}\n`, 'utf8');
}

export function capturesThisWeek(record: SellerRecord | undefined): number {
  const since = Date.now() - 7 * 86_400_000;
  return (record?.captures ?? []).filter((capture) => Date.parse(capture.at) >= since).length;
}
