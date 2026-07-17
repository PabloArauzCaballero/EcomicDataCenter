import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { ZodType } from 'zod';

export async function readSeed<T>(relativePath: string, schema: ZodType<T>): Promise<T> {
  const path = resolve(__dirname, '..', relativePath);
  const raw = await readFile(path, 'utf8');
  return schema.parse(JSON.parse(raw) as unknown);
}
