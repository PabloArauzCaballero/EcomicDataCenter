import { randomUUID } from 'node:crypto';
import type { Transaction } from 'sequelize';
import {
  ClaimEvidenceModel,
  FactClaimModel,
  RawObservationModel,
  SourceArtifactModel,
} from '../../models';
import { claimContentHash } from '../../../common/intelligence/claim-normalizer';
import { textHash } from '../../../common/hashing/canonical-hash';
import {
  exogenousFactorsSchema,
  factorPeriodStart,
  type ExogenousFactorPoint,
  type ExogenousFactorSeries,
} from '../schemas/exogenous-factors.schema';
import { factorAssertion, factorPayload, factorRevisionHash } from './exogenous-factor-payload';
import { reconcileHistoryRun } from './boot-seed.history-provenance';
import { roadHashesAlreadyHeld } from './boot-seed.bolivia-road-network';
import { readSeed } from './seed.utils';

const FILE = 'boot/exogenous-factors.json';
const CHUNK = 500;

interface PendingFactor {
  series: ExogenousFactorSeries;
  point: ExogenousFactorPoint;
  payload: Record<string, unknown>;
  hash: string;
}

async function artifactFor(
  sourceId: string,
  entry: PendingFactor,
  transaction: Transaction,
): Promise<string> {
  const existing = await SourceArtifactModel.findOne({
    where: { sha256: entry.point.upstreamSha256 },
    transaction,
  });
  if (existing) return existing.sourceArtifactId;
  const sourceArtifactId = randomUUID();
  const pathname = new URL(entry.point.sourceUrl).pathname.toLowerCase();
  const format = pathname.endsWith('.csv')
    ? ['CSV', 'text/csv']
    : pathname.endsWith('.txt')
      ? ['TEXT', 'text/plain']
      : ['JSON', 'application/json'];
  await SourceArtifactModel.create(
    {
      sourceArtifactId,
      sourceId,
      artifactType: format[0]!,
      mimeType: format[1]!,
      originalUri: entry.point.sourceUrl,
      storageUri: entry.point.sourceUrl,
      sha256: entry.point.upstreamSha256,
      publicationDate: entry.point.publishedAt?.slice(0, 10) ?? null,
      retrievedAt: new Date(entry.point.retrievedAt),
      metadataJson: {
        publisher: entry.series.publisher,
        dataset: FILE,
        retrievalStrategy: 'VERSIONED_FACTOR_SNAPSHOT_V1',
      },
    },
    { transaction },
  );
  return sourceArtifactId;
}

async function writeFactors(
  entries: readonly PendingFactor[],
  sourceArtifactId: string,
  agentRunId: string,
  transaction: Transaction,
): Promise<void> {
  const observations = await RawObservationModel.bulkCreate(
    entries.map((entry) => ({
      agentRunId,
      sourceArtifactId,
      payloadJson: entry.payload,
      payloadHash: entry.hash,
      receivedAt: new Date(entry.point.retrievedAt),
      processingStatus: 'NORMALIZED',
      retryCount: 0,
    })),
    { transaction, returning: true },
  );
  const claims = entries.map((entry, index) => {
    const assertion = factorAssertion(entry.series, entry.point);
    const eventDate = factorPeriodStart(entry.point.period, entry.series.frequency)!;
    const claimType =
      entry.series.observationStatus === 'FORECAST'
        ? 'FORECAST'
        : entry.series.observationStatus === 'ESTIMATED'
          ? 'ESTIMATE'
          : 'INDICATOR_READING';
    const rawObservationId = observations[index]?.rawObservationId;
    if (!rawObservationId) throw new Error(`Missing inserted observation for ${entry.series.code}`);
    return {
      factClaimId: randomUUID(),
      agentRunId,
      rawObservationId,
      claimType,
      assertion,
      eventDate,
      publishedAt: entry.point.publishedAt === null ? null : new Date(entry.point.publishedAt),
      confidenceLevel: 'MEDIUM',
      confidenceScore: null,
      status:
        entry.series.licenseStatus === 'PUBLIC_REUSE_ALLOWED' ? 'PUBLISHED' : 'PENDING_REVIEW',
      contentHash: claimContentHash({ claimType, assertion, eventDate }),
      createdAt: new Date(),
    };
  });
  await FactClaimModel.bulkCreate(claims, { transaction });
  await ClaimEvidenceModel.bulkCreate(
    claims.map((claim, index) => {
      const entry = entries[index]!;
      return {
        factClaimId: claim.factClaimId,
        sourceArtifactId,
        excerpt: entry.point.excerpt,
        excerptHash: textHash(entry.point.excerpt),
        locator: entry.point.sourceUrl,
        retrievedAt: new Date(entry.point.retrievedAt),
      };
    }),
    { transaction },
  );
}

/** Append only. No measures array: factors never leak into the general daily/annual snapshots. */
export async function reconcileExogenousFactors(
  sourceId: string,
  transaction: Transaction,
): Promise<void> {
  const seed = await readSeed(FILE, exogenousFactorsSchema);
  const database = RawObservationModel.sequelize;
  if (!database) throw new Error('Factor seeding requires initialized database models');
  // Serialize this package across boot/admin invocations before checking idempotence.
  await database.query("SELECT pg_advisory_xact_lock(hashtext('exogenous-factors-seed-v1'))", {
    transaction,
  });
  const agentRunId = await reconcileHistoryRun('EXOGENOUS_PRICES', transaction);
  const entries = seed.series.flatMap((series) =>
    series.points.map((point) => ({
      series,
      point,
      payload: factorPayload(series, point),
      hash: factorRevisionHash(series, point),
    })),
  );
  const held = await roadHashesAlreadyHeld(
    entries.map((entry) => entry.hash),
    transaction,
  );
  const artifacts = new Map<string, PendingFactor[]>();
  for (const entry of entries) {
    if (held.has(entry.hash)) continue;
    held.add(entry.hash);
    const group = artifacts.get(entry.point.upstreamSha256) ?? [];
    group.push(entry);
    artifacts.set(entry.point.upstreamSha256, group);
  }
  for (const entriesForArtifact of artifacts.values()) {
    const sourceArtifactId = await artifactFor(sourceId, entriesForArtifact[0]!, transaction);
    for (let start = 0; start < entriesForArtifact.length; start += CHUNK) {
      await writeFactors(
        entriesForArtifact.slice(start, start + CHUNK),
        sourceArtifactId,
        agentRunId,
        transaction,
      );
    }
  }
}
