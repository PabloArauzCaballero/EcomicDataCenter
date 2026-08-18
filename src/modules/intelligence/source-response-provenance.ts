export interface SourceResponseProvenance {
  status: number;
  declaredContentType?: string;
  declaredContentLength?: string;
  contentEncoding?: string;
  etag?: string;
  lastModified?: string;
  responseDate?: string;
  contentLanguage?: string;
}

export interface SourceBodyLengthAssessment {
  declaredBytes: string | null;
  storedBytes: string;
  contentEncoding: string | null;
  status: 'MATCHED' | 'MISMATCHED' | 'ENCODED_NOT_COMPARABLE' | 'UNDECLARED' | 'INVALID';
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
  const contentEncoding = boundedHeader(response.headers, 'content-encoding');
  const etag = boundedHeader(response.headers, 'etag');
  const lastModified = boundedHeader(response.headers, 'last-modified');
  const responseDate = boundedHeader(response.headers, 'date');
  const contentLanguage = boundedHeader(response.headers, 'content-language');
  if (declaredContentType) result.declaredContentType = declaredContentType;
  if (declaredContentLength && /^\d{1,15}$/u.test(declaredContentLength)) {
    result.declaredContentLength = declaredContentLength;
  }
  if (contentEncoding) result.contentEncoding = contentEncoding;
  if (etag) result.etag = etag;
  if (lastModified) result.lastModified = lastModified;
  if (responseDate) result.responseDate = responseDate;
  if (contentLanguage) result.contentLanguage = contentLanguage;
  return result;
}

/** Explains whether HTTP length metadata can reproduce the stored response size. */
export function assessSourceBodyLength(
  response: Response,
  storedBytes: number,
): SourceBodyLengthAssessment {
  const rawLength = boundedHeader(response.headers, 'content-length');
  const contentEncoding = boundedHeader(response.headers, 'content-encoding') ?? null;
  const base = { storedBytes: String(storedBytes), contentEncoding };
  if (rawLength === undefined) return { ...base, declaredBytes: null, status: 'UNDECLARED' };
  if (!/^\d{1,15}$/u.test(rawLength)) {
    return { ...base, declaredBytes: null, status: 'INVALID' };
  }
  const declaredBytes = String(Number(rawLength));
  if (contentEncoding && contentEncoding.toLocaleLowerCase('en') !== 'identity') {
    return { ...base, declaredBytes, status: 'ENCODED_NOT_COMPARABLE' };
  }
  return {
    ...base,
    declaredBytes,
    status: Number(rawLength) === storedBytes ? 'MATCHED' : 'MISMATCHED',
  };
}
