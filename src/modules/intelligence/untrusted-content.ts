/**
 * Treats agent output as hostile input.
 *
 * Everything an agent submits originates from a web page it did not control, so
 * this module answers two questions the rest of the pipeline depends on: is the
 * cited location safe to record and later fetch, and does the quoted text try
 * to act as an instruction rather than as evidence.
 */

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);

/** Host forms that must never be reachable from a collection process. */
const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'localhost.localdomain',
  'metadata.google.internal',
  'instance-data',
]);

const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/u;

/**
 * Phrases that attempt to redirect a model rather than state a fact.
 *
 * The list deliberately targets imperative overrides. It is a routing signal
 * that sends the claim to a person; it is never used to silently drop content,
 * because a legitimate article may quote an attack.
 */
const INJECTION_MARKERS: readonly RegExp[] = [
  /ignore\s+(?:all\s+)?(?:previous|prior|above)\s+instructions/iu,
  /disregard\s+(?:all\s+)?(?:previous|prior|above)/iu,
  /system\s*prompt/iu,
  /you\s+are\s+now\s+(?:a|an)\s/iu,
  /act\s+as\s+(?:a|an)\s+\w+\s+and\s+(?:ignore|output|reveal)/iu,
  /reveal\s+(?:your|the)\s+(?:prompt|instructions|api\s*key)/iu,
  /olvida\s+(?:todas\s+)?las\s+instrucciones/iu,
  /ignora\s+(?:todas\s+)?las\s+instrucciones/iu,
  /eres\s+ahora\s+un\s/iu,
];

function isPrivateIpv4(hostname: string): boolean {
  const match = IPV4.exec(hostname);
  if (!match) return false;
  const octets = match.slice(1, 5).map(Number);
  if (octets.some((octet) => Number.isNaN(octet) || octet > 255)) return true;
  const [first = 0, second = 0] = octets;
  if (first === 10 || first === 127 || first === 0) return true;
  if (first === 172 && second >= 16 && second <= 31) return true;
  if (first === 192 && second === 168) return true;
  if (first === 169 && second === 254) return true;
  if (first === 100 && second >= 64 && second <= 127) return true;
  return first >= 224;
}

function isPrivateIpv6(hostname: string): boolean {
  const address = hostname.replace(/^\[|\]$/gu, '').toLowerCase();
  if (!address.includes(':')) return false;
  return (
    address === '::1' ||
    address === '::' ||
    address.startsWith('fc') ||
    address.startsWith('fd') ||
    address.startsWith('fe80') ||
    address.startsWith('::ffff:')
  );
}

/**
 * Reports why a cited location may not be recorded, or null when it is safe.
 *
 * Returning a reason instead of throwing keeps the decision usable both as a
 * validation rule and as a quarantine cause.
 */
export function describeUnsafeUrl(value: string): string | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return 'The evidence locator is not a valid absolute URL';
  }
  if (!ALLOWED_PROTOCOLS.has(url.protocol)) {
    return 'Only http and https locators are accepted';
  }
  const hostname = url.hostname.toLowerCase();
  if (!hostname || BLOCKED_HOSTNAMES.has(hostname)) {
    return 'The locator points at a loopback or metadata host';
  }
  if (isPrivateIpv4(hostname) || isPrivateIpv6(hostname)) {
    return 'The locator points at a private or reserved network';
  }
  if (!hostname.includes('.')) {
    return 'The locator host is not publicly qualified';
  }
  return null;
}

/** True when the locator is safe to persist and later re-fetch. */
export function isSafeSourceUrl(value: string): boolean {
  return describeUnsafeUrl(value) === null;
}

/**
 * Lists the injection patterns found in untrusted text.
 *
 * An empty result does not prove the text is benign; it only means no known
 * override phrasing was present, which is why publication still depends on the
 * review policy rather than on this check alone.
 */
export function findInjectionMarkers(text: string): readonly string[] {
  return INJECTION_MARKERS.filter((pattern) => pattern.test(text)).map((pattern) => pattern.source);
}
