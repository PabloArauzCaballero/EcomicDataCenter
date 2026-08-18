export interface SourceResponseProvenance {
  status: number;
  declaredContentType?: string;
  declaredContentLength?: string;
  etag?: string;
  lastModified?: string;
  responseDate?: string;
  contentLanguage?: string;
}

const maximumHeaderCharacters = 500;

function boundedHeader(headers: Headers, name: string): string | undefined {
  const value = headers.get(name)?.trim();
  const hasControlCharacters = [...(value ?? '')].some((character) => {
    const code = character.charCodeAt(0);
    return code <= 31 || code === 127;
  });
  if (!value || value.length > maximumHeaderCharacters || hasControlCharacters) {
    return undefined;
  }
  return value;
}

/** Retains only a small allowlist of bounded, non-secret response headers. */
export function sourceResponseProvenance(response: Response): SourceResponseProvenance {
  const result: SourceResponseProvenance = { status: response.status };
  const declaredContentType = boundedHeader(response.headers, 'content-type');
  const declaredContentLength = boundedHeader(response.headers, 'content-length');
  const etag = boundedHeader(response.headers, 'etag');
  const lastModified = boundedHeader(response.headers, 'last-modified');
  const responseDate = boundedHeader(response.headers, 'date');
  const contentLanguage = boundedHeader(response.headers, 'content-language');
  if (declaredContentType) result.declaredContentType = declaredContentType;
  if (declaredContentLength && /^\d{1,15}$/u.test(declaredContentLength)) {
    result.declaredContentLength = declaredContentLength;
  }
  if (etag) result.etag = etag;
  if (lastModified) result.lastModified = lastModified;
  if (responseDate) result.responseDate = responseDate;
  if (contentLanguage) result.contentLanguage = contentLanguage;
  return result;
}
