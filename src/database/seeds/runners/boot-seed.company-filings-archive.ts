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
  companyFilingsArchiveSchema,
  type ArchivedFiling,
  type CompanyFilingsArchive,
} from '../schemas/company-filings-archive.schema';
import { readSeed } from './seed.utils';

/**
 * Loads the exchange's register of material events, issuer by issuer.
 *
 * One artifact per page of the response rather than per filing: a page is what
 * was actually fetched and digested, and five filings arriving in one response
 * share its provenance honestly. Claiming a separate document per filing would
 * assert a retrieval that never happened.
 *
 * Idempotent on the payload digest, like the snapshots beside it. Re-running
 * inserts nothing, and a later capture that extends the archive backwards adds
 * only the filings the first one did not carry.
 */

const AGENT_CODE = 'BBV_FILINGS_ARCHIVE';

/** One artifact per response page, created the first time a filing cites it. */
async function reconcilePageArtifact(
  archive: CompanyFilingsArchive,
  filing: ArchivedFiling,
  sourceId: string,
  cache: Map<string, string>,
  transaction: Transaction,
): Promise<string> {
  const cached = cache.get(filing.pageSha256);
  if (cached) return cached;

  const existing = await SourceArtifactModel.findOne({
    where: { sha256: filing.pageSha256 },
    transaction,
  });
  if (existing) {
    cache.set(filing.pageSha256, existing.sourceArtifactId);
    return existing.sourceArtifactId;
  }

  const sourceArtifactId = randomUUID();
  await SourceArtifactModel.create(
    {
      sourceArtifactId,
      sourceId,
      artifactType: 'JSON',
      originalUri: archive.provenance.endpointUrl,
      storageUri: archive.provenance.endpointUrl,
      mimeType: 'application/json',
      sha256: filing.pageSha256,
      publicationDate: filing.eventDate,
      retrievedAt: new Date(archive.provenance.retrievedAt),
      metadataJson: {
        publisher: archive.provenance.publisher,
        listingUrl: archive.provenance.listingUrl,
        query: archive.provenance.query.replace('{n}', String(filing.page)),
        page: filing.page,
        retrievalStrategy: 'VERSIONED_SNAPSHOT_V1',
      },
    },
    { transaction },
  );
  cache.set(filing.pageSha256, sourceArtifactId);
  return sourceArtifactId;
}

/**
 * Payload for one filing, shaped like the one the collector submits.
 *
 * `publicationInDocument` is false here on purpose: the stamp comes from the
 * register, and the filing's own page was not fetched to confirm it repeats it.
 */
function filingPayload(
  archive: CompanyFilingsArchive,
  filing: ArchivedFiling,
): Record<string, unknown> {
  return {
    recordType: 'NEWS',
    dataCategory: 'COMPANY_NEWS',
    eventDate: filing.eventDate,
    frequency: 'EVENT',
    filer: filing.filer,
    filerCode: filing.filerCode,
    filingId: filing.filingId,
    subject: filing.subject,
    statedInstant: filing.statedInstant,
    publicationInDocument: false,
    publisher: archive.provenance.publisher,
    publisherVerified: true,
    url: filing.url,
    sha256: filing.pageSha256,
    storageUri: archive.provenance.endpointUrl,
  };
}

export async function reconcileCompanyFilingArchive(
  sourceId: string,
  transaction: Transaction,
): Promise<void> {
  const archive = await readSeed('boot/company-filings-archive.json', companyFilingsArchiveSchema);
  const agentRunId = await reconcileHistoryRun(AGENT_CODE, transaction);

  const entries = archive.filings.map((filing) => ({
    filing,
    payload: filingPayload(archive, filing),
  }));
  const hashes = entries.map((entry) => rawPayloadHash(entry.payload));

  /** Chunked because the register is thousands of rows and `IN` has limits. */
  const present = new Set<string>();
  for (let start = 0; start < hashes.length; start += 500) {
    const slice = hashes.slice(start, start + 500);
    const rows = await RawObservationModel.findAll({
      attributes: ['payloadHash'],
      where: { payloadHash: { [Op.in]: slice } },
      transaction,
    });
    for (const row of rows) present.add(row.payloadHash);
  }

  const artifacts = new Map<string, string>();
  for (const [index, entry] of entries.entries()) {
    const payloadHash = hashes[index];
    if (!payloadHash || present.has(payloadHash)) continue;

    const { filing } = entry;
    const sourceArtifactId = await reconcilePageArtifact(
      archive,
      filing,
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
        receivedAt: new Date(archive.provenance.retrievedAt),
        processingStatus: 'NORMALIZED',
        retryCount: 0,
      },
      { transaction },
    );

    const assertion = `${filing.filer} comunicó a la Bolsa Boliviana de Valores un hecho relevante: ${filing.subject}.`;
    const factClaimId = randomUUID();
    await FactClaimModel.create(
      {
        factClaimId,
        agentRunId,
        rawObservationId: observation.rawObservationId,
        claimType: 'FACT',
        assertion,
        eventDate: filing.eventDate,
        publishedAt: new Date(filing.publishedAt),
        confidenceLevel: 'HIGH',
        confidenceScore: '0.9000',
        impactLevel: 'MEDIUM',
        timeHorizon: 'SHORT_TERM',
        status: 'PUBLISHED',
        contentHash: claimContentHash({
          claimType: 'FACT',
          assertion,
          eventDate: filing.eventDate,
        }),
        createdAt: new Date(),
      },
      { transaction },
    );

    await ClaimEvidenceModel.create(
      {
        factClaimId,
        sourceArtifactId,
        excerpt: filing.excerpt,
        excerptHash: createHash('sha256').update(filing.excerpt).digest('hex'),
        locator: filing.url,
        retrievedAt: new Date(archive.provenance.retrievedAt),
      },
      { transaction },
    );
  }
}
