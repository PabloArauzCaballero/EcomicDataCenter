import { randomUUID } from 'node:crypto';
import type { Transaction } from 'sequelize';
import { ClaimEvidenceModel, FactClaimModel, RawObservationModel } from '../../models';
import { rawPayloadHash, claimContentHash } from '../../../common/intelligence/claim-normalizer';
import { textHash } from '../../../common/hashing/canonical-hash';
import { reconcileRoadArtifact, roadHashesAlreadyHeld, ROAD_NETWORK_CHUNK } from './boot-seed.bolivia-road-network';
import { roadLengthsSeedSchema, type RoadLengthPoint } from '../schemas/bolivia-road-network.schema';
import { readSeed } from './seed.utils';

/**
 * The INE's annual length by network and rodadura, split from the section
 * loader for the same reason the national-place batch is: the file that
 * writes both corpora ran over the 300-line ceiling, and this half reads on
 * its own — three source tables flattened into one list of points, each
 * citing its own table as its artifact.
 */

function lengthPayload(dataset: string, point: RoadLengthPoint): Record<string, unknown> {
  return {
    recordType: 'ROAD_LENGTH_READING',
    dataCategory: 'ROAD_LENGTH',
    dataset,
    geography: point.geography,
    network: point.network,
    surface: point.surface,
    period: point.period,
    lengthKm: point.lengthKm,
    preliminary: point.preliminary,
  };
}

export async function loadRoadLengths(
  sourceId: string,
  agentRunId: string,
  transaction: Transaction,
): Promise<void> {
  const seed = await readSeed('boot/bolivia-road-network/road-lengths.json', roadLengthsSeedSchema);
  const payloads = seed.points.map((point) => lengthPayload(seed.dataset, point));
  const hashes = payloads.map((payload) => rawPayloadHash(payload));
  const held = await roadHashesAlreadyHeld(hashes, transaction);

  const pending = seed.points
    .map((point, index) => ({ point, payload: payloads[index], hash: hashes[index] }))
    .filter(
      (entry): entry is { point: RoadLengthPoint; payload: Record<string, unknown>; hash: string } =>
        entry.payload !== undefined && entry.hash !== undefined && !held.has(entry.hash),
    );
  if (pending.length === 0) return;

  // Each point carries its own artifact fields because the three source
  // tables are read into one flat list; the digest is what tells them apart.
  const artifactBySha = new Map<string, string>();
  for (let start = 0; start < pending.length; start += ROAD_NETWORK_CHUNK) {
    const block = pending.slice(start, start + ROAD_NETWORK_CHUNK);
    const withArtifact: { point: RoadLengthPoint; payload: Record<string, unknown>; hash: string; artifactId: string }[] = [];
    for (const entry of block) {
      const cached = artifactBySha.get(entry.point.upstreamSha256);
      const artifactId =
        cached ??
        // eslint-disable-next-line no-await-in-loop -- an artifact must exist before the row that cites it.
        (await reconcileRoadArtifact(sourceId, transaction, {
          sha256: entry.point.upstreamSha256,
          originalUri: entry.point.sourceUrl,
          retrievedAt: entry.point.retrievedAt,
          metadataJson: {
            dataset: seed.dataset,
            publisher: seed.provenance.publisher,
            originator: seed.provenance.originator,
            coverage: seed.provenance.coverage,
            retrievalStrategy: 'VERSIONED_SNAPSHOT_V1',
          },
        }));
      artifactBySha.set(entry.point.upstreamSha256, artifactId);
      withArtifact.push({ ...entry, artifactId });
    }

    const observations = await RawObservationModel.bulkCreate(
      withArtifact.map((entry) => ({
        agentRunId,
        sourceArtifactId: entry.artifactId,
        payloadJson: entry.payload,
        payloadHash: entry.hash,
        receivedAt: new Date(entry.point.retrievedAt),
        processingStatus: 'NORMALIZED' as const,
        retryCount: 0,
      })),
      { transaction, returning: true },
    );
    const claims = withArtifact.map((entry, index) => {
      const eventDate = `${entry.point.period}-12-31`;
      const assertion = `${entry.point.excerpt} (${entry.point.geography}, ${entry.point.network}, ${entry.point.surface})`;
      return {
        factClaimId: randomUUID(),
        agentRunId,
        rawObservationId: observations[index]?.rawObservationId ?? '',
        claimType: 'INDICATOR_READING' as const,
        assertion,
        eventDate,
        confidenceLevel: 'HIGH' as const,
        confidenceScore: '0.9000',
        impactLevel: 'LOW' as const,
        timeHorizon: 'STRUCTURAL' as const,
        status: 'PUBLISHED' as const,
        contentHash: claimContentHash({ claimType: 'INDICATOR_READING', assertion, eventDate }),
        createdAt: new Date(),
      };
    });
    await FactClaimModel.bulkCreate(claims, { transaction });
    await ClaimEvidenceModel.bulkCreate(
      claims.map((claim, index) => ({
        factClaimId: claim.factClaimId,
        sourceArtifactId: withArtifact[index]?.artifactId ?? '',
        excerpt: withArtifact[index]?.point.excerpt ?? claim.assertion,
        excerptHash: textHash(withArtifact[index]?.point.excerpt ?? claim.assertion),
        locator: withArtifact[index]?.point.sourceUrl ?? '',
        retrievedAt: new Date(withArtifact[index]?.point.retrievedAt ?? Date.now()),
      })),
      { transaction },
    );
  }
}
