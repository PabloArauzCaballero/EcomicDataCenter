import { effectiveContentType } from '../evidence-content-type';

describe('effectiveContentType', () => {
  it('recognizes HTML and PDF evidence despite misleading headers', () => {
    expect(effectiveContentType(Buffer.from('<!doctype html><html></html>'), 'text/plain')).toBe(
      'text/html',
    );
    expect(effectiveContentType(Buffer.from('%PDF-1.7 binary'), 'text/plain')).toBe(
      'application/pdf',
    );
  });

  it('recognizes only complete valid JSON despite misleading headers', () => {
    expect(effectiveContentType(Buffer.from('{"dato": 42}'), 'text/html')).toBe('application/json');
    expect(effectiveContentType(Buffer.from('{not valid JSON'), 'text/plain')).toBe('text/plain');
  });

  it('rejects binary bytes disguised as textual evidence', () => {
    expect(effectiveContentType(Buffer.from([0, 1, 2, 3, 4, 5, 65, 66]), 'text/plain')).toBe(
      'application/octet-stream',
    );
    expect(effectiveContentType(Buffer.from('Dato\tverificable\n2026'), 'text/plain')).toBe(
      'text/plain',
    );
    expect(effectiveContentType(Buffer.from('Dato verificable'), ' Text/Plain ')).toBe(
      'text/plain',
    );
  });
});
