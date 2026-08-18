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

  it('accepts a canonical URL across an equivalent www host', () => {
    const metadata = htmlSourceMetadata(
      '<link rel="canonical" href="https://www.example.com/informe">',
    );

    expect(canonicalSourceUrl(metadata, new URL('https://example.com/nota'))?.toString()).toBe(
      'https://www.example.com/informe',
    );
  });

  it('ignores external, credentialed, port-changing and HTTPS-downgrade canonicals', () => {
    const baseUrl = new URL('https://example.com/nota');
    const values = [
      'https://attacker.example/informe',
      'https://user:secret@example.com/informe',
      'https://example.com:8443/informe',
      'http://example.com/informe',
    ];

    for (const value of values) {
      expect(
        canonicalSourceUrl(
          { publishers: [], publicationDates: [], canonicalUrls: [value] },
          baseUrl,
        ),
      ).toBeUndefined();
    }
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

  it('ignores metadata from nested related articles', () => {
    const html = `<script type="application/ld+json">${JSON.stringify({
      '@type': 'NewsArticle',
      datePublished: '2026-08-18T09:15:00-04:00',
      publisher: { name: 'Fuente principal' },
      relatedArticle: {
        '@type': 'NewsArticle',
        datePublished: '2026-08-17T08:00:00-04:00',
        publisher: { name: 'Fuente relacionada' },
      },
    })}</script>`;

    expect(htmlSourceMetadata(html)).toEqual({
      publishers: ['Fuente principal'],
      publicationDates: ['2026-08-18T09:15:00-04:00'],
      canonicalUrls: [],
    });
  });

  it('reads document nodes from @graph and direct mainEntity', () => {
    const html = `<script type="application/ld+json">${JSON.stringify({
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'WebPage',
          mainEntity: {
            '@type': 'Report',
            datePublished: '2026-08-18T10:00:00-04:00',
            publisher: { name: 'Institución oficial' },
            mainEntityOfPage: { '@id': '/informe-oficial' },
          },
        },
      ],
    })}</script>`;

    expect(htmlSourceMetadata(html)).toEqual({
      publishers: ['Institución oficial'],
      publicationDates: ['2026-08-18T10:00:00-04:00'],
      canonicalUrls: ['/informe-oficial'],
    });
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
