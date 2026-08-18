import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { extractPdfEvidence, pdfMetadataPublicationDates } from '../pdf-text-extraction';
import { assessPublicationMetadata } from '../source-metadata';

describe('PDF evidence extraction', () => {
  it('extracts verifiable text and bounded metadata from a real tracked PDF', async () => {
    const bytes = await readFile(resolve(process.cwd(), 'docs/data-model/data-model.pdf'));

    const result = await extractPdfEvidence(bytes);

    expect(result.text).toContain(
      'Modelo físico del Observatorio Económico y de Mercados de Bolivia',
    );
    expect(result.text).toContain('source_artifact');
    expect(result.metadata).toMatchObject({
      creator: 'LaTeX with hyperref',
      producer: 'pdfTeX-1.40.26',
      creationDate: 'D:20260716141911Z',
    });
  }, 30_000);

  it('rejects malformed PDF input', async () => {
    await expect(extractPdfEvidence(Buffer.from('%PDF-invalid'))).rejects.toThrow(
      'PDF text extraction failed',
    );
  }, 30_000);

  it('normalizes valid PDF dates and removes duplicates', () => {
    const dates = pdfMetadataPublicationDates({
      creationDate: "D:20260818123000-04'00'",
      modificationDate: 'D:20260818150000Z',
    });

    expect(dates).toEqual(['2026-08-18']);
    expect(assessPublicationMetadata('2026-08-18T18:00:00Z', dates)).toBe('MATCHED');
    expect(assessPublicationMetadata('2026-08-17T18:00:00Z', dates)).toBe('CONTRADICTED');
  });

  it('ignores malformed and impossible PDF dates', () => {
    expect(
      pdfMetadataPublicationDates({
        creationDate: 'not-a-date',
        modificationDate: 'D:20260231000000Z',
      }),
    ).toEqual([]);
  });
});
