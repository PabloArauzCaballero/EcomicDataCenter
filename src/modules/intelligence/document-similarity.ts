import { createHash } from 'node:crypto';

/**
 * Recognises the same story republished by different outlets.
 *
 * A wire item is reprinted with a new headline, a different lead paragraph and
 * occasional edits, so exact hashing never matches. Shingling the normalized
 * text and comparing the resulting sets finds the overlap that survives those
 * edits, without pulling in a similarity library for one function.
 */

const SHINGLE_SIZE = 5;
const CLUSTER_THRESHOLD = 0.6;
const SIGNATURE_SHINGLES = 16;

const COMBINING_MARK_START = 0x0300;
const COMBINING_MARK_END = 0x036f;

/** Spanish and English function words that carry no discriminating signal. */
const STOP_WORDS = new Set([
  'el',
  'la',
  'los',
  'las',
  'un',
  'una',
  'unos',
  'unas',
  'de',
  'del',
  'al',
  'y',
  'o',
  'que',
  'en',
  'por',
  'para',
  'con',
  'sin',
  'sobre',
  'entre',
  'se',
  'su',
  'sus',
  'es',
  'son',
  'fue',
  'ha',
  'han',
  'como',
  'mas',
  'más',
  'the',
  'a',
  'an',
  'of',
  'to',
  'and',
  'or',
  'in',
  'on',
  'for',
  'with',
  'by',
  'is',
  'are',
  'was',
  'were',
  'has',
]);

function stripCombiningMarks(decomposed: string): string {
  return [...decomposed]
    .filter((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint < COMBINING_MARK_START || codePoint > COMBINING_MARK_END;
    })
    .join('');
}

/** Reduces text to the ordered content words used for comparison. */
export function contentTokens(text: string): readonly string[] {
  return stripCombiningMarks(text.normalize('NFD'))
    .toLowerCase()
    .replace(/[^a-z0-9\s]/gu, ' ')
    .split(/\s+/u)
    .filter((token) => token.length > 2 && !STOP_WORDS.has(token));
}

/** Builds the set of overlapping word windows that represents the text. */
export function shingles(text: string, size = SHINGLE_SIZE): ReadonlySet<string> {
  const tokens = contentTokens(text);
  if (tokens.length === 0) return new Set();
  if (tokens.length <= size) return new Set([tokens.join(' ')]);
  const result = new Set<string>();
  for (let index = 0; index + size <= tokens.length; index += 1) {
    result.add(tokens.slice(index, index + size).join(' '));
  }
  return result;
}

/** Jaccard overlap of two shingle sets, from 0 (unrelated) to 1 (identical). */
export function similarity(left: ReadonlySet<string>, right: ReadonlySet<string>): number {
  if (left.size === 0 || right.size === 0) return 0;
  let shared = 0;
  for (const shingle of left) {
    if (right.has(shingle)) shared += 1;
  }
  const union = left.size + right.size - shared;
  return union === 0 ? 0 : shared / union;
}

/**
 * Derives a stable bucket key so candidate comparison stays bounded.
 *
 * Comparing a new claim against every stored claim does not scale. The
 * signature hashes the lexicographically smallest shingles, which two versions
 * of the same story are very likely to share, turning a scan into a lookup.
 */
export function clusterFingerprint(text: string): string {
  const ordered = [...shingles(text)].sort().slice(0, SIGNATURE_SHINGLES);
  const material = ordered.length > 0 ? ordered.join('|') : contentTokens(text).join(' ');
  return createHash('sha256').update(material).digest('hex');
}

/** True when two texts are close enough to be treated as the same story. */
export function belongsToSameStory(left: string, right: string): boolean {
  return similarity(shingles(left), shingles(right)) >= CLUSTER_THRESHOLD;
}

export { CLUSTER_THRESHOLD };
