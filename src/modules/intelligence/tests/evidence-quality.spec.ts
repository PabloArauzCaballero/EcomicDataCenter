import {
  evidenceCandidateKey,
  groundedEntities,
  publicationWindowIssue,
  requireVerifiableText,
  resolveLinkedArticle,
  ungroundedNumbers,
  visibleText,
} from '../evidence-quality';

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
