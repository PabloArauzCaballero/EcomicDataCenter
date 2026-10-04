import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  validateVehicleSnapshot,
  vehicleOffersSeedSchema,
  vehicleSourcesSeedSchema,
} from '../schemas/vehicle-prices.schema';

async function seed<T>(name: string, schema: { parse(value: unknown): T }): Promise<T> {
  const raw = await readFile(join(__dirname, '..', 'boot', name), 'utf8');
  return schema.parse(JSON.parse(raw) as unknown);
}

describe('ofertas de vehículos nuevos', () => {
  it('conserva precio, versión, año y huella de la página oficial en cada oferta', async () => {
    const offers = await seed('vehicle-prices.json', vehicleOffersSeedSchema);
    const sources = await seed('vehicle-price-sources.json', vehicleSourcesSeedSchema);
    expect(offers).toHaveLength(36);
    expect(sources).toHaveLength(14);
    expect(() => validateVehicleSnapshot(offers, sources)).not.toThrow();
    expect(new Set(offers.map((offer) => offer.currency))).toEqual(new Set(['USD']));
    expect(offers.every((offer) => offer.price > 0 && offer.modelYear > 0)).toBe(true);
  });

  it('rechaza una captura ausente, otra fecha y dos montos para la misma oferta', async () => {
    const offers = await seed('vehicle-prices.json', vehicleOffersSeedSchema);
    const sources = await seed('vehicle-price-sources.json', vehicleSourcesSeedSchema);
    const first = offers[0]!;
    expect(() => validateVehicleSnapshot([{ ...first, source: 'https://example.org/missing' }], sources)).toThrow();
    expect(() => validateVehicleSnapshot([{ ...first, observedAt: '2026-10-02' }], sources)).toThrow();
    expect(() => validateVehicleSnapshot([first, { ...first, price: first.price + 100 }], sources)).toThrow();
  });
});
