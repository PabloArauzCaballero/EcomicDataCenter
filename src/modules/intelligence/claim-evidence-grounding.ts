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

type EconomicDirection = 'UP' | 'DOWN' | 'STABLE';

function economicDirections(value: string): Set<EconomicDirection> {
  const normalized = value.normalize('NFKD').replace(/\p{M}/gu, '').toLocaleLowerCase('es');
  const directions = new Set<EconomicDirection>();
  if (
    /\b(?:aument\w*|increment\w*|subi\w*|crec\w*|alza|ascend\w*|increas\w*|rise|rose|risen|grow|grew|grown|higher)\b/u.test(
      normalized,
    )
  ) {
    directions.add('UP');
  }
  if (
    /\b(?:dismin\w*|reduc\w*|baj\w*|cai\w*|cay\w*|descend\w*|contraj\w*|decreas\w*|declin\w*|fall|fell|fallen|drop\w*|lower)\b/u.test(
      normalized,
    )
  ) {
    directions.add('DOWN');
  }
  if (/\b(?:estable|estables|mantuvo|mantuvieron|unchanged|steady|flat)\b/u.test(normalized)) {
    directions.add('STABLE');
  }
  return directions;
}

function hasAlignedDirection(assertion: string, excerpt: string): boolean {
  const assertionDirections = economicDirections(assertion);
  const excerptDirections = economicDirections(excerpt);
  return (
    assertionDirections.size === 0 ||
    excerptDirections.size === 0 ||
    [...assertionDirections].some((direction) => excerptDirections.has(direction))
  );
}

export function assessLexicalGrounding(assertion: string, excerpt: string): LexicalGrounding {
  const assertionTerms = lexicalTerms(assertion);
  const excerptTerms = new Set(lexicalTerms(excerpt));
  const matchedTerms = assertionTerms.filter((term) => excerptTerms.has(term));
  const assertionTermCount = assertionTerms.length;
  const matchedTermCount = matchedTerms.length;
  const coverage =
    assertionTermCount === 0 ? null : Number((matchedTermCount / assertionTermCount).toFixed(4));
  const polarityAligned = hasSemanticNegation(assertion) === hasSemanticNegation(excerpt);
  const directionAligned = hasAlignedDirection(assertion, excerpt);
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
