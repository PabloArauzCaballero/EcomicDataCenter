import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  roadTransportSeedSchema,
  type FareBand,
  type FleetPoint,
} from '../schemas/bolivia-transport-network.schema';
import { roadTransportRows } from '../runners/boot-seed.bolivia-transport-network.road';
import { rawPayloadHash } from '../../../common/intelligence/claim-normalizer';

describe('road transport official snapshot', () => {
  const load = async () =>
    roadTransportSeedSchema.parse(
      JSON.parse(
        await readFile(
          join(__dirname, '..', 'boot', 'bolivia-transport-network', 'road-transport.json'),
          'utf8',
        ),
      ),
    );

  it('keeps every upstream file traceable by a real sha256 digest', async () => {
    const seed = await load();

    expect(seed.sources.length).toBeGreaterThanOrEqual(8);
    expect(seed.sources.every((source) => /^[a-f0-9]{64}$/u.test(source.sha256))).toBe(true);
    expect(new Set(seed.sources.map((source) => source.key)).size).toBe(seed.sources.length);
  });

  it('holds the INE national vehicle total at both published endpoints', async () => {
    const seed = await load();
    const totals = seed.fleetPoints.filter(
      (point: FleetPoint) =>
        point.dimension === 'DEPARTMENT_SERVICE' &&
        point.department === 'BOLIVIA' &&
        point.service === 'TOTAL',
    );

    expect(totals.find((point: FleetPoint) => point.period === '2003')?.value).toBe(443_888);
    expect(totals.find((point: FleetPoint) => point.period === '2025')?.value).toBe(2_672_176);
  });

  it('makes buses, microbuses and minibuses independently selectable', async () => {
    const seed = await load();
    const publicIn2025 = (vehicleClass: string) =>
      seed.fleetPoints.find(
        (point: FleetPoint) =>
          point.dimension === 'SERVICE_CLASS' &&
          point.service === 'PUBLICO' &&
          point.vehicleClass === vehicleClass &&
          point.period === '2025',
      )?.value;

    expect(publicIn2025('BUS')).toBe(5_176);
    expect(publicIn2025('MICROBUS')).toBe(6_457);
    expect(publicIn2025('MINIBUS')).toBe(24_441);
  });

  it('marks the preliminary GNV years and preserves both event meanings', async () => {
    const seed = await load();
    const national2025 = seed.gnvPoints.filter(
      (point) => point.department === 'BOLIVIA' && point.period === '2025',
    );

    expect(national2025.map((point) => [point.metric, point.value, point.preliminary])).toEqual([
      ['CONVERSION', 14_871, true],
      ['CYLINDER_REQUALIFICATION', 21_729, true],
    ]);
    const keys = seed.gnvPoints.map((point) =>
      [
        point.metric,
        point.dimension,
        point.department,
        point.vehicleClass,
        point.period,
      ].join('|'),
    );
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('keeps the 30 ATT routes in both bands and treats unavailable classes as null', async () => {
    const seed = await load();
    const of = (regulation: FareBand['regulation']) =>
      seed.fareBands.filter((band: FareBand) => band.regulation === regulation);

    expect(of('ATT_0178_2013')).toHaveLength(30);
    expect(of('ATT_0032_2025')).toHaveLength(30);
    expect(
      of('ATT_0032_2025').find(
        (band: FareBand) => band.origin === 'ORURO' && band.destination === 'VILLAZON',
      ),
    ).toMatchObject({
      normalMin: 115,
      normalMax: 143,
      semicamaMin: null,
      semicamaMax: null,
      camaMin: null,
      camaMax: null,
    });
  });

  it('builds one typed observation per official reading without flattening its meaning', async () => {
    const seed = await load();
    const groups = roadTransportRows(seed);
    const rows = groups.flatMap((group) => group.rows);
    expect(rows).toHaveLength(seed.fleetPoints.length + seed.gnvPoints.length + seed.fareBands.length);
    expect(new Set(groups.map((group) => group.source.key))).toEqual(
      new Set(seed.sources.filter((source) => source.status === 'LOADED').map((source) => source.key)),
    );
    expect(rows.some((row) => row.payload.dataCategory === 'VEHICLE_FLEET')).toBe(true);
    expect(rows.some((row) => row.payload.dataCategory === 'GNV_ACTIVITY')).toBe(true);
    expect(rows.some((row) => row.payload.dataCategory === 'INTERCITY_FARE_BAND')).toBe(true);
    expect(new Set(rows.map((row) => rawPayloadHash(row.payload))).size).toBe(rows.length);
  });
});
