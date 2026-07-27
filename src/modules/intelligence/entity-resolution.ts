/**
 * Resolves the many ways a source can name the same organization.
 *
 * Bolivian corporate names appear with and without legal suffixes, with
 * accents stripped by one outlet and kept by another, and abbreviated in
 * headlines. Normalizing before matching keeps those from becoming distinct
 * entities in the datacenter.
 */

const LEGAL_SUFFIXES = [
  's.a.',
  'sa',
  's.r.l.',
  'srl',
  's.a.c.',
  'sac',
  'ltda',
  'ltda.',
  'y cia',
  'e.i.r.l.',
  'eirl',
];

export interface AliasCandidate {
  readonly economicEntityId: string;
  readonly normalizedAlias: string;
}

export interface MentionResolution {
  readonly economicEntityId: string | null;
  readonly method: 'EXACT_ALIAS' | 'NORMALIZED_ALIAS' | 'UNRESOLVED';
  readonly confidence: number | null;
}

const COMBINING_MARK_START = 0x0300;
const COMBINING_MARK_END = 0x036f;

/** Drops the accent marks that NFD separates from their base letter. */
function stripCombiningMarks(decomposed: string): string {
  return [...decomposed]
    .filter((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint < COMBINING_MARK_START || codePoint > COMBINING_MARK_END;
    })
    .join('');
}

/**
 * Produces the comparable form of a name.
 *
 * Accents are folded, punctuation dropped, legal suffixes removed and
 * whitespace collapsed, so "Y.P.F.B." and "ypfb" converge.
 */
export function normalizeEntityName(value: string): string {
  const folded = stripCombiningMarks(value.normalize('NFD'))
    .toLowerCase()
    .replace(/[^a-z0-9\s.]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();

  const withoutSuffix = LEGAL_SUFFIXES.reduce(
    (name, suffix) => (name.endsWith(` ${suffix}`) ? name.slice(0, -suffix.length - 1) : name),
    folded,
  );
  return withoutSuffix.replace(/\./gu, '').replace(/\s+/gu, ' ').trim();
}

/**
 * Matches a mention against known aliases.
 *
 * Only exact and normalized matches resolve. Fuzzy matching is deliberately
 * absent: silently attaching a claim to the wrong company is more damaging to
 * an economic report than leaving the mention unresolved for a person.
 */
export function resolveMention(
  mentionText: string,
  candidates: readonly AliasCandidate[],
): MentionResolution {
  const exact = candidates.find((candidate) => candidate.normalizedAlias === mentionText);
  if (exact) {
    return { economicEntityId: exact.economicEntityId, method: 'EXACT_ALIAS', confidence: 1 };
  }
  const normalized = normalizeEntityName(mentionText);
  const matches = candidates.filter((candidate) => candidate.normalizedAlias === normalized);
  if (matches.length === 1 && matches[0]) {
    return {
      economicEntityId: matches[0].economicEntityId,
      method: 'NORMALIZED_ALIAS',
      confidence: 0.9,
    };
  }
  return { economicEntityId: null, method: 'UNRESOLVED', confidence: null };
}
