import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const maximumOutputBytes = 1_000_000;
const extractionTimeoutMilliseconds = 20_000;

export function extractPdfText(bytes: Buffer): Promise<string> {
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
      else resolveText(Buffer.concat(output, outputBytes).toString('utf8').trim());
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
