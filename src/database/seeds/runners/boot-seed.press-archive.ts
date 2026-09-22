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
  pressArchiveSchema,
  type ArchivedArticle,
  type PressArchive,
} from '../schemas/press-archive.schema';
import { readSeed } from './seed.utils';

/**
 * Loads the archived coverage, one calendar year per file.
 *
 * Written in batches rather than row by row. At this volume the difference is
 * not tuning: a hundred thousand round trips is hours, and the same rows in
 * chunks of a thousand is minutes, which decides whether a fresh deployment can
 * seed itself at all.
 *
 * Every record carries what makes it weaker than a feed's — that its headline
 * was reconstructed from the address, and whether its date is the outlet's or
 * the archive's — so a reader is never shown a reconstruction as a quotation.
 *
 * Idempotent on the payload digest, like every loader beside it.
 */

const AGENT_CODE = 'PRESS_ARCHIVE';
const CHUNK = 1_000;

const YEARS = [2020, 2021, 2022, 2023, 2024, 2025, 2026] as const;

async function reconcileIndexArtifact(
  archive: PressArchive,
  sourceId: string,
  transaction: Transaction,
): Promise<string> {
  const digest = createHash('sha256')
    .update(`${archive.provenance.indexUrl}|${archive.provenance.year}`)
    .digest('hex');
  const existing = await SourceArtifactModel.findOne({ where: { sha256: digest }, transaction });
  if (existing) return existing.sourceArtifactId;

  const sourceArtifactId = randomUUID();
  await SourceArtifactModel.create(
    {
      sourceArtifactId,
      sourceId,
      artifactType: 'JSON',
      originalUri: archive.provenance.indexUrl,
      storageUri: archive.provenance.indexUrl,
      mimeType: 'application/json',
      sha256: digest,
      publicationDate: `${archive.provenance.year}-12-31`,
      retrievedAt: new Date(archive.provenance.retrievedAt),
      metadataJson: {
        publisher: archive.provenance.publisher,
        year: archive.provenance.year,
        retrievalStrategy: 'VERSIONED_SNAPSHOT_V1',
        retrievalMethod: 'WEB_ARCHIVE',
      },
    },
    { transaction },
  );
  return sourceArtifactId;
}

/** Payload for one archived article, shaped like the live collector's. */
function articlePayload(article: ArchivedArticle): Record<string, unknown> {
  return {
    recordType: 'NEWS',
    dataCategory: 'PRESS_COVERAGE',
    eventDate: article.eventDate,
    frequency: 'EVENT',
    outlet: article.outlet,
    domain: article.domain,
    section: 'Archivo',
    headline: article.headline,
    summary: '',
    statedInstant: article.archiveTimestamp,
    publicationInDocument: article.dateBasis === 'URL',
    publisher: article.outlet,
    publisherVerified: true,
    sourceTier: 'PRESS',
    url: article.url,
    listingUrl: article.archiveUrl,
    retrievalMethod: 'WEB_ARCHIVE',
    // Both weaknesses travel with the record so no view can lose them.
    headlineReconstructed: true,
    dateBasis: article.dateBasis,
  };
}

async function reconcileYear(
  file: string,
  sourceId: string,
  agentRunId: string,
  transaction: Transaction,
): Promise<number> {
  let archive: PressArchive;
  try {
    archive = await readSeed(file, pressArchiveSchema);
  } catch {
    // A year with no file is a year not collected, not a failure.
    return 0;
  }

  const sourceArtifactId = await reconcileIndexArtifact(archive, sourceId, transaction);
  const entries = archive.articles.map((article) => {
    const payload = articlePayload(article);
    return { article, payload, hash: rawPayloadHash(payload) };
  });

  const present = new Set<string>();
  for (let start = 0; start < entries.length; start += CHUNK) {
    const rows = await RawObservationModel.findAll({
      attributes: ['payloadHash'],
      where: {
        payloadHash: { [Op.in]: entries.slice(start, start + CHUNK).map((entry) => entry.hash) },
      },
      transaction,
    });
    for (const row of rows) present.add(row.payloadHash);
  }

  const pending = entries.filter((entry) => !present.has(entry.hash));
  if (!pending.length) return 0;

  let written = 0;
  for (let start = 0; start < pending.length; start += CHUNK) {
    const slice = pending.slice(start, start + CHUNK);
    // The observation key is assigned by the database, not by us, so the rows
    // are written first and the claims are linked to the ids that come back.
    const observations = slice.map((entry) => ({
      agentRunId,
      sourceArtifactId,
      payloadJson: entry.payload,
      payloadHash: entry.hash,
      receivedAt: new Date(archive.provenance.retrievedAt),
      processingStatus: 'NORMALIZED' as const,
      retryCount: 0,
    }));
    const inserted = await RawObservationModel.bulkCreate(observations, {
      transaction,
      returning: true,
    });

    const claims = slice.map((entry, index) => {
      const assertion = `${entry.article.outlet} publicó el ${entry.article.eventDate}: ${entry.article.headline}`;
      return {
        factClaimId: randomUUID(),
        agentRunId,
        rawObservationId: inserted[index]?.rawObservationId ?? '',
        claimType: 'FACT' as const,
        assertion,
        eventDate: entry.article.eventDate,
        publishedAt: new Date(`${entry.article.eventDate}T12:00:00-04:00`),
        // Lower than a feed's: the headline is reconstructed and the date may be
        // the archive's rather than the outlet's.
        confidenceLevel: 'MEDIUM' as const,
        confidenceScore: '0.5000',
        impactLevel: 'LOW' as const,
        timeHorizon: 'SHORT_TERM' as const,
        status: 'PUBLISHED' as const,
        contentHash: claimContentHash({
          claimType: 'FACT',
          assertion,
          eventDate: entry.article.eventDate,
        }),
        createdAt: new Date(),
      };
    });
    await FactClaimModel.bulkCreate(claims, { transaction });

    await ClaimEvidenceModel.bulkCreate(
      slice.map((entry, index) => ({
        factClaimId: claims[index]?.factClaimId ?? randomUUID(),
        sourceArtifactId,
        excerpt: entry.article.excerpt,
        excerptHash: createHash('sha256').update(entry.article.excerpt).digest('hex'),
        locator: entry.article.archiveUrl,
        retrievedAt: new Date(archive.provenance.retrievedAt),
      })),
      { transaction },
    );
    written += slice.length;
  }
  return written;
}

export async function reconcilePressArchive(
  sourceId: string,
  transaction: Transaction,
): Promise<void> {
  const agentRunId = await reconcileHistoryRun(AGENT_CODE, transaction);
  for (const year of YEARS) {
    await reconcileYear(`boot/press-archive-${year}.json`, sourceId, agentRunId, transaction);
  }
}
