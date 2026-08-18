export interface HtmlSourceMetadata {
  publishers: string[];
  publicationDates: string[];
  canonicalUrls: string[];
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
    publishers: publisherKeys.flatMap((key) => [...(publishersByKey.get(key) ?? [])]),
    publicationDates: [...publicationDates],
    canonicalUrls: [...canonicalUrls],
  };
}

export function canonicalSourceUrl(metadata: HtmlSourceMetadata, baseUrl: URL): URL | undefined {
  for (const value of metadata.canonicalUrls) {
    try {
      const url = new URL(value, baseUrl);
      if (['http:', 'https:'].includes(url.protocol)) return url;
    } catch {
      // Invalid canonical metadata is ignored and the downloaded URL is retained.
    }
  }
  return undefined;
}

export function publicationMetadataMatches(
  publishedAt: string,
  sourcePublicationDates: readonly string[],
): boolean | undefined {
  if (!sourcePublicationDates.length) return undefined;
  const expectedDate = /^\d{4}-\d{2}-\d{2}/u.exec(publishedAt)?.[0];
  return sourcePublicationDates.some(
    (value) => /^\d{4}-\d{2}-\d{2}/u.exec(value)?.[0] === expectedDate,
  );
}
