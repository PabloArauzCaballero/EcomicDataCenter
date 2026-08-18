export interface SourceTextDecoding {
  text: string;
  encoding: 'utf-8' | 'windows-1252' | 'utf-16le' | 'utf-16be';
  selectionSource:
    | 'BOM'
    | 'HTTP_HEADER'
    | 'HTML_META'
    | 'DEFAULT'
    | 'INVALID_UTF8_WINDOWS_1252_FALLBACK'
    | 'UNSUPPORTED_DECLARATION_FALLBACK';
  declaredEncoding?: string;
  httpDeclaredEncoding?: string;
  htmlMetaEncoding?: string;
  replacementCharacterCount: number;
}

const encodingAliases = new Map<string, SourceTextDecoding['encoding']>([
  ['utf-8', 'utf-8'],
  ['utf8', 'utf-8'],
  ['windows-1252', 'windows-1252'],
  ['cp1252', 'windows-1252'],
  ['iso-8859-1', 'windows-1252'],
  ['latin1', 'windows-1252'],
  ['utf-16', 'utf-16le'],
  ['utf-16le', 'utf-16le'],
  ['utf-16be', 'utf-16be'],
]);

function declaredCharset(contentType: string): string | undefined {
  const match = /\bcharset\s*=\s*(?:"([^"]+)"|'([^']+)'|([^;\s]+))/iu.exec(contentType);
  const value = (match?.[1] ?? match?.[2] ?? match?.[3])?.trim().toLocaleLowerCase('en');
  return value && value.length <= 100 ? value : undefined;
}

function htmlMetaCharset(bytes: Buffer, effectiveContentType?: string): string | undefined {
  if (!effectiveContentType?.includes('html')) return undefined;
  const prefix = bytes.subarray(0, 8_192).toString('latin1');
  for (const match of prefix.matchAll(/<meta\b[^>]{0,1000}>/giu)) {
    const value = declaredCharset(match[0]);
    if (value) return value;
  }
  return undefined;
}

function validUtf8(bytes: Buffer): boolean {
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return true;
  } catch {
    return false;
  }
}

function byteOrderMark(bytes: Buffer): SourceTextDecoding['encoding'] | undefined {
  if (bytes.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf]))) return 'utf-8';
  if (bytes.subarray(0, 2).equals(Buffer.from([0xff, 0xfe]))) return 'utf-16le';
  if (bytes.subarray(0, 2).equals(Buffer.from([0xfe, 0xff]))) return 'utf-16be';
  return undefined;
}

/** Decodes bounded source bytes using only a conservative set of stateless encodings. */
export function decodeSourceText(
  bytes: Buffer,
  declaredContentType: string,
  effectiveContentType = declaredContentType,
): SourceTextDecoding {
  const bomEncoding = byteOrderMark(bytes);
  const httpDeclaredEncoding = declaredCharset(declaredContentType);
  const htmlMetaEncoding = htmlMetaCharset(bytes, effectiveContentType);
  const supportedHttpDeclaration = httpDeclaredEncoding
    ? encodingAliases.get(httpDeclaredEncoding)
    : undefined;
  const supportedHtmlDeclaration = htmlMetaEncoding
    ? encodingAliases.get(htmlMetaEncoding)
    : undefined;
  const hasUnsupportedDeclaration = Boolean(
    (httpDeclaredEncoding && !supportedHttpDeclaration) ||
    (!httpDeclaredEncoding && htmlMetaEncoding && !supportedHtmlDeclaration),
  );
  const useWindowsFallback =
    !bomEncoding && !httpDeclaredEncoding && !htmlMetaEncoding && !validUtf8(bytes);
  const encoding =
    bomEncoding ??
    supportedHttpDeclaration ??
    supportedHtmlDeclaration ??
    (useWindowsFallback ? 'windows-1252' : 'utf-8');
  const selectionSource = bomEncoding
    ? 'BOM'
    : supportedHttpDeclaration
      ? 'HTTP_HEADER'
      : supportedHtmlDeclaration
        ? 'HTML_META'
        : hasUnsupportedDeclaration
          ? 'UNSUPPORTED_DECLARATION_FALLBACK'
          : useWindowsFallback
            ? 'INVALID_UTF8_WINDOWS_1252_FALLBACK'
            : 'DEFAULT';
  const text = new TextDecoder(encoding).decode(bytes);
  let replacementCharacterCount = 0;
  for (const character of text) {
    if (character === '\ufffd') replacementCharacterCount += 1;
  }
  const result: SourceTextDecoding = {
    text,
    encoding,
    selectionSource,
    replacementCharacterCount,
  };
  const declaredEncoding = httpDeclaredEncoding ?? htmlMetaEncoding;
  if (declaredEncoding) result.declaredEncoding = declaredEncoding;
  if (httpDeclaredEncoding) result.httpDeclaredEncoding = httpDeclaredEncoding;
  if (htmlMetaEncoding) result.htmlMetaEncoding = htmlMetaEncoding;
  return result;
}
