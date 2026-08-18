export interface SourceTextDecoding {
  text: string;
  encoding: 'utf-8' | 'windows-1252' | 'utf-16le' | 'utf-16be';
  selectionSource: 'BOM' | 'DECLARED' | 'DEFAULT' | 'UNSUPPORTED_DECLARATION_FALLBACK';
  declaredEncoding?: string;
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

function byteOrderMark(bytes: Buffer): SourceTextDecoding['encoding'] | undefined {
  if (bytes.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf]))) return 'utf-8';
  if (bytes.subarray(0, 2).equals(Buffer.from([0xff, 0xfe]))) return 'utf-16le';
  if (bytes.subarray(0, 2).equals(Buffer.from([0xfe, 0xff]))) return 'utf-16be';
  return undefined;
}

/** Decodes bounded source bytes using only a conservative set of stateless encodings. */
export function decodeSourceText(bytes: Buffer, declaredContentType: string): SourceTextDecoding {
  const bomEncoding = byteOrderMark(bytes);
  const declaredEncoding = declaredCharset(declaredContentType);
  const supportedDeclaration = declaredEncoding ? encodingAliases.get(declaredEncoding) : undefined;
  const encoding = bomEncoding ?? supportedDeclaration ?? 'utf-8';
  const selectionSource = bomEncoding
    ? 'BOM'
    : supportedDeclaration
      ? 'DECLARED'
      : declaredEncoding
        ? 'UNSUPPORTED_DECLARATION_FALLBACK'
        : 'DEFAULT';
  const text = new TextDecoder(encoding).decode(bytes);
  let replacementCharacterCount = 0;
  for (const character of text) {
    if (character === '\ufffd') replacementCharacterCount += 1;
  }
  return {
    text,
    encoding,
    selectionSource,
    ...(declaredEncoding ? { declaredEncoding } : {}),
    replacementCharacterCount,
  };
}
