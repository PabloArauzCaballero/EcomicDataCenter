import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { extractPdfText } from '../pdf-text-extraction';

describe('extractPdfText', () => {
  it('extracts verifiable text from a real tracked PDF', async () => {
    const bytes = await readFile(resolve(process.cwd(), 'docs/data-model/data-model.pdf'));

    const text = await extractPdfText(bytes);

    expect(text).toContain('Modelo físico del Observatorio Económico y de Mercados de Bolivia');
    expect(text).toContain('source_artifact');
  }, 30_000);

  it('rejects malformed PDF input', async () => {
    await expect(extractPdfText(Buffer.from('%PDF-invalid'))).rejects.toThrow(
      'PDF text extraction failed',
    );
  }, 30_000);
});
