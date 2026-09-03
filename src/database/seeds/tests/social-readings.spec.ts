import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { socialReadingsSchema } from '../schemas/social-readings.schema';

/**
 * Guards the register of published readings about how Bolivia buys and sells.
 *
 * What would quietly ruin this catalogue is not a wrong number. It is a reading
 * whose compiler cannot be checked: a percentage attributed to nobody, or worse,
 * attributed to the platform it describes. So the tests hold the provenance and
 * the grading, which are the properties that make a reading citable, rather than
 * the values, which are whatever the compilers published.
 *
 * Since ADR 0025 the register admits commerce and nothing else, and two tests
 * below defend that narrowing — one against the subject widening again, one
 * against the register drifting back toward describing platforms instead of
 * markets.
 *
 * Whether each compiler is actually registered is checked next to the registry
 * itself, in social-reading-sources.spec.ts. The seed layer cannot import an
 * application module, and that boundary is right: a catalogue should not know
 * how publishers are verified.
 */
describe('commerce readings register', () => {
  const load = async () =>
    socialReadingsSchema.parse(
      JSON.parse(await readFile(join(__dirname, '..', 'boot', 'social-readings.json'), 'utf8')),
    );

  it('credits a compiler, never the platform a reading describes', async () => {
    // Repeated here rather than read from the source registry, which this layer
    // may not import. A reading compiled "by TikTok" about TikTok would be the
    // platform's own marketing entering the register as evidence.
    const platforms = [
      'facebook.com',
      'instagram.com',
      'tiktok.com',
      'youtube.com',
      'whatsapp.com',
      'linkedin.com',
      'x.com',
      'reddit.com',
    ];
    const { readings } = await load();

    for (const reading of readings) {
      expect(platforms).not.toContain(reading.publisherDomain);
      expect(reading.publisher.trim().length).toBeGreaterThan(2);
    }
  });

  it('serves each reading from the domain it credits', async () => {
    const { readings } = await load();

    for (const reading of readings) {
      const host = new URL(reading.url).hostname.toLowerCase();
      expect(host === reading.publisherDomain || host.endsWith(`.${reading.publisherDomain}`)).toBe(
        true,
      );
    }
  });

  it('dates every reading to a period and to a publication it can be found in', async () => {
    const { readings } = await load();

    for (const reading of readings) {
      // A reading without a reference period ages invisibly, which is the
      // failure this register is most exposed to: nothing in the system knows
      // that a 2024 channel share stopped describing 2026.
      expect(reading.referencePeriod.startsWith(reading.eventDate.slice(0, 4))).toBe(true);
      expect(reading.eventDate <= reading.publishedOn).toBe(true);
      expect(reading.publication.length).toBeGreaterThan(5);
    }
  });

  it('states a method wherever it claims high evidence', async () => {
    const { readings } = await load();
    const high = readings.filter((reading) => reading.evidenceGrade === 'HIGH');

    expect(high.length).toBeGreaterThan(0);
    for (const reading of high) {
      // HIGH means the method is declared. A figure with an empty method has
      // not earned the band, whoever published it.
      expect(reading.method.trim().length).toBeGreaterThan(20);
    }
  });

  it('admits commerce and nothing else', async () => {
    const { readings } = await load();
    const subjects = new Set(readings.map((reading) => reading.subject));

    // The schema already refuses anything else, so this fails only if somebody
    // widens the enum. That is the decision ADR 0025 wants to cost an ADR, and
    // a green suite should not be what makes it cheap.
    expect(subjects).toEqual(new Set(['COMMERCE']));
  });

  it('reads trade by its form rather than by the platform it passed through', async () => {
    const { readings } = await load();
    const byPlatform = readings.filter((reading) => reading.platform !== 'TRANSVERSAL');
    const byForm = readings.filter((reading) => reading.platform === 'TRANSVERSAL');

    // ADR 0023 §1: the 16% arriving through Marketplace means nothing without
    // the 71% buying in ferias. A register that lost the non-digital channels
    // would be platform analytics again under a commerce name, so the forms of
    // trade that no platform touches must stay the bulk of it.
    expect(byForm.length).toBeGreaterThan(byPlatform.length);
    const forms = readings.map((reading) => reading.metric).join(' ');
    for (const form of ['FAIR_', 'CONTRABAND_', 'OWN_ACCOUNT_', 'TRADITIONAL_MARKETS']) {
      expect(forms).toContain(form);
    }
  });
});
