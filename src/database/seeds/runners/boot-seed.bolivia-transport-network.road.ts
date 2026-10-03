import type { Transaction } from 'sequelize';
import { reconcileRoadArtifact } from './boot-seed.bolivia-road-network';
import { writeTransportRows, type TransportRow } from './boot-seed.bolivia-transport-network.rows';
import {
  roadTransportSeedSchema,
  type RoadTransportSeed,
} from '../schemas/bolivia-transport-network.schema';
import { readSeed } from './seed.utils';

export interface RoadTransportGroup {
  source: RoadTransportSeed['sources'][number];
  rows: TransportRow[];
}

const label = (value: string | null): string => (value ?? 'TOTAL').replaceAll('_', ' ');

/** Pure projection used by both the loader and its contract tests. */
export function roadTransportRows(seed: RoadTransportSeed): RoadTransportGroup[] {
  const bySource = new Map<string, TransportRow[]>();
  const push = (sourceKey: string, row: TransportRow) => {
    const rows = bySource.get(sourceKey) ?? [];
    rows.push(row);
    bySource.set(sourceKey, rows);
  };

  for (const point of seed.fleetPoints) {
    push(point.sourceKey, {
      payload: {
        recordType: 'VEHICLE_FLEET_READING',
        dataCategory: 'VEHICLE_FLEET',
        dataset: seed.dataset,
        ...point,
      },
      assertion: `Parque automotor ${point.period}: ${point.value} vehiculos, ${label(point.department)}, servicio ${label(point.service)}, clase ${label(point.vehicleClass)}, capacidad ${label(point.capacityBand)}${point.preliminary ? ' (preliminar)' : ''}.`,
    });
  }
  for (const point of seed.gnvPoints) {
    push(point.sourceKey, {
      payload: {
        recordType: 'GNV_ACTIVITY_READING',
        dataCategory: 'GNV_ACTIVITY',
        dataset: seed.dataset,
        ...point,
      },
      assertion: `${point.metric === 'CONVERSION' ? 'Conversiones a GNV' : 'Recalificaciones de cilindros GNV'} ${point.period}: ${point.value}, ${label(point.department)}, clase ${label(point.vehicleClass)}${point.preliminary ? ' (preliminar)' : ''}.`,
    });
  }
  for (const band of seed.fareBands) {
    push(band.sourceKey, {
      payload: {
        recordType: 'INTERCITY_FARE_BAND_READING',
        dataCategory: 'INTERCITY_FARE_BAND',
        dataset: seed.dataset,
        ...band,
      },
      assertion: `Tarifa interdepartamental ${band.origin}-${band.destination} (${band.regulation}): normal Bs ${band.normalMin}-${band.normalMax}.`,
    });
  }

  return seed.sources
    .map((source) => ({ source, rows: bySource.get(source.key) ?? [] }))
    .filter((group) => group.rows.length > 0);
}

export async function loadRoadTransport(
  sourceId: string,
  agentRunId: string,
  transaction: Transaction,
): Promise<void> {
  const seed = await readSeed(
    'boot/bolivia-transport-network/road-transport.json',
    roadTransportSeedSchema,
  );
  for (const group of roadTransportRows(seed)) {
    const { source } = group;
    await writeTransportRows(
      group.rows,
      {
        agentRunId,
        eventDate: source.retrievedAt.slice(0, 10),
        receivedAt: new Date(source.retrievedAt),
        locator: source.url,
        transaction,
      },
      () =>
        reconcileRoadArtifact(sourceId, transaction, {
          sha256: source.sha256,
          originalUri: source.url,
          retrievedAt: source.retrievedAt,
          metadataJson: {
            dataset: seed.dataset,
            sourceKey: source.key,
            publisher: source.publisher,
            title: source.title,
            status: source.status,
            note: source.note,
            retrievalStrategy: 'VERSIONED_SNAPSHOT_V1',
          },
        }),
    );
  }
}
