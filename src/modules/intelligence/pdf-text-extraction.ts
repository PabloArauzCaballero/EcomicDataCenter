import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const maximumOutputBytes = 1_010_000;
const extractionTimeoutMilliseconds = 20_000;

export interface PdfMetadata {
  title?: string;
  author?: string;
  creator?: string;
  producer?: string;
  creationDate?: string;
  modificationDate?: string;
}

export interface PdfExtractionResult {
  text: string;
  metadata: PdfMetadata;
}

const metadataKeys = [
  'title',
  'author',
  'creator',
  'producer',
  'creationDate',
  'modificationDate',
] as const;

function parseExtractionOutput(output: Buffer[], outputBytes: number): PdfExtractionResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.concat(output, outputBytes).toString('utf8'));
  } catch {
    throw new Error('PDF extractor returned invalid JSON');
  }
  if (
    !parsed ||
    typeof parsed !== 'object' ||
    typeof (parsed as { text?: unknown }).text !== 'string'
  ) {
    throw new Error('PDF extractor returned an invalid result');
  }
  const rawMetadata = (parsed as { metadata?: unknown }).metadata;
  if (!rawMetadata || typeof rawMetadata !== 'object') {
    throw new Error('PDF extractor returned invalid metadata');
  }
  const metadata: PdfMetadata = {};
  for (const key of metadataKeys) {
    const value = (rawMetadata as Record<string, unknown>)[key];
    if (value === undefined) continue;
    if (typeof value !== 'string' || value.length > 500) {
      throw new Error('PDF extractor returned invalid metadata');
    }
    metadata[key] = value;
  }
  return { text: (parsed as { text: string }).text.trim(), metadata };
}

export function pdfMetadataPublicationDates(metadata: PdfMetadata): string[] {
  return [metadata.creationDate, metadata.modificationDate]
    .map((value) => {
      const match = /^(?:D:)?(\d{4})(\d{2})(\d{2})/u.exec(value ?? '');
      if (!match) return undefined;
      const date = `${match[1]}-${match[2]}-${match[3]}`;
      const parsed = new Date(`${date}T00:00:00Z`);
      return Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== date
        ? undefined
        : date;
    })
    .filter((value): value is string => value !== undefined)
    .filter((value, index, dates) => dates.indexOf(value) === index);
}

export function extractPdfEvidence(bytes: Buffer): Promise<PdfExtractionResult> {
  return new Promise((resolveText, reject) => {
    const extractorPath = resolve(process.cwd(), 'scripts/pdf-text-extractor.mjs');
    const child = spawn(
      process.execPath,
      ['--max-old-space-size=192', '--disable-proto=throw', extractorPath],
      {
        cwd: process.cwd(),
        env: { NODE_ENV: 'production' },
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
      },
    );
    const output: Buffer[] = [];
    const errors: Buffer[] = [];
    let outputBytes = 0;
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (error) reject(error);
      else {
        try {
          resolveText(parseExtractionOutput(output, outputBytes));
        } catch (parseError) {
          reject(parseError instanceof Error ? parseError : new Error(String(parseError)));
        }
      }
    };
    const timeout = setTimeout(() => {
      child.kill();
      finish(new Error('PDF text extraction timed out'));
    }, extractionTimeoutMilliseconds);
    child.stdout.on('data', (chunk: Buffer) => {
      outputBytes += chunk.length;
      if (outputBytes > maximumOutputBytes) {
        child.kill();
        finish(new Error('PDF text extraction exceeded the output limit'));
      } else {
        output.push(chunk);
      }
    });
    child.stderr.on('data', (chunk: Buffer) => {
      if (Buffer.concat(errors).length < 2_000) errors.push(chunk);
    });
    child.on('error', (error) => finish(error));
    child.on('close', (code) => {
      if (code === 0) finish();
      else {
        const detail = Buffer.concat(errors).toString('utf8').trim().slice(0, 500);
        finish(new Error(`PDF text extraction failed${detail ? `: ${detail}` : ''}`));
      }
    });
    child.stdin.on('error', (error: NodeJS.ErrnoException) => {
      if (error.code !== 'EPIPE') finish(error);
    });
    child.stdin.end(bytes);
  });
}
