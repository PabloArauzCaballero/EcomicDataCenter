import { visibleText } from '../evidence-quality';
import {
  assessPublicationMetadata,
  canonicalSourceUrl,
  htmlSourceMetadata,
} from '../source-metadata';

describe('htmlSourceMetadata', () => {
  it('extracts publisher and publication date from source-owned metadata', () => {
    const html = `
      <head>
        <meta content="Economy Bolivia" property="og:site_name">
        <meta property="article:published_time" content="2026-08-18T08:30:00-04:00">
        <link href="/economia/informe" rel="alternate canonical">
        <script>{"property":"og:site_name","content":"Fake Publisher"}</script>
      </head>`;

    expect(htmlSourceMetadata(html)).toEqual({
      publishers: ['Economy Bolivia'],
      publicationDates: ['2026-08-18T08:30:00-04:00'],
      canonicalUrls: ['/economia/informe'],
    });
  });

  it('resolves a relative canonical URL against the downloaded page', () => {
    const metadata = htmlSourceMetadata('<link rel="canonical" href="../informe">');

    expect(
      canonicalSourceUrl(metadata, new URL('https://example.com/economia/amp/'))?.toString(),
    ).toBe('https://example.com/economia/informe');
  });

  it('extracts bounded JSON-LD without making it visible evidence', () => {
    const html = `<script type="application/ld+json">${JSON.stringify({
      '@type': 'NewsArticle',
      datePublished: '2026-08-18T09:15:00-04:00',
      publisher: { '@type': 'Organization', name: 'Agencia Económica' },
      mainEntityOfPage: { '@id': '/economia/reporte' },
      description: 'Texto que no debe validar una cita',
    })}</script><main>Texto visible</main>`;

    expect(htmlSourceMetadata(html)).toEqual({
      publishers: ['Agencia Económica'],
      publicationDates: ['2026-08-18T09:15:00-04:00'],
      canonicalUrls: ['/economia/reporte'],
    });
    expect(visibleText(Buffer.from(html), 'text/html')).toBe('Texto visible');
  });

  it('ignores malformed and oversized JSON-LD', () => {
    const malformed = '<script type="application/ld+json">{not-json}</script>';
    const oversized = `<script type="application/ld+json">${' '.repeat(100_001)}</script>`;

    expect(htmlSourceMetadata(malformed).publicationDates).toEqual([]);
    expect(htmlSourceMetadata(oversized).publicationDates).toEqual([]);
  });
});

describe('assessPublicationMetadata', () => {
  it('matches calendar dates and detects a source contradiction', () => {
    expect(assessPublicationMetadata('2026-08-18T12:30:00Z', ['2026-08-18T08:30:00-04:00'])).toBe(
      'MATCHED',
    );
    expect(assessPublicationMetadata('2026-08-17T12:30:00Z', ['2026-08-18T08:30:00Z'])).toBe(
      'CONTRADICTED',
    );
  });

  it('reports unavailable metadata without claiming a match', () => {
    expect(assessPublicationMetadata('2026-08-18T12:30:00Z', [])).toBe('UNAVAILABLE');
    expect(assessPublicationMetadata('2026-08-18T12:30:00Z', ['not-a-date'])).toBe('UNAVAILABLE');
  });

  it('rejects conflicting valid publication dates even if one matches', () => {
    expect(
      assessPublicationMetadata('2026-08-18T12:30:00Z', [
        '2026-08-18T08:30:00Z',
        '2026-08-17T08:30:00Z',
        '2026-08-18T09:00:00Z',
      ]),
    ).toBe('AMBIGUOUS');
  });
});
