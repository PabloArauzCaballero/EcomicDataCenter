import { groundedEntities } from './evidence-quality';
import { ungroundedNumbers } from './quantitative-grounding';

export interface ClaimEvidenceGrounding {
  entityMentions: string[];
  unsupportedNumbers: string[];
  lexicalGrounding: LexicalGrounding;
}

export interface LexicalGrounding {
  status: 'SUPPORTED' | 'LIMITED' | 'UNSUPPORTED' | 'UNAVAILABLE';
  polarityAligned: boolean;
  directionAligned: boolean;
  assertionDirections: EconomicDirection[];
  excerptDirections: EconomicDirection[];
  assertionSignedDirections: SignedEconomicDirection[];
  excerptSignedDirections: SignedEconomicDirection[];
  assertionTermCount: number;
  matchedTermCount: number;
  matchedTerms: string[];
  coverage: number | null;
}

const stopWords = new Set([
  'the',
  'and',
  'for',
  'from',
  'that',
  'this',
  'with',
  'was',
  'were',
  'has',
  'have',
  'una',
  'uno',
  'unos',
  'unas',
  'los',
  'las',
  'del',
  'por',
  'para',
  'con',
  'sin',
  'que',
  'como',
  'desde',
  'hasta',
  'entre',
  'sobre',
  'segun',
  'este',
  'esta',
  'estos',
  'estas',
  'durante',
  'fue',
  'son',
  'han',
  'sus',
]);
const minimumSupportedLexicalCoverage = 0.5;

function lexicalTerms(value: string): string[] {
  const normalized = value.normalize('NFKD').replace(/\p{M}/gu, '').toLocaleLowerCase('es');
  const terms = normalized.match(/\p{L}[\p{L}\p{N}]*/gu) ?? [];
  return [...new Set(terms.filter((term) => term.length >= 3 && !stopWords.has(term)))];
}

function hasSemanticNegation(value: string): boolean {
  const normalized = value.normalize('NFKD').replace(/\p{M}/gu, '').toLocaleLowerCase('es');
  return (
    /\b(?:nunca|jamas|never|without)\b/u.test(normalized) ||
    /\bno\b(?!\s+(?:obstante|solo|solamente)\b)/u.test(normalized) ||
    /\bsin\b(?!\s+embargo\b)/u.test(normalized) ||
    /\bnot\b(?!\s+only\b)/u.test(normalized)
  );
}

export type EconomicDirection = 'UP' | 'DOWN' | 'STABLE';
export type SignedEconomicDirection = EconomicDirection | `NOT_${EconomicDirection}`;

function directionForTerm(term: string): EconomicDirection | null {
  if (
    /^(?:aument\w*|increment\w*|subi\w*|crec\w*|alza|ascend\w*|increas\w*|rise|rose|risen|grow|grew|grown|higher)$/u.test(
      term,
    )
  ) {
    return 'UP';
  }
  if (
    /^(?:dismin\w*|reduc\w*|baj\w*|cai\w*|cay\w*|descend\w*|contraj\w*|decreas\w*|declin\w*|fall|fell|fallen|drop\w*|lower)$/u.test(
      term,
    )
  ) {
    return 'DOWN';
  }
  return /^(?:estable|estables|mantuvo|mantuvieron|unchanged|steady|flat)$/u.test(term)
    ? 'STABLE'
    : null;
}

function economicDirectionSequences(value: string): {
  directions: EconomicDirection[];
  signedDirections: SignedEconomicDirection[];
} {
  const normalized = value.normalize('NFKD').replace(/\p{M}/gu, '').toLocaleLowerCase('es');
  const terms = normalized.match(/\p{L}[\p{L}\p{N}]*/gu) ?? [];
  const pairs = terms.flatMap((term, index) => {
    const direction = directionForTerm(term);
    if (!direction) return [];
    const previousTerm = terms[index - 1];
    const negated = /^(?:no|nunca|jamas|sin|not|never|without)$/u.test(previousTerm ?? '');
    return [{ direction, signedDirection: negated ? (`NOT_${direction}` as const) : direction }];
  });
  const distinctPairs = pairs.filter(
    (pair, index) => pair.signedDirection !== pairs[index - 1]?.signedDirection,
  );
  return {
    directions: distinctPairs.map(({ direction }) => direction),
    signedDirections: distinctPairs.map(({ signedDirection }) => signedDirection),
  };
}

function containsOrderedSequence<T>(evidence: readonly T[], assertion: readonly T[]): boolean {
  return evidence.some((_, start) =>
    assertion.every((direction, offset) => evidence[start + offset] === direction),
  );
}

function oppositeSignedDirection(direction: SignedEconomicDirection): SignedEconomicDirection {
  return direction.startsWith('NOT_')
    ? (direction.slice(4) as EconomicDirection)
    : (`NOT_${direction}` as SignedEconomicDirection);
}

export function assessLexicalGrounding(assertion: string, excerpt: string): LexicalGrounding {
  const assertionTerms = lexicalTerms(assertion);
  const excerptTerms = new Set(lexicalTerms(excerpt));
  const matchedTerms = assertionTerms.filter((term) => excerptTerms.has(term));
  const assertionTermCount = assertionTerms.length;
  const matchedTermCount = matchedTerms.length;
  const coverage =
    assertionTermCount === 0 ? null : Number((matchedTermCount / assertionTermCount).toFixed(4));
  const assertionDirectionData = economicDirectionSequences(assertion);
  const excerptDirectionData = economicDirectionSequences(excerpt);
  const assertionDirections = assertionDirectionData.directions;
  const excerptDirections = excerptDirectionData.directions;
  const assertionSignedDirections = assertionDirectionData.signedDirections;
  const excerptSignedDirections = excerptDirectionData.signedDirections;
  const polarityAligned =
    assertionDirections.length > 0 && excerptDirections.length > 0
      ? containsOrderedSequence(excerptSignedDirections, assertionSignedDirections) &&
        assertionSignedDirections.every(
          (direction) => !excerptSignedDirections.includes(oppositeSignedDirection(direction)),
        )
      : hasSemanticNegation(assertion) === hasSemanticNegation(excerpt);
  const directionAligned =
    assertionDirections.length === 0 ||
    excerptDirections.length === 0 ||
    containsOrderedSequence(excerptDirections, assertionDirections);
  return {
    status:
      assertionTermCount === 0
        ? 'UNAVAILABLE'
        : matchedTermCount === 0
          ? 'UNSUPPORTED'
          : !polarityAligned ||
              !directionAligned ||
              matchedTermCount < 2 ||
              (coverage ?? 0) < minimumSupportedLexicalCoverage
            ? 'LIMITED'
            : 'SUPPORTED',
    polarityAligned,
    directionAligned,
    assertionDirections: assertionDirections.slice(0, 20),
    excerptDirections: excerptDirections.slice(0, 20),
    assertionSignedDirections: assertionSignedDirections.slice(0, 20),
    excerptSignedDirections: excerptSignedDirections.slice(0, 20),
    assertionTermCount,
    matchedTermCount,
    matchedTerms: matchedTerms.slice(0, 20),
    coverage,
  };
}

export function calibrateConfidenceForGrounding(
  confidenceLevel: string,
  confidenceScore: number | null,
  lexicalGrounding: LexicalGrounding,
): { confidenceLevel: string; confidenceScore: number | null; adjusted: boolean } {
  if (lexicalGrounding.status === 'SUPPORTED') {
    return { confidenceLevel, confidenceScore, adjusted: false };
  }
  return {
    confidenceLevel: 'LOW',
    confidenceScore: confidenceScore === null ? null : Math.min(confidenceScore, 0.49),
    adjusted: confidenceLevel !== 'LOW' || (confidenceScore !== null && confidenceScore > 0.49),
  };
}

/** Grounds claim details against the exact excerpt retained as evidence. */
export function groundClaimToExcerpt(
  assertion: string,
  entityMentions: readonly string[],
  excerpt: string,
): ClaimEvidenceGrounding {
  return {
    entityMentions: groundedEntities(entityMentions, excerpt),
    unsupportedNumbers: ungroundedNumbers(assertion, excerpt),
    lexicalGrounding: assessLexicalGrounding(assertion, excerpt),
  };
}
