import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

type Fetcher = (input: string, init: RequestInit) => Promise<Response>;
type HostResolver = (hostname: string) => Promise<readonly string[]>;

export interface SourceFetchResult {
  response: Response;
  finalUrl: URL;
  redirectCount: number;
}

function ipv4Parts(address: string): number[] | undefined {
  if (isIP(address) !== 4) return undefined;
  return address.split('.').map(Number);
}

export function isPrivateAddress(address: string): boolean {
  const normalized = address.toLocaleLowerCase('en').split('%')[0] ?? address;
  const mappedIpv4 = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/u.exec(normalized)?.[1];
  const ipv4 = ipv4Parts(mappedIpv4 ?? normalized);
  if (ipv4) {
    const [first = 0, second = 0] = ipv4;
    return (
      first === 0 ||
      first === 10 ||
      first === 127 ||
      (first === 100 && second >= 64 && second <= 127) ||
      (first === 169 && second === 254) ||
      (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && second === 168) ||
      first >= 224
    );
  }
  if (isIP(normalized) !== 6) return false;
  return (
    normalized === '::' ||
    normalized === '::1' ||
    /^f[cd]/u.test(normalized) ||
    /^fe[89ab]/u.test(normalized) ||
    /^ff/u.test(normalized)
  );
}

export function validatePublicSourceUrl(raw: string | URL): URL {
  const url = raw instanceof URL ? new URL(raw) : new URL(raw);
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('Only HTTP(S) sources are allowed');
  }
  if (url.username || url.password) throw new Error('Source URL credentials are not allowed');
  const host = url.hostname.toLocaleLowerCase('en').replace(/^\[|\]$/gu, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) {
    throw new Error('Private network source rejected');
  }
  if (isIP(host) && isPrivateAddress(host)) throw new Error('Private network source rejected');
  return url;
}

async function defaultResolver(hostname: string): Promise<readonly string[]> {
  if (isIP(hostname)) return [hostname];
  return (await lookup(hostname, { all: true, verbatim: true })).map(({ address }) => address);
}

async function assertPublicResolution(url: URL, resolver: HostResolver): Promise<void> {
  const hostname = url.hostname.replace(/^\[|\]$/gu, '');
  const addresses = await resolver(hostname);
  if (!addresses.length || addresses.some(isPrivateAddress)) {
    throw new Error('Source hostname resolved to a private or unavailable address');
  }
}

export async function fetchPublicSource(
  initialUrl: string | URL,
  init: RequestInit,
  timeoutMs: number,
  dependencies: { fetcher?: Fetcher; resolver?: HostResolver } = {},
): Promise<SourceFetchResult> {
  const fetcher = dependencies.fetcher ?? fetch;
  const resolver = dependencies.resolver ?? defaultResolver;
  const deadline = Date.now() + timeoutMs;
  let currentUrl = validatePublicSourceUrl(initialUrl);
  for (let redirectCount = 0; redirectCount <= 5; redirectCount += 1) {
    await assertPublicResolution(currentUrl, resolver);
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new Error('Source request timed out');
    const response = await fetcher(currentUrl.toString(), {
      ...init,
      redirect: 'manual',
      signal: AbortSignal.timeout(remaining),
    });
    if (![301, 302, 303, 307, 308].includes(response.status)) {
      return { response, finalUrl: currentUrl, redirectCount };
    }
    if (redirectCount === 5) throw new Error('Source exceeded the redirect limit');
    const location = response.headers.get('location');
    if (!location) throw new Error('Source redirect did not provide a destination');
    currentUrl = validatePublicSourceUrl(new URL(location, currentUrl));
  }
  throw new Error('Source exceeded the redirect limit');
}
