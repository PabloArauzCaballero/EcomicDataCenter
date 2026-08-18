import { assessSourceBodyLength, sourceResponseProvenance } from '../source-response-provenance';

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
        'content-encoding': 'gzip',
        'content-digest': 'sha-256=:YWJjZA==:',
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
      contentEncoding: 'gzip',
      contentDigest: 'sha-256=:YWJjZA==:',
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

describe('assessSourceBodyLength', () => {
  it('distinguishes matching and mismatching unencoded lengths', () => {
    expect(
      assessSourceBodyLength(new Response('data', { headers: { 'content-length': '004' } }), 4),
    ).toEqual({
      declaredBytes: '4',
      storedBytes: '4',
      contentEncoding: null,
      status: 'MATCHED',
    });
    expect(
      assessSourceBodyLength(new Response('data', { headers: { 'content-length': '3' } }), 4),
    ).toMatchObject({ status: 'MISMATCHED' });
  });

  it('does not compare a compressed transfer length with decoded stored bytes', () => {
    expect(
      assessSourceBodyLength(
        new Response('decoded', {
          headers: { 'content-length': '25', 'content-encoding': 'gzip' },
        }),
        7,
      ),
    ).toEqual({
      declaredBytes: '25',
      storedBytes: '7',
      contentEncoding: 'gzip',
      status: 'ENCODED_NOT_COMPARABLE',
    });
  });

  it('distinguishes missing and invalid declarations', () => {
    expect(assessSourceBodyLength(new Response('data'), 4)).toMatchObject({
      declaredBytes: null,
      status: 'UNDECLARED',
    });
    expect(
      assessSourceBodyLength(new Response('data', { headers: { 'content-length': '-4' } }), 4),
    ).toMatchObject({ declaredBytes: null, status: 'INVALID' });
  });
});
