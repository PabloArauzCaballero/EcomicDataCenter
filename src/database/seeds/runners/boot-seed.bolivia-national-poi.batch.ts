import { randomUUID } from 'node:crypto';
import type { Transaction } from 'sequelize';
import { ClaimEvidenceModel, FactClaimModel, RawObservationModel } from '../../models';
import { claimContentHash } from '../../../common/intelligence/claim-normalizer';
import { textHash } from '../../../common/hashing/canonical-hash';
import type { NationalPoiPlace } from '../schemas/bolivia-national-poi.schema';

/**
 * One block of national places, written as observation, claim and evidence.
 *
 * Split out of the loader because the loader was three lines over the file
 * limit, and this is the part that reads on its own: given a block of places
 * that the corpus does not already hold, it writes the three rows each of them
 * needs, in the order the foreign keys require.
 */

/** What is true of every place in a block, gathered once instead of per row. */
export interface NationalPoiBatchContext {
  agentRunId: string;
  sourceArtifactId: string;
  receivedAt: Date;
  eventDate: string;
  locator: string;
  transaction: Transaction;
}

/** A place the database does not hold yet, with the payload it will be stored as. */
export interface PendingNationalPlace {
  place: NationalPoiPlace;
  payload: Record<string, unknown>;
  hash: string;
}

/**
 * What the register asserts about a place, in one sentence.
 *
 * It says where the place is and what it is, and it stops there. It does not
 * say the place is licensed, open, or still in business: the delivery states
 * plainly that none of those were checked in the field, and an assertion is
 * read by people who will not go and look at the column it came from.
 *
 * A place with no town is located by its coordinates rather than by a town the
 * corpus does not know — more than half of these places have none.
 */
export function assertionFor(place: NationalPoiPlace): string {
  const where = place.locality ?? `${place.latitude.toFixed(5)}, ${place.longitude.toFixed(5)}`;
  return `${place.name} figura en ${where} como ${place.entityFamily}.`;
}

export async function loadNationalPlaceBatch(
  batch: readonly PendingNationalPlace[],
  context: NationalPoiBatchContext,
): Promise<void> {
  const { transaction } = context;
  const observations = await RawObservationModel.bulkCreate(
    batch.map((entry) => ({
      agentRunId: context.agentRunId,
      sourceArtifactId: context.sourceArtifactId,
      payloadJson: entry.payload,
      payloadHash: entry.hash,
      receivedAt: context.receivedAt,
      processingStatus: 'NORMALIZED' as const,
      retryCount: 0,
    })),
    { transaction, returning: true },
  );

  const claims = batch.map((entry, index) => {
    const assertion = assertionFor(entry.place);
    return {
      factClaimId: randomUUID(),
      agentRunId: context.agentRunId,
      rawObservationId: observations[index]?.rawObservationId ?? '',
      claimType: 'FACT' as const,
      assertion,
      eventDate: context.eventDate,
      confidenceLevel: 'MEDIUM' as const,
      confidenceScore: (entry.place.confidence ?? 0.6).toFixed(4),
      impactLevel: 'LOW' as const,
      timeHorizon: 'STRUCTURAL' as const,
      status: 'PUBLISHED' as const,
      contentHash: claimContentHash({
        claimType: 'FACT',
        assertion,
        eventDate: context.eventDate,
      }),
      createdAt: new Date(),
    };
  });
  await FactClaimModel.bulkCreate(claims, { transaction });

  await ClaimEvidenceModel.bulkCreate(
    claims.map((claim) => ({
      factClaimId: claim.factClaimId,
      sourceArtifactId: context.sourceArtifactId,
      // The publisher serves a row, not a sentence. The quotation is that row
      // stated plainly, which is exactly what was received and nothing more.
      excerpt: claim.assertion,
      excerptHash: textHash(claim.assertion),
      locator: context.locator,
      retrievedAt: context.receivedAt,
    })),
    { transaction },
  );
}
