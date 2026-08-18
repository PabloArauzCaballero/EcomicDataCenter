import { createHash, timingSafeEqual } from 'node:crypto';

export interface SourceContentDigestAssessment {
  algorithm: 'sha-256' | null;
  expectedBase64: string | null;
  actualBase64: string;
  status:
    'MATCHED' | 'MISMATCHED' | 'ENCODED_NOT_COMPARABLE' | 'UNDECLARED' | 'UNSUPPORTED' | 'INVALID';
}

const maximumDigestHeaderCharacters = 500;

/** Verifies the RFC 9530 Content-Digest sha-256 member against fetched content bytes. */
export function assessSourceContentDigest(
  response: Response,
  bytes: Buffer,
): SourceContentDigestAssessment {
  const actual = createHash('sha256').update(bytes).digest();
  const actualBase64 = actual.toString('base64');
  const header = response.headers.get('content-digest')?.trim();
  const base = { actualBase64 };
  if (!header) {
    return { ...base, algorithm: null, expectedBase64: null, status: 'UNDECLARED' };
  }
  const hasControlCharacters = [...header].some((character) => {
    const code = character.charCodeAt(0);
    return code <= 31 || code === 127;
  });
  if (header.length > maximumDigestHeaderCharacters || hasControlCharacters) {
    return { ...base, algorithm: null, expectedBase64: null, status: 'INVALID' };
  }
  const matches = [
    ...header.matchAll(
      /(?:^|,)\s*sha-256\s*=\s*:([A-Za-z0-9+/]*={0,2}):(?:\s*;[^,]*)?(?=\s*(?:,|$))/giu,
    ),
  ];
  if (matches.length === 0) {
    return {
      ...base,
      algorithm: null,
      expectedBase64: null,
      status: /sha-256\s*=/iu.test(header) ? 'INVALID' : 'UNSUPPORTED',
    };
  }
  const encoded = matches.length === 1 ? matches[0]?.[1] : undefined;
  const expected = encoded ? Buffer.from(encoded, 'base64') : Buffer.alloc(0);
  if (!encoded || expected.length !== 32 || expected.toString('base64') !== encoded) {
    return { ...base, algorithm: 'sha-256', expectedBase64: null, status: 'INVALID' };
  }
  const expectedBase64 = expected.toString('base64');
  const contentEncoding = response.headers.get('content-encoding')?.trim().toLocaleLowerCase('en');
  if (contentEncoding && contentEncoding !== 'identity') {
    return {
      ...base,
      algorithm: 'sha-256',
      expectedBase64,
      status: 'ENCODED_NOT_COMPARABLE',
    };
  }
  return {
    ...base,
    algorithm: 'sha-256',
    expectedBase64,
    status: timingSafeEqual(expected, actual) ? 'MATCHED' : 'MISMATCHED',
  };
}
