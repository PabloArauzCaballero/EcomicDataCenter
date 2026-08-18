import { groundedEntities } from './evidence-quality';
import { ungroundedNumbers } from './quantitative-grounding';

export interface ClaimEvidenceGrounding {
  entityMentions: string[];
  unsupportedNumbers: string[];
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
  };
}
