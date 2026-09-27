import type { Transaction } from 'sequelize';
import { reconcileRoadArtifact } from './boot-seed.bolivia-road-network';
import { writeTransportRows } from './boot-seed.bolivia-transport-network.rows';
import {
  railFlowsSeedSchema,
  type RailFlowPoint,
} from '../schemas/bolivia-transport-network.schema';
import { readSeed } from './seed.utils';

/**
 * The INE's rail traffic: passengers and tonnes by network, by year and by
 * month, since 1999. Split from the network loader for the reason the road
 * lengths are: one table, read on its own, citing its own download.
 *
 * Not filed under a snapshot date like the geometry: a figure the INE revises
 * comes back with a different value, and the view keeps the latest reading of
 * each network, service and period by the date it was retrieved.
 */

const UNIT: Record<RailFlowPoint['unit'], string> = { PERSONAS: 'personas', TONELADAS: 't' };

export async function loadRailFlows(
  sourceId: string,
  agentRunId: string,
  transaction: Transaction,
): Promise<void> {
  const seed = await readSeed(
    'boot/bolivia-transport-network/rail-flows.json',
    railFlowsSeedSchema,
  );
  const first = seed.points[0];
  if (!first) return;
  const rows = seed.points.map((point) => ({
    payload: {
      recordType: 'RAIL_FLOW_READING',
      dataCategory: 'RAIL_FLOW',
      dataset: seed.dataset,
      network: point.network,
      service: point.service,
      unit: point.unit,
      period: point.period,
      value: point.value,
      preliminary: point.preliminary,
      partialYear: point.partialYear,
      retrievedAt: point.retrievedAt,
    },
    assertion: `${point.excerpt} ${UNIT[point.unit]} (INE${point.preliminary ? ', preliminar' : ''})`,
  }));
  await writeTransportRows(
    rows,
    {
      agentRunId,
      eventDate: seed.provenance.retrievedAt.slice(0, 10),
      receivedAt: new Date(seed.provenance.retrievedAt),
      locator: first.sourceUrl,
      transaction,
    },
    () =>
      reconcileRoadArtifact(sourceId, transaction, {
        sha256: first.upstreamSha256,
        originalUri: first.sourceUrl,
        retrievedAt: first.retrievedAt,
        metadataJson: {
          dataset: seed.dataset,
          publisher: seed.provenance.publisher,
          originator: seed.provenance.originator,
          pageUrl: seed.provenance.pageUrl,
          retrievalStrategy: 'VERSIONED_SNAPSHOT_V1',
        },
      }),
  );
}
