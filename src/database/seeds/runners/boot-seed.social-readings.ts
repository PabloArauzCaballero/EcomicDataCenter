import { randomUUID } from 'node:crypto';
import { Op, type Transaction } from 'sequelize';
import {
  ClaimEvidenceModel,
  FactClaimModel,
  RawObservationModel,
  SourceArtifactModel,
} from '../../models';
import { reconcileHistoryRun } from './boot-seed.history-provenance';
import { canonicalHash, textHash } from '../../../common/hashing/canonical-hash';
import { claimContentHash, rawPayloadHash } from '../../../common/intelligence/claim-normalizer';
import {
  socialReadingsSchema,
  type SocialReading,
  type SocialReadings,
} from '../schemas/social-readings.schema';
import { readSeed } from './seed.utils';

/**
 * Loads what third parties published about how Bolivia buys and sells.
 *
 * The assertion is as narrow as the press one, and for a stronger reason. There
 * a collector at least downloaded the listing; here nothing was downloaded at
 * all: a household panel or a field study is read and cited, never fetched. So
 * the record says that a named compiler published a figure on a date, and
 * stops. Whether that figure measures the country is not something this
 * observatory can establish on a compiler's behalf.
 *
 * The register once carried platform analytics too. ADR 0025 removed it, and
 * the schema now admits only COMMERCE, so what loads here is the form of trade
 * — ferias, tiendas de barrio, catálogo, contrabando, cuenta propia — rather
 * than the reach a platform declares about itself.
 *
 * Confidence follows the evidence grade rather than a constant: a compiler that
 * states its method is not the same witness as a note that publishes a
 * percentage with no sample behind it, and averaging them into one voice would
 * hide exactly the difference a reader needs.
 *
 * Nothing loaded here can reach a series. See ADR 0022.
 */

const AGENT_CODE = 'SOCIAL_READINGS';

/** Confidence a grade earns, and the score the register sorts on. */
const CONFIDENCE = {
  HIGH: { level: 'MEDIUM', score: '0.6000' },
  MEDIUM: { level: 'LOW', score: '0.4000' },
  LOW: { level: 'LOW', score: '0.2500' },
} as const;

/**
 * Identifies the publication this observatory registered, not a copy of it.
 *
 * Every other artifact in the system carries the digest of a document that was
 * fetched. These publications were read and cited, never retrieved, so a digest
 * of their bytes would be a claim nobody can check. The digest is taken over
 * the canonical descriptor instead — compiler, address, date, title — which is
 * stable, reproduces on reload, and says what it actually identifies.
 */
function publicationDigest(reading: SocialReading): string {
  return canonicalHash({
    publisher: reading.publisher,
    url: reading.url,
    publishedOn: reading.publishedOn,
    publication: reading.publication,
  });
}

async function reconcilePublicationArtifact(
  readings: SocialReadings,
  reading: SocialReading,
  sourceId: string,
  cache: Map<string, string>,
  transaction: Transaction,
): Promise<string> {
  const sha256 = publicationDigest(reading);
  const cached = cache.get(sha256);
  if (cached) return cached;

  const existing = await SourceArtifactModel.findOne({ where: { sha256 }, transaction });
  if (existing) {
    cache.set(sha256, existing.sourceArtifactId);
    return existing.sourceArtifactId;
  }

  const sourceArtifactId = randomUUID();
  await SourceArtifactModel.create(
    {
      sourceArtifactId,
      sourceId,
      artifactType: 'REFERENCE',
      originalUri: reading.url,
      storageUri: reading.url,
      mimeType: 'text/html',
      sha256,
      publicationDate: reading.publishedOn,
      retrievedAt: new Date(readings.provenance.recordedAt),
      metadataJson: {
        publisher: reading.publisher,
        domain: reading.publisherDomain,
        publication: reading.publication,
        publicationPrecision: reading.publicationPrecision,
        method: reading.method,
        // The digest identifies this record of the publication, not the
        // publication itself, and the strategy names that difference so an
        // auditor is never left to infer it. See ADR 0022 §4.
        retrievalStrategy: 'CITED_REFERENCE_V1',
      },
    },
    { transaction },
  );
  cache.set(sha256, sourceArtifactId);
  return sourceArtifactId;
}

/** Payload for one reading, shaped like the one a submission would carry. */
function readingPayload(reading: SocialReading): Record<string, unknown> {
  return {
    recordType: 'SOCIAL_READING',
    dataCategory: 'SOCIAL_READING',
    eventDate: reading.eventDate,
    frequency: 'EVENT',
    platform: reading.platform,
    subject: reading.subject,
    metric: reading.metric,
    label: reading.label,
    value: reading.value,
    unit: reading.unit,
    referencePeriod: reading.referencePeriod,
    publisher: reading.publisher,
    domain: reading.publisherDomain,
    publication: reading.publication,
    publicationPrecision: reading.publicationPrecision,
    method: reading.method,
    evidenceGrade: reading.evidenceGrade,
    // The compiler's identity is established by its registered domain. The
    // channel the reading is *about* establishes nobody, which is why the
    // platform travels as data and never as the source tier.
    publisherVerified: true,
    sourceTier: 'SECTOR',
    publicationInDocument: false,
    url: reading.url,
  };
}

function readingAssertion(reading: SocialReading): string {
  return `${reading.publisher} publicó el ${reading.publishedOn}: ${reading.label}, ${reading.value} (${reading.referencePeriod})`;
}

export async function reconcileSocialReadings(
  sourceId: string,
  transaction: Transaction,
): Promise<void> {
  const readings = await readSeed('boot/social-readings.json', socialReadingsSchema);
  const agentRunId = await reconcileHistoryRun(AGENT_CODE, transaction);

  const entries = readings.readings.map((reading) => ({
    reading,
    payload: readingPayload(reading),
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

    const { reading } = entry;
    const sourceArtifactId = await reconcilePublicationArtifact(
      readings,
      reading,
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
        receivedAt: new Date(readings.provenance.recordedAt),
        processingStatus: 'NORMALIZED',
        retryCount: 0,
      },
      { transaction },
    );

    const assertion = readingAssertion(reading);
    const confidence = CONFIDENCE[reading.evidenceGrade];
    const factClaimId = randomUUID();
    await FactClaimModel.create(
      {
        factClaimId,
        agentRunId,
        rawObservationId: observation.rawObservationId,
        claimType: 'FACT',
        assertion,
        eventDate: reading.eventDate,
        publishedAt: new Date(`${reading.publishedOn}T00:00:00Z`),
        confidenceLevel: confidence.level,
        confidenceScore: confidence.score,
        impactLevel: 'LOW',
        timeHorizon: 'SHORT_TERM',
        status: 'PUBLISHED',
        contentHash: claimContentHash({
          claimType: 'FACT',
          assertion,
          eventDate: reading.eventDate,
        }),
        createdAt: new Date(),
      },
      { transaction },
    );

    await ClaimEvidenceModel.create(
      {
        factClaimId,
        sourceArtifactId,
        excerpt: reading.statement,
        excerptHash: textHash(reading.statement),
        locator: reading.url,
        retrievedAt: new Date(readings.provenance.recordedAt),
      },
      { transaction },
    );
  }
}
