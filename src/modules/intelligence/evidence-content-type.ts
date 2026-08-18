export interface EvidenceContentTypeAssessment {
  declaredMediaType: string | null;
  effectiveMediaType: string;
  status: 'MATCHED' | 'SNIFFED_OVERRIDE' | 'UNDECLARED';
}

function normalizedMediaType(declaredContentType?: string): string | undefined {
  const mediaType = declaredContentType?.split(';')[0]?.trim().toLocaleLowerCase('en');
  return mediaType || undefined;
}

function sniffedContentType(bytes: Buffer, declaredMediaType: string): string {
  if (bytes.subarray(0, 5).toString('ascii') === '%PDF-') return 'application/pdf';
  const sample = bytes.subarray(0, 4_096);
  const disallowedControls = [...sample].filter(
    (value) => value === 0 || (value < 32 && ![9, 10, 12, 13].includes(value)),
  ).length;
  const declaredTextual =
    declaredMediaType.startsWith('text/') ||
    ['application/json', 'application/xml', 'application/xhtml+xml'].some((type) =>
      declaredMediaType.includes(type),
    );
  if (declaredTextual && disallowedControls > Math.max(0, sample.length / 100)) {
    return 'application/octet-stream';
  }
  const prefix = bytes.subarray(0, 1_024).toString('utf8').trimStart();
  if (/^<!doctype\s+html|^<html\b|<head\b|<body\b/iu.test(prefix)) return 'text/html';
  if (/^[{[]/u.test(prefix)) {
    try {
      JSON.parse(bytes.toString('utf8'));
      return 'application/json';
    } catch {
      // A JSON-looking prefix is insufficient evidence of a JSON document.
    }
  }
  return declaredMediaType;
}

/** Makes the declared-versus-observed media decision explicit for artifact provenance. */
export function assessEvidenceContentType(
  bytes: Buffer,
  declaredContentType?: string,
): EvidenceContentTypeAssessment {
  const declaredMediaType = normalizedMediaType(declaredContentType);
  const effectiveMediaType = sniffedContentType(bytes, declaredMediaType ?? 'text/plain');
  return {
    declaredMediaType: declaredMediaType ?? null,
    effectiveMediaType,
    status:
      declaredMediaType === undefined
        ? 'UNDECLARED'
        : declaredMediaType === effectiveMediaType
          ? 'MATCHED'
          : 'SNIFFED_OVERRIDE',
  };
}

/** Determines the stored media type from bounded bytes instead of trusting HTTP metadata. */
export function effectiveContentType(bytes: Buffer, declaredContentType: string): string {
  return assessEvidenceContentType(bytes, declaredContentType).effectiveMediaType;
}
