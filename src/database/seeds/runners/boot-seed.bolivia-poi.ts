import { randomUUID } from 'node:crypto';
import { Op, type Transaction } from 'sequelize';
import {
  ClaimEvidenceModel,
  FactClaimModel,
  RawObservationModel,
  SourceArtifactModel,
} from '../../models';
import { reconcileHistoryRun } from './boot-seed.history-provenance';
import { claimContentHash, rawPayloadHash } from '../../../common/intelligence/claim-normalizer';
import { textHash } from '../../../common/hashing/canonical-hash';
import { boliviaPoiSchema, type BoliviaPoi, type PoiPlace } from '../schemas/bolivia-poi.schema';
import { readSeed } from './seed.utils';

/**
 * Loads the places of Santa Cruz de la Sierra, La Paz and Cochabamba.
 *
 * They land in the same claim tables as every other corpus, so they inherit the
 * provenance and the immutability the rest of the observatory has. What they do
 * not inherit is a period: a place is not a reading, so the claim carries the
 * date of the release it was published in and nothing pretends that date is
 * when the shop opened.
 *
 * Idempotent by construction, and the identity is the place — `placeId` plus
 * the attributes read from it. The address the extractor downloaded from is
 * deliberately absent from the hashed payload and lives on the artifact
 * instead. That is not tidiness: when the market collector changed hosts, its
 * URL was inside the payload, every hash in the series changed at once, and an
 * eleven-row append became a re-import of six thousand. A mirror of Overture
 * must not be able to duplicate a city.
 */

const AGENT_CODE = 'CITY_POI';
const CHUNK = 500;

/**
 * One place, shaped like the record an ingestion path would submit.
 *
 * The contact details travel here and stop here: the raw observation is where
 * provenance lives and nothing is dropped from it, while the read model that
 * the public report reads does not lift them out. Losing them would make the
 * record less than what was retrieved; publishing them would make the
 * observatory a business directory it never said it was.
 */
function placePayload(seed: BoliviaPoi, place: PoiPlace): Record<string, unknown> {
  return {
    recordType: 'PLACE_RECORD',
    dataCategory: 'CITY_POI',
    placeId: place.placeId,
    name: place.name,
    city: place.city,
    department: place.department,
    zone: place.zone ?? null,
    zoneType: place.zoneType ?? null,
    latitude: place.latitude,
    longitude: place.longitude,
    entityGroup: place.entityGroup,
    entityFamily: place.entityFamily,
    commercialRole: place.commercialRole,
    isRegulated: place.isRegulated,
    type: place.type ?? null,
    basicCategory: place.basicCategory ?? null,
    taxonomyHierarchy: place.taxonomyHierarchy ?? [],
    confidence: place.confidence ?? null,
    qualityGrade: place.qualityGrade ?? null,
    address: place.address ?? null,
    postcode: place.postcode ?? null,
    phones: place.phones ?? [],
    emails: place.emails ?? [],
    websites: place.websites ?? [],
    socials: place.socials ?? [],
    brand: place.brand ?? null,
    officialValidationSource: place.officialValidationSource ?? null,
    validationPriority: place.validationPriority ?? null,
    duplicateCandidateKey: place.duplicateCandidateKey ?? null,
    upstream: place.upstream ?? [],
    publisher: seed.provenance.publisher,
    publisherVerified: true,
    geofenceMethod: seed.provenance.geofenceMethod,
    countryCode: seed.provenance.countryCode,
  };
}

/**
 * The download the whole corpus came from, registered once.
 *
 * One artifact and not one per city: the extractor ran a single query against a
 * single pinned release, and three artifacts would claim three retrievals that
 * never happened.
 */
async function reconcileArtifact(
  seed: BoliviaPoi,
  sourceId: string,
  transaction: Transaction,
): Promise<string> {
  const existing = await SourceArtifactModel.findOne({
    where: { sha256: seed.provenance.upstreamSha256 },
    transaction,
  });
  if (existing) return existing.sourceArtifactId;

  const sourceArtifactId = randomUUID();
  await SourceArtifactModel.create(
    {
      sourceArtifactId,
      sourceId,
      artifactType: 'JSON',
      originalUri: seed.provenance.sourceUrl,
      storageUri: seed.provenance.sourceUrl,
      mimeType: 'application/x-ndjson',
      sha256: seed.provenance.upstreamSha256,
      publicationDate: null,
      retrievedAt: new Date(seed.provenance.retrievedAt),
      metadataJson: {
        publisher: seed.provenance.publisher,
        release: seed.provenance.release,
        dataset: seed.dataset,
        licenses: seed.provenance.licenses,
        minimumConfidence: seed.provenance.minimumConfidence,
        geofenceMethod: seed.provenance.geofenceMethod,
        retrievalStrategy: 'VERSIONED_SNAPSHOT_V1',
      },
    },
    { transaction },
  );
  return sourceArtifactId;
}

async function alreadyHeld(
  hashes: readonly string[],
  transaction: Transaction,
): Promise<Set<string>> {
  const held = new Set<string>();
  for (let start = 0; start < hashes.length; start += CHUNK) {
    const rows = await RawObservationModel.findAll({
      attributes: ['payloadHash'],
      where: { payloadHash: { [Op.in]: hashes.slice(start, start + CHUNK) } },
      transaction,
    });
    for (const row of rows) held.add(row.payloadHash);
  }
  return held;
}

/**
 * What the register asserts about a place, in one sentence.
 *
 * It says where the place is and what it is, and it stops there. It does not
 * say the place is licensed, open, or still in business: the catalogue knows
 * none of those, and an assertion is read by people who will not go and check
 * the column it was derived from.
 */
function assertionFor(place: PoiPlace): string {
  const zone = place.zone ? `, zona ${place.zone}` : '';
  return `${place.name} figura en ${place.city}${zone} como ${place.entityFamily}.`;
}

export async function reconcileBoliviaPoi(
  sourceId: string,
  transaction: Transaction,
): Promise<void> {
  const seed = await readSeed('boot/bolivia-poi.json', boliviaPoiSchema);
  const agentRunId = await reconcileHistoryRun(AGENT_CODE, transaction);

  const payloads = seed.places.map((place) => placePayload(seed, place));
  const hashes = payloads.map((payload) => rawPayloadHash(payload));
  const held = await alreadyHeld(hashes, transaction);

  const pending = seed.places
    .map((place, index) => ({ place, payload: payloads[index], hash: hashes[index] }))
    .filter(
      (entry): entry is { place: PoiPlace; payload: Record<string, unknown>; hash: string } =>
        entry.payload !== undefined && entry.hash !== undefined && !held.has(entry.hash),
    );
  if (pending.length === 0) return;

  const sourceArtifactId = await reconcileArtifact(seed, sourceId, transaction);
  const receivedAt = new Date(seed.provenance.retrievedAt);
  // The release is what dates these rows. A place has no event of its own, and
  // dating them with today's date would make every reload a different day.
  const eventDate = seed.provenance.release.slice(0, 10);

  for (let start = 0; start < pending.length; start += CHUNK) {
    const batch = pending.slice(start, start + CHUNK);

    const observations = await RawObservationModel.bulkCreate(
      batch.map((entry) => ({
        agentRunId,
        sourceArtifactId,
        payloadJson: entry.payload,
        payloadHash: entry.hash,
        receivedAt,
        processingStatus: 'NORMALIZED' as const,
        retryCount: 0,
      })),
      { transaction, returning: true },
    );

    const claims = batch.map((entry, index) => {
      const assertion = assertionFor(entry.place);
      return {
        factClaimId: randomUUID(),
        agentRunId,
        rawObservationId: observations[index]?.rawObservationId ?? '',
        claimType: 'FACT' as const,
        assertion,
        eventDate,
        confidenceLevel: 'MEDIUM' as const,
        confidenceScore: (entry.place.confidence ?? 0.6).toFixed(4),
        impactLevel: 'LOW' as const,
        timeHorizon: 'STRUCTURAL' as const,
        status: 'PUBLISHED' as const,
        contentHash: claimContentHash({ claimType: 'FACT', assertion, eventDate }),
        createdAt: new Date(),
      };
    });
    await FactClaimModel.bulkCreate(claims, { transaction });

    await ClaimEvidenceModel.bulkCreate(
      claims.map((claim) => ({
        factClaimId: claim.factClaimId,
        sourceArtifactId,
        // The publisher serves a row, not a sentence. The quotation is that row
        // stated plainly, which is exactly what was retrieved and nothing more.
        excerpt: claim.assertion,
        excerptHash: textHash(claim.assertion),
        locator: seed.provenance.sourceUrl,
        retrievedAt: receivedAt,
      })),
      { transaction },
    );
  }
}
