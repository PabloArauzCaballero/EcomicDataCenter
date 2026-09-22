import { createHash, randomUUID } from 'node:crypto';
import { Op, type Transaction } from 'sequelize';
import {
  ClaimEvidenceModel,
  FactClaimModel,
  RawObservationModel,
  SourceArtifactModel,
} from '../../models';
import { reconcileHistoryRun } from './boot-seed.history-provenance';
import { claimContentHash, rawPayloadHash } from '../../../common/intelligence/claim-normalizer';
import { bbvYieldsSchema, type BbvYield } from '../schemas/bbv-yields.schema';
import { readSeed } from './seed.utils';

/**
 * Loads the exchange's closing yield curve.
 *
 * The payload deliberately carries **no `measures` array**. That key is what
 * `economic_indicator_reading` keys on, and a yield admitted there would be
 * grouped with every other yield of its day into a single median — one number
 * standing for the Treasury at three years and a bank deposit at thirty days at
 * once, which nobody quoted and nobody could act on. The curve gets its own
 * read model instead, where the five things that make a yield mean something
 * stay attached to it.
 *
 * Idempotent on the payload digest, like every loader beside it.
 */

const AGENT_CODE = 'BBV_YIELD_CURVE';
const VENUE = 'BBV';

async function reconcileArtifact(
  documentSha256: string,
  sample: BbvYield,
  sourceId: string,
  cache: Map<string, string>,
  transaction: Transaction,
): Promise<string> {
  const cached = cache.get(documentSha256);
  if (cached) return cached;

  const existing = await SourceArtifactModel.findOne({
    where: { sha256: documentSha256 },
    transaction,
  });
  if (existing) {
    cache.set(documentSha256, existing.sourceArtifactId);
    return existing.sourceArtifactId;
  }

  const sourceArtifactId = randomUUID();
  await SourceArtifactModel.create(
    {
      sourceArtifactId,
      sourceId,
      artifactType: 'HTML',
      originalUri: sample.sourceUrl,
      storageUri: sample.sourceUrl,
      mimeType: 'text/html',
      sha256: documentSha256,
      publicationDate: sample.eventDate,
      retrievedAt: new Date(sample.retrievedAt),
      metadataJson: {
        publisher: 'BOLSA BOLIVIANA DE VALORES',
        venue: VENUE,
        session: sample.eventDate,
        retrievalStrategy: 'VERSIONED_SNAPSHOT_V1',
        publicationDateVerification: 'STATED_IN_DOCUMENT',
      },
    },
    { transaction },
  );
  cache.set(documentSha256, sourceArtifactId);
  return sourceArtifactId;
}

/** Payload for one point of the curve, with every dimension that gives it meaning. */
function curvePayload(quote: BbvYield): Record<string, unknown> {
  return {
    recordType: 'YIELD_CURVE_POINT',
    dataCategory: 'SOVEREIGN_BONDS',
    eventDate: quote.eventDate,
    venue: VENUE,
    currency: quote.currency,
    operation: quote.operation,
    segment: quote.segment,
    instrument: quote.instrument,
    issuer: quote.issuer,
    tenorBucket: quote.tenorBucket,
    yieldPercent: quote.value,
    // The figure as the exchange writes it, so the evidence literally contains
    // what the record claims.
    statedValue: quote.statedValue,
    unit: 'PCT_ANNUAL',
    publisher: 'BOLSA BOLIVIANA DE VALORES',
    publisherVerified: true,
    publicationInDocument: true,
    url: quote.sourceUrl,
    storageUri: quote.sourceUrl,
  };
}

/** How the exchange's codes read in prose, for the assertion an auditor reads. */
function describe(quote: BbvYield): string {
  const issuer = quote.issuer ? ` del emisor ${quote.issuer}` : ' agregado del mercado';
  return (
    `Rendimiento ${quote.operation.toLowerCase()} de ${quote.instrument}${issuer} ` +
    `en ${quote.currency} a ${quote.tenorBucket} días: ${quote.statedValue} anual ` +
    `en la sesión del ${quote.eventDate} de la Bolsa Boliviana de Valores.`
  );
}

export async function reconcileBbvYields(
  sourceId: string,
  transaction: Transaction,
): Promise<void> {
  const seed = await readSeed('boot/bbv-yields.json', bbvYieldsSchema);
  const agentRunId = await reconcileHistoryRun(AGENT_CODE, transaction);

  const entries = seed.yields.map((quote) => ({ quote, payload: curvePayload(quote) }));
  const hashes = entries.map((entry) => rawPayloadHash(entry.payload));

  const present = new Set<string>();
  for (let start = 0; start < hashes.length; start += 500) {
    const rows = await RawObservationModel.findAll({
      attributes: ['payloadHash'],
      where: { payloadHash: { [Op.in]: hashes.slice(start, start + 500) } },
      transaction,
    });
    for (const row of rows) present.add(row.payloadHash);
  }

  const artifacts = new Map<string, string>();
  for (const [index, entry] of entries.entries()) {
    const payloadHash = hashes[index];
    if (!payloadHash || present.has(payloadHash)) continue;

    const { quote } = entry;
    const sourceArtifactId = await reconcileArtifact(
      quote.documentSha256,
      quote,
      sourceId,
      artifacts,
      transaction,
    );

    const observation = await RawObservationModel.create(
      {
        agentRunId,
        sourceArtifactId,
        payloadJson: entry.payload,
        payloadHash,
        receivedAt: new Date(quote.retrievedAt),
        processingStatus: 'NORMALIZED',
        retryCount: 0,
      },
      { transaction },
    );

    const assertion = describe(quote);
    const factClaimId = randomUUID();
    await FactClaimModel.create(
      {
        factClaimId,
        agentRunId,
        rawObservationId: observation.rawObservationId,
        claimType: 'INDICATOR_READING',
        assertion,
        eventDate: quote.eventDate,
        publishedAt: new Date(`${quote.eventDate}T12:00:00-04:00`),
        confidenceLevel: 'HIGH',
        confidenceScore: '0.9500',
        impactLevel: 'MEDIUM',
        timeHorizon: 'SHORT_TERM',
        status: 'PUBLISHED',
        contentHash: claimContentHash({
          claimType: 'INDICATOR_READING',
          assertion,
          eventDate: quote.eventDate,
        }),
        createdAt: new Date(),
      },
      { transaction },
    );

    await ClaimEvidenceModel.create(
      {
        factClaimId,
        sourceArtifactId,
        excerpt: quote.excerpt,
        excerptHash: createHash('sha256').update(quote.excerpt).digest('hex'),
        locator: quote.sourceUrl,
        retrievedAt: new Date(quote.retrievedAt),
      },
      { transaction },
    );
  }
}
