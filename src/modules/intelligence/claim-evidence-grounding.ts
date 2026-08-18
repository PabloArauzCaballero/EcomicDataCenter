import { groundedEntities } from './evidence-quality';
import { ungroundedNumbers } from './quantitative-grounding';

export interface ClaimEvidenceGrounding {
  entityMentions: string[];
  unsupportedNumbers: string[];
  lexicalGrounding: LexicalGrounding;
}

export interface LexicalGrounding {
  status: 'SUPPORTED' | 'LIMITED' | 'UNSUPPORTED' | 'UNAVAILABLE';
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

function lexicalTerms(value: string): string[] {
  const normalized = value.normalize('NFKD').replace(/\p{M}/gu, '').toLocaleLowerCase('es');
  const terms = normalized.match(/\p{L}[\p{L}\p{N}]*/gu) ?? [];
  return [...new Set(terms.filter((term) => term.length >= 3 && !stopWords.has(term)))];
}

export function assessLexicalGrounding(assertion: string, excerpt: string): LexicalGrounding {
  const assertionTerms = lexicalTerms(assertion);
  const excerptTerms = new Set(lexicalTerms(excerpt));
  const matchedTerms = assertionTerms.filter((term) => excerptTerms.has(term));
  const assertionTermCount = assertionTerms.length;
  const matchedTermCount = matchedTerms.length;
  return {
    status:
      assertionTermCount === 0
        ? 'UNAVAILABLE'
        : matchedTermCount === 0
          ? 'UNSUPPORTED'
          : matchedTermCount === 1
            ? 'LIMITED'
            : 'SUPPORTED',
    assertionTermCount,
    matchedTermCount,
    matchedTerms: matchedTerms.slice(0, 20),
    coverage:
      assertionTermCount === 0 ? null : Number((matchedTermCount / assertionTermCount).toFixed(4)),
  };
}

export function calibrateConfidenceForGrounding(
  confidenceLevel: string,
  confidenceScore: number | null,
  lexicalGrounding: LexicalGrounding,
): { confidenceLevel: string; confidenceScore: number | null; adjusted: boolean } {
  if (lexicalGrounding.status !== 'UNSUPPORTED') {
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
