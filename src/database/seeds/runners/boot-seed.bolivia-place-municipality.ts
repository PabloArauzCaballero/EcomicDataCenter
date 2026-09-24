import { randomUUID } from 'node:crypto';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { Transaction } from 'sequelize';
import { ClaimEvidenceModel, FactClaimModel, RawObservationModel } from '../../models';
import { claimContentHash, rawPayloadHash } from '../../../common/intelligence/claim-normalizer';
import { textHash } from '../../../common/hashing/canonical-hash';
import { reconcileRoadArtifact, roadHashesAlreadyHeld } from './boot-seed.bolivia-road-network';
import {
  boliviaPlaceMunicipalitySchema,
  type BoliviaPlaceMunicipality,
  type PlaceMunicipalityAssignment,
} from '../schemas/bolivia-place-municipality.schema';
import { readSeed } from './seed.utils';

/**
 * Files the municipality of every national place whose source named no town.
 *
 * Runs inside the national place load and under the same agent run, after the
 * places themselves: an assignment names a `placeId`, and the view that joins
 * the two should never find an assignment for a place that is not there yet.
 *
 * Idempotent the way every place load is, by payload hash. A rebuilt layer that
 * moves a place to another municipality writes a second assignment rather than
 * rewriting the first, and the view keeps the newest — so a correction is a
 * reload, not a migration.
 */

const DIRECTORY = 'boot/bolivia-place-municipality';
const CHUNK = 500;

function assignmentPayload(
  seed: BoliviaPlaceMunicipality,
  row: PlaceMunicipalityAssignment,
): Record<string, unknown> {
  return {
    recordType: 'PLACE_MUNICIPALITY',
    dataCategory: 'PLACE_MUNICIPALITY',
    placeId: row.placeId,
    method: row.method,
    municipalityCode: row.municipalityCode,
    municipality: row.municipality,
    department: row.department,
    distanceMetres: row.distanceMetres,
    layerSha256: seed.provenance.layerSha256,
  };
}

/** What the register asserts, in one sentence a reader can check against a map. */
function assertionFor(row: PlaceMunicipalityAssignment): string {
  switch (row.method) {
    case 'MUNICIPIO':
      return `${row.placeId} cae dentro del municipio de ${row.municipality} (${row.municipalityCode}).`;
    case 'MUNICIPIO_CERCANO':
      return `${row.placeId} cae a ${row.distanceMetres} m del municipio de ${row.municipality} (${row.municipalityCode}), en un hueco de la capa.`;
    case 'SIN_POLIGONO':
      return `${row.placeId} no cae en ningún municipio de la capa.`;
    case 'FUERA_DE_BOLIVIA':
      return `${row.placeId} cae fuera de Bolivia.`;
  }
}

async function piecesOf(): Promise<string[]> {
  try {
    const names = await readdir(join(__dirname, '..', DIRECTORY));
    return names
      .filter((name) => name.endsWith('.json'))
      .sort()
      .map((name) => `${DIRECTORY}/${name}`);
  } catch {
    return [];
  }
}

export async function reconcilePlaceMunicipalities(
  sourceId: string,
  agentRunId: string,
  transaction: Transaction,
): Promise<void> {
  for (const piece of await piecesOf()) {
    await loadPiece(piece, sourceId, agentRunId, transaction);
  }
}

async function loadPiece(
  path: string,
  sourceId: string,
  agentRunId: string,
  transaction: Transaction,
): Promise<void> {
  const seed = await readSeed(path, boliviaPlaceMunicipalitySchema);
  const payloads = seed.assignments.map((row) => assignmentPayload(seed, row));
  const hashes = payloads.map((payload) => rawPayloadHash(payload));
  const held = await roadHashesAlreadyHeld(hashes, transaction);
  const pending = seed.assignments
    .map((row, index) => ({ row, payload: payloads[index], hash: hashes[index] }))
    .filter(
      (
        entry,
      ): entry is {
        row: PlaceMunicipalityAssignment;
        payload: Record<string, unknown>;
        hash: string;
      } => entry.payload !== undefined && entry.hash !== undefined && !held.has(entry.hash),
    );
  if (pending.length === 0) return;

  const { provenance } = seed;
  const sourceArtifactId = await reconcileRoadArtifact(sourceId, transaction, {
    sha256: provenance.layerSha256,
    originalUri: provenance.layerUri,
    retrievedAt: provenance.retrievedAt,
    metadataJson: {
      dataset: seed.dataset,
      publisher: provenance.publisher,
      originalPublisher: provenance.originalPublisher,
      layer: provenance.layer,
      licence: provenance.licence,
      countrySha256: provenance.countrySha256,
      geometryEditedOn: provenance.geometryEditedOn,
      nearestMetres: provenance.nearestMetres,
      retrievalStrategy: 'VERSIONED_SNAPSHOT_V1',
    },
  });
  const receivedAt = new Date(provenance.retrievedAt);
  const eventDate = provenance.retrievedAt.slice(0, 10);

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
      const assertion = assertionFor(entry.row);
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
        locator: provenance.layerUri,
        retrievedAt: receivedAt,
      })),
      { transaction },
    );
  }
}
