/** Deterministic quality checks applied after AI research and before ingestion. */

export function comparable(value: string): string {
  return value.normalize('NFKC').replace(/\s+/gu, ' ').trim().toLocaleLowerCase('es');
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

export function visibleText(bytes: Buffer, contentType: string): string {
  if (contentType.includes('pdf')) return '';
  let outsideMarkup = '';
  let insideTag = false;
  for (const character of bytes.toString('utf8')) {
    if (character === '<') {
      insideTag = true;
      outsideMarkup += ' ';
    } else if (character === '>') {
      insideTag = false;
      outsideMarkup += ' ';
    } else if (!insideTag) {
      outsideMarkup += character;
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

function numericTokens(value: string): string[] {
  return value.match(/\d+(?:[.,]\d+)*/gu) ?? [];
}

function comparableNumber(value: string): string {
  return value.replace(/,/gu, '.').replace(/^0+(?=\d)/u, '');
}

/** Returns figures asserted by the AI that do not occur in the downloaded evidence. */
export function ungroundedNumbers(assertion: string, sourceText: string): string[] {
  const evidenceNumbers = new Set(numericTokens(sourceText).map(comparableNumber));
  return [...new Set(numericTokens(assertion))].filter(
    (number) => !evidenceNumbers.has(comparableNumber(number)),
  );
}
