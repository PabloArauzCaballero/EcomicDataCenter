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
  companyFilingsSchema,
  type CompanyFiling,
  type CompanyFilings,
} from '../schemas/company-filings.schema';
import { readSeed } from './seed.utils';

/**
 * Loads the material events on the exchange's listing at capture time.
 *
 * The exchange keeps the country's registry of corporate facts that move a
 * price, and the daily collector picks up new filings as they appear. This
 * seeds the ones already on the listing when the snapshot was taken, so a
 * reader opening the report today sees the registry rather than an empty
 * section waiting for tomorrow's run.
 *
 * Each filing is its own artifact: a listing is rewritten as new filings
 * arrive, a filing is not, so the evidence is the filing's own page and the
 * digest is of that page.
 */

const AGENT_CODE = 'BBV_FILINGS_BACKFILL';

async function reconcileFilingArtifact(
  filings: CompanyFilings,
  filing: CompanyFiling,
  sourceId: string,
  transaction: Transaction,
): Promise<string> {
  const existing = await SourceArtifactModel.findOne({
    where: { sha256: filing.documentSha256 },
    transaction,
  });
  if (existing) return existing.sourceArtifactId;

  const sourceArtifactId = randomUUID();
  await SourceArtifactModel.create(
    {
      sourceArtifactId,
      sourceId,
      artifactType: 'HTML',
      originalUri: filing.url,
      storageUri: filing.url,
      mimeType: 'text/html',
      sha256: filing.documentSha256,
      publicationDate: filing.eventDate,
      retrievedAt: new Date(filings.provenance.retrievedAt),
      metadataJson: {
        publisher: filings.provenance.publisher,
        filer: filing.filer,
        subject: filing.subject,
        statedInstant: filing.statedInstant,
        publicationDateVerification: filing.statedInDocument ? 'STATED_IN_DOCUMENT' : 'UNAVAILABLE',
        listingUrl: filings.provenance.listingUrl,
        retrievalStrategy: 'VERSIONED_SNAPSHOT_V1',
      },
    },
    { transaction },
  );
  return sourceArtifactId;
}

/** Payload for one filing, shaped like the one the collector submits. */
function filingPayload(filings: CompanyFilings, filing: CompanyFiling): Record<string, unknown> {
  return {
    recordType: 'NEWS',
    dataCategory: 'COMPANY_NEWS',
    eventDate: filing.eventDate,
    frequency: 'EVENT',
    filer: filing.filer,
    subject: filing.subject,
    statedInstant: filing.statedInstant,
    publicationInDocument: filing.statedInDocument,
    publisher: filings.provenance.publisher,
    publisherVerified: true,
    url: filing.url,
    sha256: filing.documentSha256,
    storageUri: filing.url,
  };
}

export async function reconcileCompanyFilings(
  sourceId: string,
  transaction: Transaction,
): Promise<void> {
  const filings = await readSeed('boot/company-filings.json', companyFilingsSchema);
  const agentRunId = await reconcileHistoryRun(AGENT_CODE, transaction);

  const entries = filings.filings.map((filing) => ({
    filing,
    payload: filingPayload(filings, filing),
  }));
  const hashes = entries.map((entry) => rawPayloadHash(entry.payload));
  const present = new Set(
    (
      await RawObservationModel.findAll({
        attributes: ['payloadHash'],
        where: { payloadHash: { [Op.in]: hashes } },
        transaction,
      })
    ).map((row) => row.payloadHash),
  );

  for (const [index, entry] of entries.entries()) {
    const payloadHash = hashes[index];
    if (!payloadHash || present.has(payloadHash)) continue;

    const { filing } = entry;
    const sourceArtifactId = await reconcileFilingArtifact(filings, filing, sourceId, transaction);

    const observation = await RawObservationModel.create(
      {
        agentRunId,
        sourceArtifactId,
        payloadJson: entry.payload,
        payloadHash,
        receivedAt: new Date(filings.provenance.retrievedAt),
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
        // Ordinary: a filing is a record that something was communicated, not a
        // judgement about what it means for a price.
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
        retrievedAt: new Date(filings.provenance.retrievedAt),
      },
      { transaction },
    );
  }
}
