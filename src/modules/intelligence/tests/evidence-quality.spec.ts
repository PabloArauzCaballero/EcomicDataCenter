import {
  effectiveContentType,
  evidenceCandidateKey,
  groundedEntities,
  publicationWindowIssue,
  requireVerifiableText,
  resolveLinkedArticle,
  ungroundedNumbers,
  visibleText,
} from '../evidence-quality';

describe('effectiveContentType', () => {
  it('recognizes HTML and PDF evidence despite misleading headers', () => {
    expect(effectiveContentType(Buffer.from('<!doctype html><html></html>'), 'text/plain')).toBe(
      'text/html',
    );
    expect(effectiveContentType(Buffer.from('%PDF-1.7 binary'), 'text/plain')).toBe(
      'application/pdf',
    );
  });

  it('does not expose arbitrary binary content as visible text', () => {
    expect(visibleText(Buffer.from([0, 1, 2, 3]), 'application/octet-stream')).toBe('');
  });
});
import { htmlSourceMetadata, publicationMetadataMatches } from '../source-metadata';

describe('htmlSourceMetadata', () => {
  it('extracts publisher and publication date from source-owned metadata', () => {
    const html = `
      <head>
        <meta content="Economy Bolivia" property="og:site_name">
        <meta property="article:published_time" content="2026-08-18T08:30:00-04:00">
        <script>{"property":"og:site_name","content":"Fake Publisher"}</script>
      </head>`;

    expect(htmlSourceMetadata(html)).toEqual({
      publishers: ['Economy Bolivia'],
      publicationDates: ['2026-08-18T08:30:00-04:00'],
    });
  });
});

describe('publicationMetadataMatches', () => {
  it('matches calendar dates and detects a source contradiction', () => {
    expect(publicationMetadataMatches('2026-08-18T12:30:00Z', ['2026-08-18T08:30:00-04:00'])).toBe(
      true,
    );
    expect(publicationMetadataMatches('2026-08-17T12:30:00Z', ['2026-08-18T08:30:00Z'])).toBe(
      false,
    );
  });

  it('reports unavailable metadata without claiming a match', () => {
    expect(publicationMetadataMatches('2026-08-18T12:30:00Z', [])).toBeUndefined();
  });
});

describe('publicationWindowIssue', () => {
  const start = new Date('2026-08-15T12:00:00.000Z');
  const end = new Date('2026-08-18T12:00:00.000Z');

  it('accepts a publication inside the research window', () => {
    expect(publicationWindowIssue('2026-08-17T08:30:00-04:00', start, end)).toBeUndefined();
  });

  it('rejects missing, stale and future publication dates', () => {
    expect(publicationWindowIssue(null, start, end)).toBe('MISSING_PUBLICATION_DATE');
    expect(publicationWindowIssue('2026-08-14T23:00:00Z', start, end)).toBe(
      'OUTSIDE_PUBLICATION_WINDOW',
    );
    expect(publicationWindowIssue('2026-08-19T00:00:00Z', start, end)).toBe(
      'OUTSIDE_PUBLICATION_WINDOW',
    );
  });
});

describe('evidenceCandidateKey', () => {
  it('deduplicates tracking variants of the same quoted source', () => {
    const excerpt = 'El índice alcanzó 31,3 puntos durante julio.';
    const clean = evidenceCandidateKey('https://example.com/report?year=2026', excerpt);
    const tracked = evidenceCandidateKey(
      'https://example.com/report?utm_source=newsletter&year=2026#results',
      `  ${excerpt.toLocaleUpperCase('es')}  `,
    );

    expect(tracked).toBe(clean);
  });

  it('keeps different excerpts from the same article as separate evidence', () => {
    const url = 'https://example.com/report';

    expect(evidenceCandidateKey(url, 'La inflación subió.')).not.toBe(
      evidenceCandidateKey(url, 'Las exportaciones bajaron.'),
    );
  });
});

describe('resolveLinkedArticle', () => {
  it('upgrades a section page to the article whose label matches the candidate title', () => {
    const title = 'Confianza del consumidor baja a 31,3 puntos';
    const html = `<main><a href="/economia/confianza-313.html"><strong>${title}</strong></a></main>`;

    expect(
      resolveLinkedArticle(html, new URL('https://example.com/economia'), title)?.toString(),
    ).toBe('https://example.com/economia/confianza-313.html');
  });

  it('ignores non-HTTP links even when their label matches', () => {
    const title = 'Informe económico diario';
    const html = `<a href="javascript:alert(1)">${title}</a>`;

    expect(resolveLinkedArticle(html, new URL('https://example.com/'), title)).toBeUndefined();
  });
});

describe('groundedEntities', () => {
  it('removes an AI-attributed entity that does not occur in the evidence', () => {
    const source =
      'El Índice Primario de Sentimiento del Consumidor fue elaborado por Ipsos CIESMORI.';

    expect(groundedEntities(['Ipsos CIESMORI', 'INE', 'Bolivia'], source)).toEqual([
      'Ipsos CIESMORI',
    ]);
  });

  it('does not ground an acronym found only inside another word', () => {
    const source = 'El reporte define la metodología y presenta sus resultados.';

    expect(groundedEntities(['INE'], source)).toEqual([]);
  });

  it('recognizes an entity surrounded by punctuation', () => {
    const source = 'La publicación fue presentada por el INE.';

    expect(groundedEntities(['INE'], source)).toEqual(['INE']);
  });
});

describe('visibleText', () => {
  it('normalizes markup and common HTML entities for exact quote validation', () => {
    const html = Buffer.from('<p>Precio&nbsp;referencial &amp; regulado</p>');

    expect(visibleText(html, 'text/html')).toBe('Precio referencial & regulado');
  });

  it('decodes entities only once', () => {
    expect(visibleText(Buffer.from('&amp;quot;'), 'text/html')).toBe('&quot;');
  });

  it('excludes scripts, styles, templates, noscript blocks and comments', () => {
    const html = Buffer.from(`
      <style>.rate::after { content: "99%"; }</style>
      <script type="application/ld+json">{"claim":"Dato oculto 99%"}</script>
      <template>Dato oculto en plantilla</template>
      <noscript>Dato alternativo oculto</noscript>
      <!-- Dato oculto en comentario -->
      <main>Dato visible 31,3%</main>
    `);

    expect(visibleText(html, 'text/html')).toBe('Dato visible 31,3%');
  });

  it('preserves angle brackets in non-HTML evidence', () => {
    expect(visibleText(Buffer.from('Inflación < 2%'), 'text/plain')).toBe('Inflación < 2%');
  });
});

describe('requireVerifiableText', () => {
  it('rejects content for which quote grounding cannot be performed', () => {
    const sourceText = visibleText(Buffer.from('%PDF-1.7'), 'application/pdf');

    expect(() => requireVerifiableText(sourceText, 'application/pdf')).toThrow(
      'Evidence content is not text-verifiable (application/pdf)',
    );
  });

  it('accepts extracted textual evidence', () => {
    expect(() => requireVerifiableText('Dato oficial verificable', 'text/html')).not.toThrow();
  });
});

describe('ungroundedNumbers', () => {
  it('accepts decimal comma/dot variants and reports invented figures', () => {
    const source = 'El índice bajó de 38,7 a 31,3 puntos durante 2026.';

    expect(ungroundedNumbers('El índice bajó de 38.7 a 31.3 puntos en 2026.', source)).toEqual([]);
    expect(ungroundedNumbers('El índice bajó a 29.5 puntos.', source)).toEqual(['29.5']);
  });
});
