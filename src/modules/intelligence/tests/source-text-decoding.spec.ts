import { decodeSourceText } from '../source-text-decoding';
import { visibleText } from '../evidence-quality';
import { htmlSourceMetadata } from '../source-metadata';

describe('decodeSourceText', () => {
  it('decodes legacy Spanish text using a declared Windows-1252 charset', () => {
    const bytes = Buffer.from('Información económica', 'latin1');

    expect(decodeSourceText(bytes, 'text/html; charset=ISO-8859-1')).toMatchObject({
      text: 'Información económica',
      encoding: 'windows-1252',
      declaredEncoding: 'iso-8859-1',
      httpDeclaredEncoding: 'iso-8859-1',
      selectionSource: 'HTTP_HEADER',
      replacementCharacterCount: 0,
    });
  });

  it('uses an HTML meta declaration when the HTTP header omits charset', () => {
    const html = '<meta charset="windows-1252"><main>Información económica</main>';

    expect(decodeSourceText(Buffer.from(html, 'latin1'), 'text/html', 'text/html')).toMatchObject({
      text: html,
      encoding: 'windows-1252',
      declaredEncoding: 'windows-1252',
      htmlMetaEncoding: 'windows-1252',
      selectionSource: 'HTML_META',
    });
  });

  it('keeps HTTP precedence while retaining a conflicting HTML declaration for audit', () => {
    const html = '<meta charset="windows-1252"><main>Información económica</main>';

    expect(
      decodeSourceText(Buffer.from(html), 'text/html; charset=utf-8', 'text/html'),
    ).toMatchObject({
      text: html,
      encoding: 'utf-8',
      httpDeclaredEncoding: 'utf-8',
      htmlMetaEncoding: 'windows-1252',
      selectionSource: 'HTTP_HEADER',
    });
  });

  it('detects undeclared Windows-1252 only when bytes are invalid UTF-8', () => {
    const bytes = Buffer.from('Información económica', 'latin1');

    expect(decodeSourceText(bytes, 'text/html', 'text/html')).toMatchObject({
      text: 'Información económica',
      encoding: 'windows-1252',
      selectionSource: 'INVALID_UTF8_WINDOWS_1252_FALLBACK',
      replacementCharacterCount: 0,
    });
  });

  it('preserves legacy publisher metadata and visible evidence for downstream verification', () => {
    const html =
      '<meta property="og:site_name" content="Economía Pública"><main>Información económica</main>';
    const decoded = decodeSourceText(
      Buffer.from(html, 'latin1'),
      'text/html; charset=windows-1252',
    );

    expect(htmlSourceMetadata(decoded.text).publishers).toEqual(['Economía Pública']);
    expect(visibleText(decoded.text, 'text/html')).toBe('Información económica');
  });

  it('gives a byte-order mark precedence over a conflicting declaration', () => {
    const bytes = Buffer.concat([
      Buffer.from([0xff, 0xfe]),
      Buffer.from('Dato oficial', 'utf16le'),
    ]);

    expect(decodeSourceText(bytes, 'text/plain; charset=utf-8')).toMatchObject({
      text: 'Dato oficial',
      encoding: 'utf-16le',
      declaredEncoding: 'utf-8',
      httpDeclaredEncoding: 'utf-8',
      selectionSource: 'BOM',
    });
  });

  it('falls back to UTF-8 for unsupported declarations and records that decision', () => {
    expect(
      decodeSourceText(Buffer.from('Texto verificable'), 'text/plain; charset=shift_jis'),
    ).toMatchObject({
      text: 'Texto verificable',
      encoding: 'utf-8',
      declaredEncoding: 'shift_jis',
      selectionSource: 'UNSUPPORTED_DECLARATION_FALLBACK',
    });
  });
});
