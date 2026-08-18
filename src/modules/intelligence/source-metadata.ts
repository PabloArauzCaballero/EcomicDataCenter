export interface HtmlSourceMetadata {
  publishers: string[];
  publicationDates: string[];
  canonicalUrls: string[];
}

const maximumJsonLdCharacters = 100_000;
const maximumJsonLdNodes = 500;
const maximumJsonLdDepth = 10;

function jsonLdValues(html: string): {
  publishers: string[];
  publicationDates: string[];
  canonicalUrls: string[];
} {
  const publishers = new Set<string>();
  const publicationDates = new Set<string>();
  const canonicalUrls = new Set<string>();
  let cursor = 0;
  let visitedNodes = 0;
  const normalizedHtml = html.toLocaleLowerCase('en');
  const boundedString = (value: unknown): string | undefined =>
    typeof value === 'string' && value.trim().length > 0 && value.length <= 500
      ? value.trim()
      : undefined;
  const collectDocumentNodes = (value: unknown, depth: number): void => {
    if (depth > maximumJsonLdDepth || visitedNodes >= maximumJsonLdNodes) return;
    if (Array.isArray(value)) {
      for (const item of value) collectDocumentNodes(item, depth + 1);
      return;
    }
    if (!value || typeof value !== 'object') return;
    visitedNodes += 1;
    const node = value as Record<string, unknown>;
    const publishedAt = boundedString(node.datePublished);
    if (publishedAt) publicationDates.add(publishedAt);
    const publisher = node.publisher;
    const publisherName = boundedString(publisher);
    if (publisherName) publishers.add(publisherName);
    else if (publisher && typeof publisher === 'object') {
      const name = boundedString((publisher as Record<string, unknown>).name);
      if (name) publishers.add(name);
    }
    const mainEntity = node.mainEntityOfPage;
    const mainEntityUrl = boundedString(mainEntity);
    if (mainEntityUrl) canonicalUrls.add(mainEntityUrl);
    else if (mainEntity && typeof mainEntity === 'object') {
      const entity = mainEntity as Record<string, unknown>;
      const url = boundedString(entity['@id'] ?? entity.url);
      if (url) canonicalUrls.add(url);
    }
    collectDocumentNodes(node['@graph'], depth + 1);
    collectDocumentNodes(node.mainEntity, depth + 1);
  };
  while (cursor < html.length) {
    const opening = normalizedHtml.indexOf('<script', cursor);
    if (opening < 0) break;
    const openingEnd = html.indexOf('>', opening + 7);
    if (openingEnd < 0) break;
    const attributes = tagAttributes(html.slice(opening + 1, openingEnd));
    const closing = normalizedHtml.indexOf('</script', openingEnd + 1);
    if (closing < 0) break;
    if (attributes.get('type')?.toLocaleLowerCase('en') === 'application/ld+json') {
      const source = html.slice(openingEnd + 1, closing).trim();
      if (source.length <= maximumJsonLdCharacters) {
        try {
          collectDocumentNodes(JSON.parse(source), 0);
        } catch {
          // Malformed structured metadata is ignored; visible evidence remains authoritative.
        }
      }
    }
    const closingEnd = html.indexOf('>', closing + 8);
    cursor = closingEnd < 0 ? html.length : closingEnd + 1;
  }
  return {
    publishers: [...publishers],
    publicationDates: [...publicationDates],
    canonicalUrls: [...canonicalUrls],
  };
}

function tagAttributes(tag: string): Map<string, string> {
  const attributes = new Map<string, string>();
  const pattern = /([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gu;
  for (const match of tag.matchAll(pattern)) {
    const name = match[1]?.toLocaleLowerCase('en');
    const value = match[2] ?? match[3] ?? match[4];
    if (name && value !== undefined) attributes.set(name, value.trim());
  }
  return attributes;
}

export function htmlSourceMetadata(html: string): HtmlSourceMetadata {
  const publishersByKey = new Map<string, Set<string>>();
  const publicationDates = new Set<string>();
  const canonicalUrls = new Set<string>();
  const publisherKeys = ['og:site_name', 'publisher', 'article:publisher'];
  const dateKeys = new Set([
    'article:published_time',
    'datepublished',
    'publishdate',
    'pubdate',
    'dc.date',
    'dc.date.issued',
  ]);
  let suppressedElement: string | undefined;
  const structured = jsonLdValues(html);
  for (const publisher of structured.publishers) {
    const values = publishersByKey.get('json-ld') ?? new Set<string>();
    values.add(publisher);
    publishersByKey.set('json-ld', values);
  }
  for (const date of structured.publicationDates) publicationDates.add(date);
  for (const url of structured.canonicalUrls) canonicalUrls.add(url);
  let cursor = 0;
  while (cursor < html.length) {
    const opening = html.indexOf('<', cursor);
    if (opening < 0) break;
    const end = html.indexOf('>', opening + 1);
    if (end < 0) break;
    const tag = html.slice(opening + 1, end);
    const tagMatch = /^\s*(\/?)\s*([a-z][a-z0-9-]*)/iu.exec(tag);
    const tagName = tagMatch?.[2]?.toLocaleLowerCase('en');
    if (tagMatch?.[1] && tagName === suppressedElement) {
      suppressedElement = undefined;
    } else if (!suppressedElement && ['script', 'style', 'template'].includes(tagName ?? '')) {
      suppressedElement = tagName;
    } else if (
      !suppressedElement &&
      (tagName === 'meta' || tagName === 'time' || tagName === 'link')
    ) {
      const attributes = tagAttributes(tag);
      if (
        tagName === 'link' &&
        attributes.get('rel')?.toLocaleLowerCase('en').split(/\s+/u).includes('canonical')
      ) {
        const canonicalUrl = attributes.get('href');
        if (canonicalUrl) canonicalUrls.add(canonicalUrl);
      }
      const key = (
        attributes.get('property') ??
        attributes.get('name') ??
        attributes.get('itemprop') ??
        ''
      ).toLocaleLowerCase('en');
      const value = attributes.get('content') ?? attributes.get('datetime');
      if (value && publisherKeys.includes(key) && !/^https?:\/\//iu.test(value)) {
        const values = publishersByKey.get(key) ?? new Set<string>();
        values.add(value);
        publishersByKey.set(key, values);
      }
      if (value && dateKeys.has(key)) publicationDates.add(value);
    }
    cursor = end + 1;
  }
  return {
    publishers: [...publisherKeys, 'json-ld'].flatMap((key) => [
      ...(publishersByKey.get(key) ?? []),
    ]),
    publicationDates: [...publicationDates],
    canonicalUrls: [...canonicalUrls],
  };
}

export function canonicalSourceUrl(metadata: HtmlSourceMetadata, baseUrl: URL): URL | undefined {
  const trustedHost = baseUrl.hostname.toLocaleLowerCase('en').replace(/^www\./u, '');
  for (const value of metadata.canonicalUrls) {
    try {
      const url = new URL(value, baseUrl);
      const canonicalHost = url.hostname.toLocaleLowerCase('en').replace(/^www\./u, '');
      const downgradesTransport = baseUrl.protocol === 'https:' && url.protocol !== 'https:';
      const changesExplicitPort = url.port !== baseUrl.port && Boolean(url.port || baseUrl.port);
      if (
        ['http:', 'https:'].includes(url.protocol) &&
        !url.username &&
        !url.password &&
        canonicalHost === trustedHost &&
        !downgradesTransport &&
        !changesExplicitPort
      ) {
        return url;
      }
    } catch {
      // Invalid canonical metadata is ignored and the downloaded URL is retained.
    }
  }
  return undefined;
}
