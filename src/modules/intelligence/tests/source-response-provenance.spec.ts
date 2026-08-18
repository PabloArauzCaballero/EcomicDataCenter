import { sourceResponseProvenance } from '../source-response-provenance';

describe('sourceResponseProvenance', () => {
  it('retains a bounded allowlist of reproducibility headers', () => {
    const response = new Response('evidence', {
      status: 200,
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'content-length': '8',
        etag: '"version-42"',
        'last-modified': 'Tue, 18 Aug 2026 12:00:00 GMT',
        date: 'Tue, 18 Aug 2026 12:05:00 GMT',
        'content-language': 'es-BO',
        'set-cookie': 'session=must-not-be-recorded',
        authorization: 'must-not-be-recorded',
      },
    });

    expect(sourceResponseProvenance(response)).toEqual({
      status: 200,
      declaredContentType: 'text/html; charset=utf-8',
      declaredContentLength: '8',
      etag: '"version-42"',
      lastModified: 'Tue, 18 Aug 2026 12:00:00 GMT',
      responseDate: 'Tue, 18 Aug 2026 12:05:00 GMT',
      contentLanguage: 'es-BO',
    });
  });

  it('drops oversized and malformed values', () => {
    const response = new Response(null, {
      headers: {
        etag: 'x'.repeat(501),
        'content-length': '-20',
      },
    });

    expect(sourceResponseProvenance(response)).toEqual({ status: 200 });
  });
});
