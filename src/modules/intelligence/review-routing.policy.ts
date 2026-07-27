import { findInjectionMarkers } from './untrusted-content';

/** Claim shape the policy needs, independent of transport and persistence. */
export interface RoutableClaim {
  readonly claimType: string;
  readonly assertion: string;
  readonly confidenceLevel: string;
  readonly impactLevel?: string | undefined;
  readonly evidenceExcerpts: readonly string[];
}

export type ClaimDisposition = 'PUBLISH' | 'REVIEW' | 'QUARANTINE';

export interface RoutingDecision {
  readonly disposition: ClaimDisposition;
  readonly reason: 'CRITICAL_CLAIM' | 'LOW_CONFIDENCE' | 'AI_INFERENCE' | 'MANUAL_REQUEST';
  readonly explanation: string;
  readonly injectionMarkers: readonly string[];
}

/**
 * Claim types that state something as established and therefore may publish
 * automatically when confidence and impact are ordinary.
 */
const AUTO_PUBLISHABLE = new Set(['FACT', 'INDICATOR_READING']);

/** Claim types that are an interpretation and must carry a human decision. */
const ALWAYS_REVIEWED = new Set([
  'AI_INFERENCE',
  'FORECAST',
  'OPINION',
  'RECOMMENDATION',
  'RISK',
  'THREAT',
  'OPPORTUNITY',
  'TREND',
  'ESTIMATE',
]);

const LOW_CONFIDENCE = new Set(['VERY_LOW', 'LOW']);
const CRITICAL_IMPACT = new Set(['CRITICAL', 'HIGH']);

/**
 * Decides whether a claim may be published without a person.
 *
 * The rule that matters institutionally: an inference produced by a model is
 * never published as an established fact, and anything with critical impact is
 * seen by a human before it can inform a policy decision.
 */
export function routeClaim(claim: RoutableClaim): RoutingDecision {
  const injectionMarkers = [
    ...findInjectionMarkers(claim.assertion),
    ...claim.evidenceExcerpts.flatMap((excerpt) => findInjectionMarkers(excerpt)),
  ];
  const uniqueMarkers = [...new Set(injectionMarkers)];

  if (uniqueMarkers.length > 0) {
    return {
      disposition: 'QUARANTINE',
      reason: 'MANUAL_REQUEST',
      explanation: 'The submitted content contains prompt-injection phrasing',
      injectionMarkers: uniqueMarkers,
    };
  }
  if (ALWAYS_REVIEWED.has(claim.claimType)) {
    return {
      disposition: 'REVIEW',
      reason: 'AI_INFERENCE',
      explanation: `${claim.claimType} is an interpretation and cannot be published as a fact`,
      injectionMarkers: [],
    };
  }
  if (LOW_CONFIDENCE.has(claim.confidenceLevel)) {
    return {
      disposition: 'REVIEW',
      reason: 'LOW_CONFIDENCE',
      explanation: `Confidence ${claim.confidenceLevel} is below the automatic publication threshold`,
      injectionMarkers: [],
    };
  }
  if (claim.impactLevel && CRITICAL_IMPACT.has(claim.impactLevel)) {
    return {
      disposition: 'REVIEW',
      reason: 'CRITICAL_CLAIM',
      explanation: `Impact ${claim.impactLevel} requires human approval before publication`,
      injectionMarkers: [],
    };
  }
  if (!AUTO_PUBLISHABLE.has(claim.claimType)) {
    return {
      disposition: 'REVIEW',
      reason: 'MANUAL_REQUEST',
      explanation: `${claim.claimType} has no automatic publication rule`,
      injectionMarkers: [],
    };
  }
  return {
    disposition: 'PUBLISH',
    reason: 'MANUAL_REQUEST',
    explanation: 'Verifiable claim with sufficient confidence and ordinary impact',
    injectionMarkers: [],
  };
}
