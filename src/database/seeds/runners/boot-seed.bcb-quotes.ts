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
import { bcbQuotesSchema, type BcbQuote } from '../schemas/bcb-quotes.schema';
import { readSeed } from './seed.utils';

/**
 * Loads the central bank's own daily quotations.
 *
 * These are the highest tier of evidence the observatory holds: the publisher
 * is the institution that defines the figure, and the page states the date the
 * table is in force. They land in the same reading tables as every other daily
 * series so a chart can put the UFV beside the exchange rate without either
 * borrowing the other's provenance.
 *
 * Idempotent on the payload digest, like every loader beside it. The digest of
 * the page is deliberately absent from that payload: the bank's front page
 * changes through the day for reasons that have nothing to do with the
 * quotation, so including it would make the same figure land twice.
 */

const AGENT_CODE = 'BCB_QUOTES';

async function reconcileArtifact(
  quote: BcbQuote,
  sourceId: string,
  cache: Map<string, string>,
  transaction: Transaction,
): Promise<string> {
  const cached = cache.get(quote.documentSha256);
  if (cached) return cached;

  const existing = await SourceArtifactModel.findOne({
    where: { sha256: quote.documentSha256 },
    transaction,
  });
  if (existing) {
    cache.set(quote.documentSha256, existing.sourceArtifactId);
    return existing.sourceArtifactId;
  }

  const sourceArtifactId = randomUUID();
  await SourceArtifactModel.create(
    {
      sourceArtifactId,
      sourceId,
      artifactType: 'HTML',
      originalUri: quote.sourceUrl,
      storageUri: quote.sourceUrl,
      mimeType: 'text/html',
      sha256: quote.documentSha256,
      publicationDate: quote.eventDate,
      retrievedAt: new Date(quote.retrievedAt),
      metadataJson: {
        publisher: 'BANCO CENTRAL DE BOLIVIA',
        retrievalStrategy: 'VERSIONED_SNAPSHOT_V1',
        publicationDateVerification: 'STATED_IN_DOCUMENT',
      },
    },
    { transaction },
  );
  cache.set(quote.documentSha256, sourceArtifactId);
  return sourceArtifactId;
}

/** Payload for one quotation, shaped exactly like the collector's. */
function dailyPayload(quote: BcbQuote): Record<string, unknown> {
  return {
    recordType: 'DAILY_INDICATOR',
    dataCategory: quote.indicatorCode === 'UFV_BOB' ? 'UFV' : 'MACRO_DAILY',
    eventDate: quote.eventDate,
    aggregation: 'POINT_IN_TIME',
    measures: [
      {
        indicatorCode: quote.indicatorCode,
        indicatorName: quote.indicatorName,
        value: quote.value,
        // The figure as the bank writes it, so the evidence literally contains
        // what the record claims. The normalised form above is for arithmetic;
        // this one is what a reader checks against the page.
        statedValue: quote.statedValue,
        unit: quote.unit,
      },
    ],
    publisher: 'BANCO CENTRAL DE BOLIVIA',
    publisherVerified: true,
    publicationInDocument: true,
    url: quote.sourceUrl,
    storageUri: quote.sourceUrl,
  };
}

export async function reconcileBcbQuotes(
  sourceId: string,
  transaction: Transaction,
): Promise<void> {
  const seed = await readSeed('boot/bcb-quotes.json', bcbQuotesSchema);
  const agentRunId = await reconcileHistoryRun(AGENT_CODE, transaction);

  const entries = seed.quotes.map((quote) => ({ quote, payload: dailyPayload(quote) }));
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
    const sourceArtifactId = await reconcileArtifact(quote, sourceId, artifacts, transaction);

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

    const assertion = `${quote.indicatorName} se cotizó en ${quote.value} ${quote.unit} el ${quote.eventDate}, según el Banco Central de Bolivia.`;
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
