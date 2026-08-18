import {
  calibrateConfidenceForExcerptUniqueness,
  evidenceCandidateKey,
  groundedEntities,
  locateExcerpt,
  publicationLocalDateIssue,
  publicationWindowIssue,
  requireVerifiableText,
  resolveLinkedArticle,
  visibleText,
} from '../evidence-quality';

describe('visibleText', () => {
  it('does not expose arbitrary binary content as visible text', () => {
    expect(visibleText(Buffer.from([0, 1, 2, 3]), 'application/octet-stream')).toBe('');
  });
});

describe('calibrateConfidenceForExcerptUniqueness', () => {
  it('preserves confidence for a uniquely located quotation', () => {
    expect(calibrateConfidenceForExcerptUniqueness('HIGH', 0.92, 1)).toEqual({
      confidenceLevel: 'HIGH',
      confidenceScore: 0.92,
      adjusted: false,
    });
  });

  it('routes a repeated quotation to low-confidence review', () => {
    expect(calibrateConfidenceForExcerptUniqueness('VERY_HIGH', 0.96, 2)).toEqual({
      confidenceLevel: 'LOW',
      confidenceScore: 0.49,
      adjusted: true,
    });
    expect(calibrateConfidenceForExcerptUniqueness('LOW', null, 25)).toEqual({
      confidenceLevel: 'LOW',
      confidenceScore: null,
      adjusted: false,
    });
  });
});

describe('locateExcerpt', () => {
  it('records reproducible normalized character offsets', () => {
    const locator = locateExcerpt(
      'El índice   mensual subió 3,2 %. Cierre.',
      'ÍNDICE mensual subió 3,2 %.',
    );

    expect(locator).toEqual({
      normalization: 'NFKC_WHITESPACE_LOWERCASE_ES',
      offsetUnit: 'UTF16_CODE_UNIT',
      normalizedStart: 3,
      normalizedEnd: 30,
      normalizedTextLength: 38,
      occurrenceCount: 1,
      occurrenceStarts: [3],
      positionsTruncated: false,
    });
  });

  it('reports every repeated occurrence instead of presenting it as unique', () => {
    expect(locateExcerpt('Dato verificado. Dato verificado.', 'dato verificado')).toMatchObject({
      occurrenceCount: 2,
      occurrenceStarts: [0, 17],
      positionsTruncated: false,
    });
  });

  it('bounds stored positions while retaining the true occurrence count', () => {
    const locator = locateExcerpt(Array.from({ length: 25 }, () => 'dato').join(' '), 'dato');

    expect(locator).toMatchObject({ occurrenceCount: 25, positionsTruncated: true });
    expect(locator?.occurrenceStarts).toHaveLength(20);
  });

  it('does not produce a locator for an absent or empty excerpt', () => {
    expect(locateExcerpt('Texto verificable', 'dato ausente')).toBeUndefined();
    expect(locateExcerpt('Texto verificable', '   ')).toBeUndefined();
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

describe('publicationLocalDateIssue', () => {
  const runAt = new Date('2026-08-18T12:00:00.000Z');

  it('accepts only the current calendar date in the configured timezone', () => {
    expect(
      publicationLocalDateIssue('2026-08-18T00:15:00-04:00', runAt, 'America/La_Paz'),
    ).toBeUndefined();
    expect(publicationLocalDateIssue('2026-08-17T23:59:59-04:00', runAt, 'America/La_Paz')).toBe(
      'OUTSIDE_LOCAL_PUBLICATION_DATE',
    );
  });

  it('uses the configured timezone at UTC date boundaries', () => {
    expect(publicationLocalDateIssue('2026-08-18T02:00:00.000Z', runAt, 'America/La_Paz')).toBe(
      'OUTSIDE_LOCAL_PUBLICATION_DATE',
    );
    expect(publicationLocalDateIssue(null, runAt, 'America/La_Paz')).toBe(
      'MISSING_PUBLICATION_DATE',
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
