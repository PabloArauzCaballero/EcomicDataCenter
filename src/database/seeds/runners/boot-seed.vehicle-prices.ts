import { randomUUID } from 'node:crypto';
import type { Transaction } from 'sequelize';
import {
  ClaimEvidenceModel,
  FactClaimModel,
  RawObservationModel,
  SourceArtifactModel,
} from '../../models';
import { claimContentHash, rawPayloadHash } from '../../../common/intelligence/claim-normalizer';
import { textHash } from '../../../common/hashing/canonical-hash';
import {
  validateVehicleSnapshot,
  vehicleOffersSeedSchema,
  vehicleSourcesSeedSchema,
  type VehicleOffer,
  type VehicleSource,
} from '../schemas/vehicle-prices.schema';
import { reconcileHistoryRun } from './boot-seed.history-provenance';
import { roadHashesAlreadyHeld } from './boot-seed.bolivia-road-network';
import { readSeed } from './seed.utils';

const AGENT_CODE = 'VEHICLE_PRICES';

function offerPayload(offer: VehicleOffer): Record<string, unknown> {
  return {
    recordType: 'VEHICLE_PRICE_OFFER',
    dataCategory: 'VEHICLE_PRICE_OFFER',
    ...offer,
    // The official page did not give these details for this priced version.
    powertrain: null,
    city: null,
    dealer: null,
    validUntil: null,
    availability: 'No verificada',
  };
}

function assertion(offer: VehicleOffer): string {
  return `${offer.brand} ${offer.model} ${offer.version} ${offer.modelYear}: ${offer.priceType.toLowerCase()} ${offer.currency} ${offer.price} observado el ${offer.observedAt}.`;
}

async function artifactFor(
  sourceId: string,
  source: VehicleSource,
  transaction: Transaction,
): Promise<string> {
  const existing = await SourceArtifactModel.findOne({
    where: { sha256: source.sha256 },
    transaction,
  });
  if (existing) return existing.sourceArtifactId;
  const sourceArtifactId = randomUUID();
  await SourceArtifactModel.create({
    sourceArtifactId,
    sourceId,
    artifactType: 'HTML',
    mimeType: 'text/html',
    originalUri: source.url,
    storageUri: source.url,
    sha256: source.sha256,
    publicationDate: null,
    retrievedAt: new Date(`${source.capturedAt}T00:00:00Z`),
    metadataJson: {
      publisher: new URL(source.url).hostname,
      dataset: 'boot/vehicle-prices.json',
      httpStatus: source.httpStatus,
      bytes: source.bytes,
      capturePrecision: 'DAY',
      retrievalStrategy: 'VERSIONED_SNAPSHOT_V1',
    },
  }, { transaction });
  return sourceArtifactId;
}

/** Additive load: an unchanged offer keeps the same payload hash and claim. */
export async function reconcileVehiclePrices(
  sourceId: string,
  transaction: Transaction,
): Promise<void> {
  const offers = await readSeed('boot/vehicle-prices.json', vehicleOffersSeedSchema);
  const sources = await readSeed('boot/vehicle-price-sources.json', vehicleSourcesSeedSchema);
  validateVehicleSnapshot(offers, sources);
  const entries = offers.map((offer) => {
    const payload = offerPayload(offer);
    return { offer, payload, hash: rawPayloadHash(payload) };
  });
  const held = await roadHashesAlreadyHeld(entries.map((entry) => entry.hash), transaction);
  const pending = entries.filter((entry) => !held.has(entry.hash));
  if (!pending.length) return;
  const agentRunId = await reconcileHistoryRun(AGENT_CODE, transaction);

  for (const source of sources) {
    const own = pending.filter((entry) => entry.offer.source === source.url);
    if (!own.length) continue;
    const sourceArtifactId = await artifactFor(sourceId, source, transaction);
    const receivedAt = new Date(`${source.capturedAt}T00:00:00Z`);
    const observations = await RawObservationModel.bulkCreate(own.map((entry) => ({
      agentRunId,
      sourceArtifactId,
      payloadJson: entry.payload,
      payloadHash: entry.hash,
      receivedAt,
      processingStatus: 'NORMALIZED' as const,
      retryCount: 0,
    })), { transaction, returning: true });
    const claims = own.map((entry, index) => {
      const statement = assertion(entry.offer);
      return {
        factClaimId: randomUUID(),
        agentRunId,
        rawObservationId: observations[index]?.rawObservationId ?? '',
        claimType: 'FACT' as const,
        assertion: statement,
        eventDate: entry.offer.observedAt,
        confidenceLevel: 'MEDIUM' as const,
        confidenceScore: '0.6000',
        impactLevel: 'LOW' as const,
        timeHorizon: 'SHORT_TERM' as const,
        status: 'PUBLISHED' as const,
        contentHash: claimContentHash({ claimType: 'FACT', assertion: statement, eventDate: entry.offer.observedAt }),
        createdAt: new Date(),
      };
    });
    await FactClaimModel.bulkCreate(claims, { transaction });
    await ClaimEvidenceModel.bulkCreate(claims.map((claim) => ({
      factClaimId: claim.factClaimId,
      sourceArtifactId,
      excerpt: claim.assertion,
      excerptHash: textHash(claim.assertion),
      locator: source.url,
      retrievedAt: receivedAt,
    })), { transaction });
  }
}
