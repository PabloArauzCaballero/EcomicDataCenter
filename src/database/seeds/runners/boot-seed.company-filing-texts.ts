import { createHash, randomUUID } from 'node:crypto';
import { Op, type Transaction } from 'sequelize';
import {
  ClaimEvidenceModel,
  FactClaimModel,
  RawObservationModel,
  SourceArtifactModel,
} from '../../models';
import {
  companyFilingTextsSchema,
  type CompanyFilingText,
  type CompanyFilingTexts,
} from '../schemas/company-filing-texts.schema';
import { readSeed } from './seed.utils';

/**
 * Attaches each filing's own page to the claim the register already produced.
 *
 * Nothing existing is touched: no payload is rewritten, no claim superseded,
 * no observation replaced. A filing simply gains a second piece of evidence,
 * from a different document, with that document's own digest — which is what
 * the evidence table is for.
 *
 * Idempotent on the excerpt digest: re-running finds the evidence already
 * present and inserts nothing.
 */

async function reconcileDocumentArtifact(
  texts: CompanyFilingTexts,
  entry: CompanyFilingText,
  sourceId: string,
  eventDate: string,
  transaction: Transaction,
): Promise<string> {
  const existing = await SourceArtifactModel.findOne({
    where: { sha256: entry.documentSha256 },
    transaction,
  });
  if (existing) return existing.sourceArtifactId;

  const url = texts.provenance.documentUrlPattern.replace('{id}', String(entry.filingId));
  const sourceArtifactId = randomUUID();
  await SourceArtifactModel.create(
    {
      sourceArtifactId,
      sourceId,
      artifactType: 'HTML',
      originalUri: url,
      storageUri: url,
      mimeType: 'text/html',
      sha256: entry.documentSha256,
      publicationDate: eventDate,
      retrievedAt: new Date(texts.provenance.retrievedAt),
      metadataJson: {
        publisher: texts.provenance.publisher,
        filingId: entry.filingId,
        retrievalStrategy: 'VERSIONED_SNAPSHOT_V1',
        publicationDateVerification: 'STATED_IN_DOCUMENT',
      },
    },
    { transaction },
  );
  return sourceArtifactId;
}

export async function reconcileCompanyFilingTexts(
  sourceId: string,
  transaction: Transaction,
): Promise<void> {
  const texts = await readSeed('boot/company-filing-texts.json', companyFilingTextsSchema);

  /**
   * The claim each text belongs to, matched on the identifier the register's
   * payload carries. Read in two plain queries rather than through an
   * association, so nothing here depends on how the models are wired together.
   */
  const observations = await RawObservationModel.findAll({
    attributes: ['rawObservationId', 'payloadJson'],
    transaction,
  });
  const observationByFiling = new Map<number, string>();
  for (const row of observations) {
    const payload = row.payloadJson as { filingId?: unknown; dataCategory?: unknown };
    if (payload.dataCategory !== 'COMPANY_NEWS' || typeof payload.filingId !== 'number') continue;
    observationByFiling.set(payload.filingId, row.rawObservationId);
  }

  const claims = await FactClaimModel.findAll({
    attributes: ['factClaimId', 'rawObservationId', 'eventDate'],
    where: { rawObservationId: { [Op.in]: [...observationByFiling.values()] } },
    transaction,
  });
  const claimByObservation = new Map(
    claims.map((claim) => [claim.rawObservationId, claim]),
  );
  const byFiling = new Map<number, (typeof claims)[number]>();
  for (const [filingId, observationId] of observationByFiling) {
    const claim = claimByObservation.get(observationId);
    if (claim) byFiling.set(filingId, claim);
  }

  const digests = texts.texts.map((entry) =>
    createHash('sha256').update(entry.text).digest('hex'),
  );
  const present = new Set<string>();
  for (let start = 0; start < digests.length; start += 500) {
    const rows = await ClaimEvidenceModel.findAll({
      attributes: ['excerptHash'],
      where: { excerptHash: { [Op.in]: digests.slice(start, start + 500) } },
      transaction,
    });
    for (const row of rows) present.add(row.excerptHash);
  }

  for (const [index, entry] of texts.texts.entries()) {
    const digest = digests[index];
    const claim = byFiling.get(entry.filingId);
    if (!digest || !claim || !claim.eventDate || present.has(digest)) continue;

    const sourceArtifactId = await reconcileDocumentArtifact(
      texts,
      entry,
      sourceId,
      claim.eventDate,
      transaction,
    );

    await ClaimEvidenceModel.create(
      {
        factClaimId: claim.factClaimId,
        sourceArtifactId,
        excerpt: entry.text,
        excerptHash: digest,
        locator: texts.provenance.documentUrlPattern.replace('{id}', String(entry.filingId)),
        retrievedAt: new Date(texts.provenance.retrievedAt),
      },
      { transaction },
    );
  }
}
