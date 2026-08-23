/**
 * Publisher identity that is established by the downloaded domain instead of by
 * page metadata.
 *
 * Legacy institutional pages in Bolivia publish authoritative tables as bare
 * HTML with no Open Graph, no JSON-LD and no `<meta>` dates, and market data
 * endpoints answer with plain JSON. Neither exposes the metadata
 * `htmlSourceMetadata` looks for, so an otherwise verifiable reading was being
 * treated as an unverified publisher and demoted below the automatic
 * publication threshold.
 *
 * The domain is not self-reported: the collector downloads that exact URL after
 * the SSRF guard resolved it, so whoever discovered the URL — a deterministic
 * parser or the research model — cannot forge the host.
 */

export type VerifiedSourceTier = 'OFFICIAL' | 'MARKET';

export interface VerifiedSource {
  /** Registered name of the institution or venue that publishes the domain. */
  readonly publisher: string;
  /** OFFICIAL is an institutional publisher; MARKET is a quoted trading venue. */
  readonly tier: VerifiedSourceTier;
}

const registry = new Map<string, VerifiedSource>([
  ['bcb.gob.bo', { publisher: 'BANCO CENTRAL DE BOLIVIA', tier: 'OFFICIAL' }],
  ['ine.gob.bo', { publisher: 'INSTITUTO NACIONAL DE ESTADISTICA', tier: 'OFFICIAL' }],
  [
    'asfi.gob.bo',
    { publisher: 'AUTORIDAD DE SUPERVISION DEL SISTEMA FINANCIERO', tier: 'OFFICIAL' },
  ],
  [
    'economiayfinanzas.gob.bo',
    { publisher: 'MINISTERIO DE ECONOMIA Y FINANZAS PUBLICAS', tier: 'OFFICIAL' },
  ],
  ['bbv.com.bo', { publisher: 'BOLSA BOLIVIANA DE VALORES', tier: 'OFFICIAL' }],
  [
    'udape.gob.bo',
    { publisher: 'UNIDAD DE ANALISIS DE POLITICAS SOCIALES Y ECONOMICAS', tier: 'OFFICIAL' },
  ],
  ['dolarbluebolivia.click', { publisher: 'DOLAR BLUE BOLIVIA', tier: 'MARKET' }],
]);

/** Matches a host against a registered domain or any of its subdomains. */
function registeredDomain(host: string): VerifiedSource | undefined {
  for (const [domain, source] of registry) {
    if (host === domain || host.endsWith(`.${domain}`)) return source;
  }
  return undefined;
}

/**
 * Resolves the publisher a URL's domain establishes, or undefined when the
 * domain is not registered and the publisher must come from page metadata.
 */
export function verifiedSource(rawUrl: string | URL): VerifiedSource | undefined {
  let url: URL;
  try {
    url = rawUrl instanceof URL ? rawUrl : new URL(rawUrl);
  } catch {
    return undefined;
  }
  if (url.protocol !== 'https:') return undefined;
  return registeredDomain(url.hostname.toLocaleLowerCase('en').replace(/^\[|\]$/gu, ''));
}

/**
 * True when an official indicator table declares no publication date and the
 * candidate does not claim one either.
 *
 * A daily quotation table states the date the value is in force inside its own
 * body and never declares a separate publication instant. Demanding one would
 * permanently demote the most authoritative reading the collector has, while
 * there is nothing here that a model could have invented: the candidate asserts
 * no publication date at all.
 */
export function undatedOfficialIndicator(input: {
  readonly recordType: string;
  readonly publishedAt: string | null;
  readonly publicationDateAssessment: string;
  readonly source: VerifiedSource | undefined;
}): boolean {
  return (
    input.recordType === 'DAILY_INDICATOR' &&
    input.publishedAt === null &&
    input.publicationDateAssessment === 'UNAVAILABLE' &&
    input.source?.tier === 'OFFICIAL'
  );
}
