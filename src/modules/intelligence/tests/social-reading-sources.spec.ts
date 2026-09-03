import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { socialReadingsSchema } from '../../../database/seeds/schemas/social-readings.schema';
import { verifiedSource } from '../verified-source-registry';

/**
 * Holds the commerce reading catalogue to the source registry that vouches for it.
 *
 * Every reading is loaded with `publisherVerified: true`, and that flag is only
 * honest if the domain it names is actually registered. Nothing in the seed
 * layer can check it — the architecture boundary forbids a catalogue from
 * importing the registry, correctly — so the check lives here, beside the thing
 * being defended.
 *
 * The failure this prevents is quiet and total: a reading citing an
 * unregistered domain would enter the register asserting a verified publisher
 * that the system cannot establish.
 */
describe('commerce reading sources', () => {
  const catalogue = join(
    __dirname,
    '..',
    '..',
    '..',
    'database',
    'seeds',
    'boot',
    'social-readings.json',
  );

  const load = async () =>
    socialReadingsSchema.parse(JSON.parse(await readFile(catalogue, 'utf8')));

  it('registers every domain the catalogue credits, under the name it uses', async () => {
    const { readings } = await load();

    for (const reading of readings) {
      const source = verifiedSource(`https://${reading.publisherDomain}/`);
      expect(source).toBeDefined();
      expect(source?.publisher).toBe(reading.publisher);
    }
  });

  it('never accepts a platform as the compiler of a reading', async () => {
    const { readings } = await load();

    // ADR 0025 removed the platform domains from the registry outright, so a
    // reading crediting one no longer resolves to a source at all. The check
    // asserts that consequence rather than a tier: what the catalogue credits
    // must be establishable, and a platform must not be.
    for (const reading of readings) {
      expect(verifiedSource(`https://${reading.publisherDomain}/`)).toBeDefined();
    }
    for (const platform of ['facebook.com', 'instagram.com', 'tiktok.com', 'x.com']) {
      expect(verifiedSource(`https://${platform}/`)).toBeUndefined();
    }
  });

  it('draws its compilers from the tiers that attribute without measuring', async () => {
    const { readings } = await load();
    const tiers = new Set(
      readings.map((reading) => verifiedSource(`https://${reading.publisherDomain}/`)?.tier),
    );

    // A commerce reading may be compiled by a research firm, a trade body, a
    // newsroom or an institution. What none of them buys is entry into a
    // series: that is gated on OFFICIAL by the two checks in the registry, and
    // no reading in this catalogue is an indicator submission at all.
    for (const tier of tiers) {
      expect(['OFFICIAL', 'SECTOR', 'PRESS']).toContain(tier);
    }
    expect(tiers.has('SECTOR')).toBe(true);
  });
});
