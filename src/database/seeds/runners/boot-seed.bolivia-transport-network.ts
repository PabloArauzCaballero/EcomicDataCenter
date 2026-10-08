import type { Transaction } from 'sequelize';
import { textHash } from '../../../common/hashing/canonical-hash';
import { reconcileHistoryRun } from './boot-seed.history-provenance';
import { reconcileRoadArtifact } from './boot-seed.bolivia-road-network';
import { loadRailFlows } from './boot-seed.bolivia-transport-network.flows';
import { loadRoadTransport } from './boot-seed.bolivia-transport-network.road';
import { writeTransportRows, type TransportRow } from './boot-seed.bolivia-transport-network.rows';
import {
  railNetworkSeedSchema,
  waterwaysSeedSchema,
  type BoliviaRailNetwork,
  type BoliviaWaterways,
} from '../schemas/bolivia-transport-network.schema';
import { readSeed } from './seed.utils';

/**
 * Loads the rail and river networks: geometry from the same OpenStreetMap
 * extract the road network reads, and the INE's monthly rail traffic.
 *
 * Signed by the road network's agent, not a new one: it is the same collector
 * reading the same extract with the same borders, and a second identity would
 * only split one reading of the country's transport across two names. Every
 * row is one observation, one claim and one piece of evidence, as a road
 * section is.
 *
 * `snapshotDate` rides in each payload for the reason it rides in the road
 * section's: the loader only adds, so a newer extract lands beside the older
 * one, and the views of migration 0088 show the latest alone.
 */

const AGENT_CODE = 'ROAD_NETWORK_ABC_OSM_INE';

type OsmProvenance = BoliviaRailNetwork['provenance'] | BoliviaWaterways['provenance'];

/** The extract as an artifact: created once per digest and per dataset. */
function osmArtifact(
  sourceId: string,
  dataset: string,
  provenance: OsmProvenance,
  transaction: Transaction,
) {
  return () =>
    reconcileRoadArtifact(sourceId, transaction, {
      // One extract, three datasets: the digest names the file, the suffix the reading of it.
      sha256: textHash(`${provenance.extractSha256}:${dataset}`),
      originalUri: provenance.extractUri,
      retrievedAt: provenance.retrievedAt,
      metadataJson: { dataset, ...provenance, retrievalStrategy: 'VERSIONED_SNAPSHOT_V1' },
    });
}

const km = (value: number): string => value.toFixed(1);

async function loadRailNetwork(sourceId: string, agentRunId: string, transaction: Transaction) {
  const seed = await readSeed(
    'boot/bolivia-transport-network/rail-network.json',
    railNetworkSeedSchema,
  );
  const snapshotDate = seed.provenance.snapshotDate;
  const rows: TransportRow[] = [
    ...seed.lines.map((line) => ({
      payload: {
        recordType: 'RAIL_LINE',
        dataCategory: 'RAIL_LINE',
        dataset: seed.dataset,
        snapshotDate,
        ...line,
      },
      assertion: `${line.line ?? 'Vía férrea sin nombre'} (red ${line.network.toLowerCase()}) recorre ${km(line.lengthKm)} km en ${line.department}, ${line.status.toLowerCase().replaceAll('_', ' ')}.`,
    })),
    ...seed.stations.map((station) => ({
      payload: {
        recordType: 'RAIL_STATION',
        dataCategory: 'RAIL_STATION',
        dataset: seed.dataset,
        snapshotDate,
        ...station,
      },
      assertion: `${station.kind === 'APEADERO' ? 'Apeadero' : 'Estación'} ${station.name}, red ${station.network.toLowerCase()}, en ${station.department}.`,
    })),
  ];
  await writeTransportRows(
    rows,
    {
      agentRunId,
      eventDate: snapshotDate,
      receivedAt: new Date(seed.provenance.retrievedAt),
      locator: seed.provenance.extractUri,
      transaction,
    },
    osmArtifact(sourceId, seed.dataset, seed.provenance, transaction),
  );
}

async function loadWaterways(sourceId: string, agentRunId: string, transaction: Transaction) {
  const seed = await readSeed('boot/bolivia-transport-network/waterways.json', waterwaysSeedSchema);
  const snapshotDate = seed.provenance.snapshotDate;
  const rows: TransportRow[] = [
    ...seed.waterways.map((one) => ({
      payload: {
        recordType: 'WATERWAY_LINE',
        dataCategory: 'WATERWAY_LINE',
        dataset: seed.dataset,
        snapshotDate,
        ...one,
      },
      assertion: `${one.name ?? 'Río sin nombre'} (${one.category.toLowerCase().replaceAll('_', ' ')}) recorre ${km(one.lengthKm)} km en ${one.department}.`,
    })),
    ...seed.ports.map((port) => ({
      payload: {
        recordType: 'WATER_PORT',
        dataCategory: 'WATER_PORT',
        dataset: seed.dataset,
        snapshotDate,
        ...port,
      },
      assertion: `${port.kind === 'TERMINAL' ? 'Terminal fluvial' : 'Puerto'} ${port.name ?? 'sin nombre'} en ${port.department}.`,
    })),
  ];
  await writeTransportRows(
    rows,
    {
      agentRunId,
      eventDate: snapshotDate,
      receivedAt: new Date(seed.provenance.retrievedAt),
      locator: seed.provenance.extractUri,
      transaction,
    },
    osmArtifact(sourceId, seed.dataset, seed.provenance, transaction),
  );
}

export async function reconcileBoliviaTransportNetwork(
  sourceId: string,
  transaction: Transaction,
): Promise<void> {
  const agentRunId = await reconcileHistoryRun(AGENT_CODE, transaction);
  await loadRailNetwork(sourceId, agentRunId, transaction);
  await loadWaterways(sourceId, agentRunId, transaction);
  await loadRailFlows(sourceId, agentRunId, transaction);
  await loadRoadTransport(sourceId, agentRunId, transaction);
}
