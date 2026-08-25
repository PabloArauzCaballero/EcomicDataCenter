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
import {
  pressCoverageSchema,
  type PressArticle,
  type PressCoverage,
} from '../schemas/press-coverage.schema';
import { readSeed } from './seed.utils';

/**
 * Loads press coverage of the Bolivian economy.
 *
 * The assertion each article produces is deliberately narrow: that this outlet
 * published this headline on this date. That is what the evidence supports and
 * all of it — whether the reporting is accurate is not something a collector
 * can establish, and writing the headline down as though it were a finding
 * would launder a claim into a record.
 *
 * Confidence is MEDIUM for the same reason. An official table and a newsroom
 * are not interchangeable, and a reader deserves to see which one a line came
 * from rather than to have them averaged into one voice.
 *
 * One artifact per listing rather than per article: a listing is what was
 * fetched and digested, and the articles that arrived in it share its
 * provenance honestly. The article's own address is kept as the locator so a
 * reader can open it; it is not claimed to have been retrieved.
 *
 * Idempotent on the payload digest, like every snapshot beside it.
 */

const AGENT_CODE = 'PRESS_COVERAGE';

async function reconcileListingArtifact(
  coverage: PressCoverage,
  article: PressArticle,
  sourceId: string,
  cache: Map<string, string>,
  transaction: Transaction,
): Promise<string> {
  const cached = cache.get(article.listingSha256);
  if (cached) return cached;

  const existing = await SourceArtifactModel.findOne({
    where: { sha256: article.listingSha256 },
    transaction,
  });
  if (existing) {
    cache.set(article.listingSha256, existing.sourceArtifactId);
    return existing.sourceArtifactId;
  }

  const sourceArtifactId = randomUUID();
  await SourceArtifactModel.create(
    {
      sourceArtifactId,
      sourceId,
      artifactType: article.retrievalMethod === 'SYNDICATED_FEED' ? 'XML' : 'HTML',
      originalUri: article.listingUrl,
      storageUri: article.listingUrl,
      mimeType: article.retrievalMethod === 'SYNDICATED_FEED' ? 'application/rss+xml' : 'text/html',
      sha256: article.listingSha256,
      publicationDate: article.eventDate,
      retrievedAt: new Date(coverage.provenance.retrievedAt),
      metadataJson: {
        publisher: article.outlet,
        domain: article.domain,
        section: article.section,
        retrievalStrategy: 'VERSIONED_SNAPSHOT_V1',
        retrievalMethod: article.retrievalMethod,
      },
    },
    { transaction },
  );
  cache.set(article.listingSha256, sourceArtifactId);
  return sourceArtifactId;
}

/**
 * Payload for one article, shaped like the one the collector submits.
 *
 * The listing's digest is deliberately absent. It identifies the document the
 * article arrived in, not the article, and it changes every time the listing is
 * fetched — so including it would make a re-collection of the same headline
 * hash differently and land as a second record. The digest belongs to the
 * artifact, which already carries it, and the read model reads it from there.
 */
function articlePayload(article: PressArticle): Record<string, unknown> {
  return {
    recordType: 'NEWS',
    dataCategory: 'PRESS_COVERAGE',
    eventDate: article.eventDate,
    frequency: 'EVENT',
    outlet: article.outlet,
    domain: article.domain,
    section: article.section,
    headline: article.headline,
    summary: article.summary,
    statedInstant: article.statedDate,
    // The stamp comes from the listing; the article page was not fetched to
    // confirm it repeats it.
    publicationInDocument: false,
    publisher: article.outlet,
    publisherVerified: true,
    sourceTier: 'PRESS',
    url: article.url,
    listingUrl: article.listingUrl,
    retrievalMethod: article.retrievalMethod,
  };
}

export async function reconcilePressCoverage(
  sourceId: string,
  transaction: Transaction,
): Promise<void> {
  const coverage = await readSeed('boot/press-coverage.json', pressCoverageSchema);
  const agentRunId = await reconcileHistoryRun(AGENT_CODE, transaction);

  const entries = coverage.articles.map((article) => ({
    article,
    payload: articlePayload(article),
  }));
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

    const { article } = entry;
    const sourceArtifactId = await reconcileListingArtifact(
      coverage,
      article,
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
        receivedAt: new Date(coverage.provenance.retrievedAt),
        processingStatus: 'NORMALIZED',
        retryCount: 0,
      },
      { transaction },
    );

    const assertion = `${article.outlet} publicó el ${article.eventDate}: ${article.headline}`;
    const factClaimId = randomUUID();
    await FactClaimModel.create(
      {
        factClaimId,
        agentRunId,
        rawObservationId: observation.rawObservationId,
        claimType: 'FACT',
        assertion,
        eventDate: article.eventDate,
        publishedAt: new Date(article.publishedAt),
        // The outlet and the date are established; what the piece reports is
        // not, and the record says so rather than borrowing authority.
        confidenceLevel: 'MEDIUM',
        confidenceScore: '0.6000',
        impactLevel: 'LOW',
        timeHorizon: 'SHORT_TERM',
        status: 'PUBLISHED',
        contentHash: claimContentHash({
          claimType: 'FACT',
          assertion,
          eventDate: article.eventDate,
        }),
        createdAt: new Date(),
      },
      { transaction },
    );

    await ClaimEvidenceModel.create(
      {
        factClaimId,
        sourceArtifactId,
        excerpt: article.excerpt,
        excerptHash: createHash('sha256').update(article.excerpt).digest('hex'),
        locator: article.url,
        retrievedAt: new Date(coverage.provenance.retrievedAt),
      },
      { transaction },
    );
  }
}
