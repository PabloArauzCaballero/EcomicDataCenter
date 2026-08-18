import { comparable } from './evidence-quality';

export interface CorroboratingEvidence {
  sourceArtifactId: string;
  excerpt: string;
  locator: string;
  retrievedAt: string;
}

export interface CorroboratingSource {
  title: string;
  publisher: string;
  url: string;
  discoveredUrl: string;
  sha256: string;
  storageUri: string;
  publishedAt: string | null;
}

export interface CorroboratedClaim {
  claimType: string;
  assertion: string;
  confidenceLevel: string;
  entityMentions: string[];
  evidence: CorroboratingEvidence[];
  eventDate?: string;
  publishedAt?: string;
  confidenceScore?: number;
  impactLevel?: string;
  timeHorizon?: string;
}

export interface CorroboratedClaimItem {
  rawPayload: CorroboratingSource & { sources: CorroboratingSource[] };
  claim: CorroboratedClaim;
}

const confidenceRank = new Map([
  ['VERY_LOW', 0],
  ['LOW', 1],
  ['MEDIUM', 2],
  ['HIGH', 3],
  ['VERY_HIGH', 4],
]);
const impactRank = new Map([
  ['NEGLIGIBLE', 0],
  ['LOW', 1],
  ['MEDIUM', 2],
  ['HIGH', 3],
  ['CRITICAL', 4],
]);

export function claimCorroborationKey(claim: CorroboratedClaim): string {
  return [
    claim.claimType,
    comparable(claim.assertion),
    claim.eventDate ?? '',
    claim.timeHorizon ?? '',
  ].join('\n');
}

function mergeClaim(target: CorroboratedClaim, incoming: CorroboratedClaim): void {
  const evidenceKeys = new Set(
    target.evidence.map((piece) => `${piece.sourceArtifactId}\n${comparable(piece.excerpt)}`),
  );
  for (const piece of incoming.evidence) {
    const key = `${piece.sourceArtifactId}\n${comparable(piece.excerpt)}`;
    if (!evidenceKeys.has(key)) target.evidence.push(piece);
  }
  target.entityMentions = [
    ...new Set([...target.entityMentions, ...incoming.entityMentions]),
  ].slice(0, 25);
  if (
    (confidenceRank.get(incoming.confidenceLevel) ?? 0) <
    (confidenceRank.get(target.confidenceLevel) ?? 0)
  ) {
    target.confidenceLevel = incoming.confidenceLevel;
  }
  if (target.confidenceScore === undefined || incoming.confidenceScore === undefined) {
    delete target.confidenceScore;
  } else {
    target.confidenceScore = Math.min(target.confidenceScore, incoming.confidenceScore);
  }
  if (
    incoming.impactLevel &&
    (!target.impactLevel ||
      (impactRank.get(incoming.impactLevel) ?? 0) > (impactRank.get(target.impactLevel) ?? 0))
  ) {
    target.impactLevel = incoming.impactLevel;
  }
  if (target.publishedAt !== incoming.publishedAt) delete target.publishedAt;
}

export function consolidateCorroboratingClaims(
  items: readonly CorroboratedClaimItem[],
): CorroboratedClaimItem[] {
  const result: CorroboratedClaimItem[] = [];
  const byKey = new Map<string, CorroboratedClaimItem>();
  for (const item of items) {
    const key = claimCorroborationKey(item.claim);
    const existing = byKey.get(key);
    if (!existing || existing.claim.evidence.length + item.claim.evidence.length > 10) {
      const copy = {
        rawPayload: { ...item.rawPayload, sources: [...item.rawPayload.sources] },
        claim: {
          ...item.claim,
          entityMentions: [...item.claim.entityMentions],
          evidence: [...item.claim.evidence],
        },
      };
      result.push(copy);
      if (!existing) byKey.set(key, copy);
      continue;
    }
    mergeClaim(existing.claim, item.claim);
    const sourceHashes = new Set(existing.rawPayload.sources.map(({ sha256 }) => sha256));
    for (const source of item.rawPayload.sources) {
      if (!sourceHashes.has(source.sha256)) existing.rawPayload.sources.push(source);
    }
  }
  return result;
}
