import { randomUUID } from 'node:crypto';
import { Op, type Transaction } from 'sequelize';
import { ClaimEvidenceModel, FactClaimModel, RawObservationModel, SourceArtifactModel } from '../../models';
import { rawPayloadHash, claimContentHash } from '../../../common/intelligence/claim-normalizer';
import { textHash } from '../../../common/hashing/canonical-hash';
import { reconcileHistoryRun } from './boot-seed.history-provenance';
import { loadRoadLengths } from './boot-seed.bolivia-road-network.lengths';
import { roadSectionsSeedSchema, type RoadSection } from '../schemas/bolivia-road-network.schema';
import { readSeed } from './seed.utils';

/**
 * Loads the road network Bolivia signs on the ground: sections traced from
 * OpenStreetMap and the INE's official length by network and rodadura.
 *
 * Two publishers, two files, one agent — the way `bolivia-national-poi` reads
 * two deliveries under one loader. A section is written as one observation,
 * one claim and one piece of evidence, exactly as a national place is. Neither
 * corpus touches `macro_indicator_annual`: a road is not a measured magnitude
 * in the sense that GDP or an exchange rate is, and folding it into that view
 * would group nine departments and two publishers under one more prefix
 * nobody asked for. Its own migration reads it instead.
 *
 * Split from the length loader for the same reason `bolivia-national-poi`
 * split its batch writer out: one file over the 300-line ceiling, and the
 * length half reads on its own.
 */

const AGENT_CODE = 'ROAD_NETWORK_ABC_OSM_INE';
const CHUNK = 500;

export const ROAD_NETWORK_CHUNK = CHUNK;

function sectionPayload(dataset: string, section: RoadSection): Record<string, unknown> {
  return {
    recordType: 'ROAD_SECTION',
    dataCategory: 'ROAD_SECTION',
    dataset,
    sectionId: section.sectionId,
    route: section.route,
    network: section.network,
    name: section.name,
    department: section.department,
    highwayClass: section.highwayClass,
    surface: section.surface,
    status: section.status,
    lengthKm: section.lengthKm,
    carriagewayKm: section.carriagewayKm,
    maxspeed: section.maxspeed,
    wayCount: section.wayCount,
    geometry: section.geometry,
  };
}

/** What the register asserts about a section, in one sentence. */
function sectionAssertion(section: RoadSection): string {
  const label = section.route ?? section.name ?? `vía ${section.sectionId}`;
  return `${label} recorre ${section.lengthKm.toFixed(1)} km en ${section.department} sobre ${section.surface.toLowerCase()}.`;
}

/** The artifact a block of rows cites, created once per digest. */
export async function reconcileRoadArtifact(
  sourceId: string,
  transaction: Transaction,
  fields: {
    sha256: string;
    originalUri: string;
    metadataJson: Record<string, unknown>;
    retrievedAt: string;
  },
): Promise<string> {
  const existing = await SourceArtifactModel.findOne({ where: { sha256: fields.sha256 }, transaction });
  if (existing) return existing.sourceArtifactId;

  const sourceArtifactId = randomUUID();
  await SourceArtifactModel.create(
    {
      sourceArtifactId,
      sourceId,
      artifactType: 'JSON',
      originalUri: fields.originalUri,
      storageUri: fields.originalUri,
      mimeType: 'application/json',
      sha256: fields.sha256,
      publicationDate: null,
      retrievedAt: new Date(fields.retrievedAt),
      metadataJson: fields.metadataJson,
    },
    { transaction },
  );
  return sourceArtifactId;
}

/** Which of a block's payload hashes the corpus already holds. */
export async function roadHashesAlreadyHeld(
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

async function loadSections(sourceId: string, agentRunId: string, transaction: Transaction) {
  const seed = await readSeed('boot/bolivia-road-network/road-sections.json', roadSectionsSeedSchema);
  const payloads = seed.sections.map((section) => sectionPayload(seed.dataset, section));
  const hashes = payloads.map((payload) => rawPayloadHash(payload));
  const held = await roadHashesAlreadyHeld(hashes, transaction);

  const pending = seed.sections
    .map((section, index) => ({ section, payload: payloads[index], hash: hashes[index] }))
    .filter(
      (entry): entry is { section: RoadSection; payload: Record<string, unknown>; hash: string } =>
        entry.payload !== undefined && entry.hash !== undefined && !held.has(entry.hash),
    );
  if (pending.length === 0) return;

  const sourceArtifactId = await reconcileRoadArtifact(sourceId, transaction, {
    sha256: seed.provenance.extractSha256,
    originalUri: seed.provenance.extractUri,
    retrievedAt: seed.provenance.retrievedAt,
    metadataJson: {
      dataset: seed.dataset,
      publisher: seed.provenance.publisher,
      licence: seed.provenance.licence,
      attribution: seed.provenance.attribution,
      extractMd5: seed.provenance.extractMd5,
      snapshotDate: seed.provenance.snapshotDate,
      boundaries: seed.provenance.boundaries,
      highwayClasses: seed.provenance.highwayClasses,
      wayCount: seed.provenance.wayCount,
      retrievalStrategy: 'VERSIONED_SNAPSHOT_V1',
    },
  });
  const eventDate = seed.provenance.snapshotDate;
  const receivedAt = new Date(seed.provenance.retrievedAt);

  for (let start = 0; start < pending.length; start += CHUNK) {
    const block = pending.slice(start, start + CHUNK);
    const observations = await RawObservationModel.bulkCreate(
      block.map((entry) => ({
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
    const claims = block.map((entry, index) => {
      const assertion = sectionAssertion(entry.section);
      return {
        factClaimId: randomUUID(),
        agentRunId,
        rawObservationId: observations[index]?.rawObservationId ?? '',
        claimType: 'FACT' as const,
        assertion,
        eventDate,
        confidenceLevel: 'MEDIUM' as const,
        confidenceScore: '0.6000',
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
        excerpt: claim.assertion,
        excerptHash: textHash(claim.assertion),
        locator: seed.provenance.extractUri,
        retrievedAt: receivedAt,
      })),
      { transaction },
    );
  }
}

export async function reconcileBoliviaRoadNetwork(
  sourceId: string,
  transaction: Transaction,
): Promise<void> {
  const agentRunId = await reconcileHistoryRun(AGENT_CODE, transaction);
  await loadSections(sourceId, agentRunId, transaction);
  await loadRoadLengths(sourceId, agentRunId, transaction);
}
