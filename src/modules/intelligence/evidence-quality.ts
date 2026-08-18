/** Deterministic quality checks applied after AI research and before ingestion. */

export function comparable(value: string): string {
  return value.normalize('NFKC').replace(/\s+/gu, ' ').trim().toLocaleLowerCase('es');
}

export interface ExcerptTextLocator {
  normalization: 'NFKC_WHITESPACE_LOWERCASE_ES';
  offsetUnit: 'UTF16_CODE_UNIT';
  normalizedStart: number;
  normalizedEnd: number;
  normalizedTextLength: number;
  occurrenceCount: number;
  occurrenceStarts: number[];
  positionsTruncated: boolean;
}

const maximumRecordedExcerptPositions = 20;

/** Locates a quotation reproducibly in the same normalized text used for validation. */
export function locateExcerpt(sourceText: string, excerpt: string): ExcerptTextLocator | undefined {
  const haystack = comparable(sourceText);
  const needle = comparable(excerpt);
  if (!needle) return undefined;
  const occurrenceStarts: number[] = [];
  let occurrenceCount = 0;
  let cursor = haystack.indexOf(needle);
  while (cursor >= 0) {
    occurrenceCount += 1;
    if (occurrenceStarts.length < maximumRecordedExcerptPositions) occurrenceStarts.push(cursor);
    cursor = haystack.indexOf(needle, cursor + needle.length);
  }
  const normalizedStart = occurrenceStarts[0];
  if (normalizedStart === undefined) return undefined;
  return {
    normalization: 'NFKC_WHITESPACE_LOWERCASE_ES',
    offsetUnit: 'UTF16_CODE_UNIT',
    normalizedStart,
    normalizedEnd: normalizedStart + needle.length,
    normalizedTextLength: haystack.length,
    occurrenceCount,
    occurrenceStarts,
    positionsTruncated: occurrenceCount > occurrenceStarts.length,
  };
}

/** Stable identity for the same quoted evidence despite tracking parameters or fragments. */
export function evidenceCandidateKey(rawUrl: string, excerpt: string): string {
  const url = new URL(rawUrl);
  url.hash = '';
  for (const parameter of [...url.searchParams.keys()]) {
    if (/^(utm_.+|fbclid|gclid)$/iu.test(parameter)) url.searchParams.delete(parameter);
  }
  url.searchParams.sort();
  return `${url.toString()}\n${comparable(excerpt)}`;
}

export type PublicationWindowIssue = 'MISSING_PUBLICATION_DATE' | 'OUTSIDE_PUBLICATION_WINDOW';

export function publicationWindowIssue(
  publishedAt: string | null,
  windowStart: Date,
  windowEnd: Date,
): PublicationWindowIssue | undefined {
  if (!publishedAt) return 'MISSING_PUBLICATION_DATE';
  const publicationTime = Date.parse(publishedAt);
  if (
    !Number.isFinite(publicationTime) ||
    publicationTime < windowStart.getTime() ||
    publicationTime > windowEnd.getTime()
  ) {
    return 'OUTSIDE_PUBLICATION_WINDOW';
  }
  return undefined;
}

export function effectiveContentType(bytes: Buffer, declaredContentType: string): string {
  const prefix = bytes.subarray(0, 1_024).toString('utf8').trimStart();
  if (bytes.subarray(0, 5).toString('ascii') === '%PDF-') return 'application/pdf';
  if (/^<!doctype\s+html|^<html\b|<head\b|<body\b/iu.test(prefix)) return 'text/html';
  if (/^[{[]/u.test(prefix) && declaredContentType.includes('text/plain')) {
    return 'application/json';
  }
  return declaredContentType;
}

export function visibleText(bytes: Buffer, contentType: string): string {
  const textCompatible =
    contentType.startsWith('text/') ||
    contentType.includes('html') ||
    contentType.includes('xml') ||
    contentType.includes('json');
  if (!textCompatible) return '';
  const source = bytes.toString('utf8');
  let outsideMarkup = '';
  if (!contentType.includes('html') && !contentType.includes('xml')) {
    outsideMarkup = source;
  } else {
    const suppressedElements = new Set(['script', 'style', 'template', 'noscript']);
    let suppressedElement: string | undefined;
    let cursor = 0;
    while (cursor < source.length) {
      if (source.startsWith('<!--', cursor)) {
        const commentEnd = source.indexOf('-->', cursor + 4);
        cursor = commentEnd < 0 ? source.length : commentEnd + 3;
        outsideMarkup += ' ';
        continue;
      }
      if (source[cursor] !== '<') {
        if (!suppressedElement) outsideMarkup += source[cursor];
        cursor += 1;
        continue;
      }
      const tagEnd = source.indexOf('>', cursor + 1);
      if (tagEnd < 0) break;
      const tag = source.slice(cursor + 1, tagEnd);
      const tagMatch = /^\s*(\/?)\s*([a-z][a-z0-9-]*)/iu.exec(tag);
      const tagName = tagMatch?.[2]?.toLocaleLowerCase('en');
      const selfClosing = /\/\s*$/u.test(tag);
      if (tagMatch?.[1] && tagName === suppressedElement) {
        suppressedElement = undefined;
      } else if (!suppressedElement && !selfClosing && tagName && suppressedElements.has(tagName)) {
        suppressedElement = tagName;
      }
      outsideMarkup += ' ';
      cursor = tagEnd + 1;
    }
  }
  return outsideMarkup
    .replace(/&(nbsp|amp|quot|#160|#38|#34);/giu, (entity) => {
      const decoded: Record<string, string> = {
        '&nbsp;': ' ',
        '&#160;': ' ',
        '&amp;': '&',
        '&#38;': '&',
        '&quot;': '"',
        '&#34;': '"',
      };
      return decoded[entity.toLocaleLowerCase('en')] ?? entity;
    })
    .replace(/\s+/gu, ' ')
    .trim();
}

export function requireVerifiableText(sourceText: string, contentType: string): void {
  if (!sourceText.trim()) {
    throw new Error(`Evidence content is not text-verifiable (${contentType})`);
  }
}

function hrefFromOpeningTag(tag: string): string | undefined {
  const match = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/iu.exec(tag);
  return match?.[1] ?? match?.[2] ?? match?.[3];
}

/**
 * Finds an article link whose visible label matches the AI-provided title.
 * This upgrades a section/homepage result to the actual article before the
 * quote, hash and provenance record are validated.
 */
export function resolveLinkedArticle(html: string, baseUrl: URL, title: string): URL | undefined {
  const expected = comparable(title);
  const lowerHtml = html.toLocaleLowerCase('en');
  const matches: Array<{ url: URL; difference: number }> = [];
  let cursor = 0;
  while (cursor < html.length) {
    const opening = lowerHtml.indexOf('<a', cursor);
    if (opening < 0) break;
    const openingEnd = lowerHtml.indexOf('>', opening + 2);
    if (openingEnd < 0) break;
    const closing = lowerHtml.indexOf('</a>', openingEnd + 1);
    if (closing < 0) break;
    const href = hrefFromOpeningTag(html.slice(opening, openingEnd + 1));
    const label = comparable(
      visibleText(Buffer.from(html.slice(openingEnd + 1, closing)), 'text/html'),
    );
    if (href && label && (label.includes(expected) || expected.includes(label))) {
      try {
        const url = new URL(href, baseUrl);
        if (['http:', 'https:'].includes(url.protocol) && url.toString() !== baseUrl.toString()) {
          matches.push({ url, difference: Math.abs(label.length - expected.length) });
        }
      } catch {
        // An invalid link is ignored; the caller will retain the original URL.
      }
    }
    cursor = closing + 4;
  }
  return matches.sort((left, right) => left.difference - right.difference)[0]?.url;
}

export function groundedEntities(entityMentions: readonly string[], sourceText: string): string[] {
  const haystack = comparable(sourceText);
  return entityMentions.filter((entity) => {
    const needle = comparable(entity);
    let cursor = haystack.indexOf(needle);
    while (cursor >= 0) {
      const before = haystack[cursor - 1];
      const after = haystack[cursor + needle.length];
      const beginsAtBoundary = before === undefined || !/[\p{L}\p{N}]/u.test(before);
      const endsAtBoundary = after === undefined || !/[\p{L}\p{N}]/u.test(after);
      if (beginsAtBoundary && endsAtBoundary) return true;
      cursor = haystack.indexOf(needle, cursor + 1);
    }
    return false;
  });
}
