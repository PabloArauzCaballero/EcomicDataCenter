import { randomUUID } from 'node:crypto';
import type { Transaction } from 'sequelize';
import {
  ClaimEvidenceModel,
  FactClaimModel,
  RawObservationModel,
} from '../../models';
import { rawPayloadHash, claimContentHash } from '../../../common/intelligence/claim-normalizer';
import { textHash } from '../../../common/hashing/canonical-hash';
import {
  ROAD_NETWORK_CHUNK,
  reconcileRoadArtifact,
  roadHashesAlreadyHeld,
} from './boot-seed.bolivia-road-network';
import {
  urbanStreetIndexSeedSchema,
  urbanStreetsSeedSchema,
} from '../schemas/bolivia-road-network.schema';
import { readSeed } from './seed.utils';

/**
 * Loads the streets of Bolivia's cities, in cells, and the index of their names.
 *
 * Beside the road sections, not instead of them: the national network stays at the
 * simplification a country needs and the streets arrive at the one a street needs.
 * A cell is one observation, one claim and one piece of evidence, exactly as a
 * section is, so the same views and the same `snapshotDate` rule read them (the
 * migration 0095). The index is one observation per city, so a search for a name
 * downloads a few hundred kilobytes and not the geometry of every street.
 *
 * The cells weigh ~27 MB, so they arrive in blocks a fifth the size of the sections'; a
 * run that finds them all already held does one query per block and nothing else.
 */

/*
 * Computed when used, not when loaded: this file and the road-network runner import each
 * other, and `ROAD_NETWORK_CHUNK` does not exist yet while the first one is still loading.
 */
const chunkSize = (): number => Math.max(50, Math.floor(ROAD_NETWORK_CHUNK / 5));

interface Entry {
  payload: Record<string, unknown>;
  hash: string;
  assertion: string;
}

interface Provenance {
  extractSha256: string;
  extractUri: string;
  retrievedAt: string;
  publisher: string;
  licence: string;
  attribution: string;
  extractMd5: string;
  snapshotDate: string;
  boundaries: string;
  highwayClasses: string[];
  wayCount: number;
}

async function insert(
  sourceId: string,
  agentRunId: string,
  transaction: Transaction,
  dataset: string,
  provenance: Provenance,
  entries: readonly Entry[],
): Promise<void> {
  const held = await roadHashesAlreadyHeld(
    entries.map((entry) => entry.hash),
    transaction,
  );
  const pending = entries.filter((entry) => !held.has(entry.hash));
  if (pending.length === 0) return;

  const sourceArtifactId = await reconcileRoadArtifact(sourceId, transaction, {
    sha256: provenance.extractSha256,
    originalUri: provenance.extractUri,
    retrievedAt: provenance.retrievedAt,
    metadataJson: {
      dataset,
      publisher: provenance.publisher,
      licence: provenance.licence,
      attribution: provenance.attribution,
      extractMd5: provenance.extractMd5,
      snapshotDate: provenance.snapshotDate,
      boundaries: provenance.boundaries,
      highwayClasses: provenance.highwayClasses,
      wayCount: provenance.wayCount,
      retrievalStrategy: 'VERSIONED_SNAPSHOT_V1',
    },
  });
  const eventDate = provenance.snapshotDate;
  const receivedAt = new Date(provenance.retrievedAt);

  const chunk = chunkSize();
  for (let start = 0; start < pending.length; start += chunk) {
    const block = pending.slice(start, start + chunk);
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
    const claims = block.map((entry, index) => ({
      factClaimId: randomUUID(),
      agentRunId,
      rawObservationId: observations[index]?.rawObservationId ?? '',
      claimType: 'FACT' as const,
      assertion: entry.assertion,
      eventDate,
      confidenceLevel: 'MEDIUM' as const,
      confidenceScore: '0.6000',
      impactLevel: 'LOW' as const,
      timeHorizon: 'STRUCTURAL' as const,
      status: 'PUBLISHED' as const,
      contentHash: claimContentHash({
        claimType: 'FACT',
        assertion: entry.assertion,
        eventDate,
      }),
      createdAt: new Date(),
    }));
    await FactClaimModel.bulkCreate(claims, { transaction });
    await ClaimEvidenceModel.bulkCreate(
      claims.map((claim) => ({
        factClaimId: claim.factClaimId,
        sourceArtifactId,
        excerpt: claim.assertion,
        excerptHash: textHash(claim.assertion),
        locator: provenance.extractUri,
        retrievedAt: receivedAt,
      })),
      { transaction },
    );
  }
}

async function loadCells(sourceId: string, agentRunId: string, transaction: Transaction) {
  const seed = await readSeed('boot/bolivia-road-network/urban-streets.json', urbanStreetsSeedSchema);
  const entries = seed.cells.map<Entry>((cell) => {
    const payload = {
      recordType: 'ROAD_STREET_CELL',
      dataCategory: 'ROAD_STREET_CELL',
      dataset: seed.dataset,
      snapshotDate: seed.provenance.snapshotDate,
      cellId: cell.cellId,
      department: cell.department,
      bounds: cell.bounds,
      streetCount: cell.streets.length,
      streets: cell.streets,
    };
    const named = cell.streets.filter((street) => street.name).length;
    return {
      payload,
      hash: rawPayloadHash(payload),
      assertion: `La celda ${cell.cellId} tiene ${cell.streets.length} calles, ${named} con nombre en OpenStreetMap.`,
    };
  });
  await insert(sourceId, agentRunId, transaction, seed.dataset, seed.provenance, entries);
}

async function loadIndex(sourceId: string, agentRunId: string, transaction: Transaction) {
  const seed = await readSeed(
    'boot/bolivia-road-network/urban-street-index.json',
    urbanStreetIndexSeedSchema,
  );
  const byCity = new Map<string, typeof seed.streets>();
  for (const street of seed.streets) {
    const held = byCity.get(street.city) ?? [];
    held.push(street);
    byCity.set(street.city, held);
  }
  const entries = [...byCity.entries()].map<Entry>(([city, streets]) => {
    const payload = {
      recordType: 'ROAD_STREET_INDEX',
      dataCategory: 'ROAD_STREET_INDEX',
      dataset: seed.dataset,
      snapshotDate: seed.provenance.snapshotDate,
      city,
      streetCount: streets.length,
      streets,
    };
    return {
      payload,
      hash: rawPayloadHash(payload),
      assertion: `OpenStreetMap nombra ${streets.length} calles en ${city}.`,
    };
  });
  await insert(sourceId, agentRunId, transaction, seed.dataset, seed.provenance, entries);
}

export async function loadUrbanStreets(
  sourceId: string,
  agentRunId: string,
  transaction: Transaction,
): Promise<void> {
  await loadCells(sourceId, agentRunId, transaction);
  await loadIndex(sourceId, agentRunId, transaction);
}
