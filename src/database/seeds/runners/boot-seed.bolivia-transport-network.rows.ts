import { randomUUID } from 'node:crypto';
import type { Transaction } from 'sequelize';
import { ClaimEvidenceModel, FactClaimModel, RawObservationModel } from '../../models';
import { rawPayloadHash, claimContentHash } from '../../../common/intelligence/claim-normalizer';
import { textHash } from '../../../common/hashing/canonical-hash';
import { roadHashesAlreadyHeld, ROAD_NETWORK_CHUNK } from './boot-seed.bolivia-road-network';

/**
 * The one writer the rail, river and rail-traffic loaders share: a row the
 * corpus does not hold becomes one observation, one claim and one piece of
 * evidence, all citing the artifact `artifactFor` returns — created only when
 * there is something new to cite, so a replay adds nothing, not even that.
 */

export interface TransportRow {
  payload: Record<string, unknown>;
  assertion: string;
}

/** Writes the rows the corpus does not hold yet, each citing `sourceArtifactId`. */
export async function writeTransportRows(
  rows: readonly TransportRow[],
  context: {
    agentRunId: string;
    eventDate: string;
    receivedAt: Date;
    locator: string;
    transaction: Transaction;
  },
  artifactFor: () => Promise<string>,
): Promise<number> {
  const hashes = rows.map((row) => rawPayloadHash(row.payload));
  const held = await roadHashesAlreadyHeld(hashes, context.transaction);
  const pending = rows
    .map((row, index) => ({ ...row, hash: hashes[index] ?? '' }))
    .filter((row) => row.hash !== '' && !held.has(row.hash));
  if (pending.length === 0) return 0;

  const sourceArtifactId = await artifactFor();
  const { agentRunId, eventDate, receivedAt, locator, transaction } = context;
  for (let start = 0; start < pending.length; start += ROAD_NETWORK_CHUNK) {
    const block = pending.slice(start, start + ROAD_NETWORK_CHUNK);
    const observations = await RawObservationModel.bulkCreate(
      block.map((row) => ({
        agentRunId,
        sourceArtifactId,
        payloadJson: row.payload,
        payloadHash: row.hash,
        receivedAt,
        processingStatus: 'NORMALIZED' as const,
        retryCount: 0,
      })),
      { transaction, returning: true },
    );
    const claims = block.map((row, index) => ({
      factClaimId: randomUUID(),
      agentRunId,
      rawObservationId: observations[index]?.rawObservationId ?? '',
      claimType: 'FACT' as const,
      assertion: row.assertion,
      eventDate,
      confidenceLevel: 'MEDIUM' as const,
      confidenceScore: '0.6000',
      impactLevel: 'LOW' as const,
      timeHorizon: 'STRUCTURAL' as const,
      status: 'PUBLISHED' as const,
      contentHash: claimContentHash({ claimType: 'FACT', assertion: row.assertion, eventDate }),
      createdAt: new Date(),
    }));
    await FactClaimModel.bulkCreate(claims, { transaction });
    await ClaimEvidenceModel.bulkCreate(
      claims.map((claim) => ({
        factClaimId: claim.factClaimId,
        sourceArtifactId,
        excerpt: claim.assertion,
        excerptHash: textHash(claim.assertion),
        locator,
        retrievedAt: receivedAt,
      })),
      { transaction },
    );
  }
  return pending.length;
}
