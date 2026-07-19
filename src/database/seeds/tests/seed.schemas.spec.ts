import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  frequencySeedSchema,
  mockSeedSchema,
  qualityDimensionSeedSchema,
  unitSeedSchema,
} from '../schemas/seed.schemas';

function json(name: string): unknown {
  return JSON.parse(readFileSync(resolve(__dirname, '..', name), 'utf8')) as unknown;
}

describe('persistent seed catalogs', () => {
  it('validates every boot catalog', () => {
    expect(frequencySeedSchema.parse(json('boot/frequencies.json'))).toHaveLength(6);
    expect(qualityDimensionSeedSchema.parse(json('boot/quality-dimensions.json'))).toHaveLength(5);
    expect(unitSeedSchema.parse(json('boot/units.json'))).toHaveLength(4);
  });

  it('accepts only an explicitly synthetic mock aggregate', () => {
    const seed = mockSeedSchema.parse(json('mock/observatory-demo.json'));
    expect(seed.organization.code).toMatch(/^DEMO-/);
    expect(seed.artifact.storageUri).toMatch(/^mock:\/\//);
    expect(seed.artifact.metadataJson.synthetic).toBe(true);
  });

  it('rejects mock data that loses its synthetic marker', () => {
    const original = json('mock/observatory-demo.json');
    if (!original || typeof original !== 'object') throw new Error('Expected mock seed object');
    const seed = structuredClone(original) as Record<string, unknown>;
    const artifact = seed.artifact;
    if (!artifact || typeof artifact !== 'object') throw new Error('Expected artifact object');
    const metadataJson = (artifact as Record<string, unknown>).metadataJson;
    if (!metadataJson || typeof metadataJson !== 'object')
      throw new Error('Expected metadata object');
    (metadataJson as Record<string, unknown>).synthetic = false;
    expect(() => mockSeedSchema.parse(seed)).toThrow();
  });
});
