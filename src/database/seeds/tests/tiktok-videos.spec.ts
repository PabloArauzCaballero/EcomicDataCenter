import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { snapshotViewWithTrends } from '../../migration-sql/0106-read-the-video-trends.view';
import { tiktokVideosSchema } from '../schemas/tiktok-videos.schema';

/**
 * Guards the sellers' video catalogue (ADR 0031), kept apart from the lives.
 *
 * A video's caption, the account's name and TikTok's own ids would identify a person: none of them
 * may reach the seed. An unknown class or tactic is refused so a new one cannot slip in unnoticed.
 */
describe('tiktok seller videos', () => {
  const seedPath = join(__dirname, '..', 'boot', 'tiktok-videos.json');
  const load = async (): Promise<Record<string, unknown>> =>
    JSON.parse(await readFile(seedPath, 'utf8')) as Record<string, unknown>;

  it('accepts the published seed', async () => {
    const seed = tiktokVideosSchema.parse(await load());
    expect(seed.accounts.length).toBeGreaterThan(0);
    expect(
      seed.videos.every((video) => seed.accounts.some((a) => a.sellerId === video.sellerId)),
    ).toBe(true);
  });

  it('never carries a caption, a name or a real id', async () => {
    const forbidden = new Set([
      'desc',
      'caption',
      'text',
      'handle',
      'nickname',
      'bio',
      'id',
      'url',
    ]);
    const found: string[] = [];
    const walk = (value: unknown, path: string): void => {
      if (Array.isArray(value)) value.forEach((item, index) => walk(item, `${path}[${index}]`));
      else if (value && typeof value === 'object') {
        for (const [key, child] of Object.entries(value)) {
          if (forbidden.has(key)) found.push(`${path}.${key}`);
          walk(child, `${path}.${key}`);
        }
      }
    };
    walk(await load(), '$');
    expect(found).toEqual([]);
  });

  it('refuses an unknown class or tactic', async () => {
    const seed = (await load()) as { videos: Record<string, unknown>[] };
    const first = seed.videos[0];
    expect(first).toBeDefined();
    const badKind = { ...seed, videos: [{ ...first, kind: 'POLITICA' }] };
    const badTactic = { ...seed, videos: [{ ...first, tactics: ['INVENTADA'] }] };
    expect(tiktokVideosSchema.safeParse(badKind).success).toBe(false);
    expect(tiktokVideosSchema.safeParse(badTactic).success).toBe(false);
  });

  it('publishes the monthly trends and says why each year has what it has', async () => {
    const seed = tiktokVideosSchema.parse(await load());
    const { months, minN } = seed.trends;
    expect(months.length).toBeGreaterThan(0);
    // A month with fewer than minN videos carries its count and no statistic at all.
    for (const month of months.filter((m) => m.n < minN)) {
      expect([month.median, month.p95, month.trendN, month.shareRatio]).toEqual([
        null,
        null,
        null,
        null,
      ]);
    }
    for (const month of months.filter((m) => m.n >= minN)) {
      expect(month.p95).not.toBeNull();
      expect(month.p95 as number).toBeGreaterThanOrEqual(month.median as number);
    }
    expect(Object.keys(seed.coverage.por_anio)).toEqual(
      expect.arrayContaining(['2021', '2022', '2023', '2024', '2025', '2026']),
    );
  });

  it('keeps the seed under 6 MB', async () => {
    const { size } = await stat(seedPath);
    expect(size).toBeLessThan(6 * 1024 * 1024);
  });

  it('adds the trends as the last column of the snapshot view', () => {
    expect(snapshotViewWithTrends).toContain('CREATE OR REPLACE VIEW read_models.tiktok_video_snapshot');
    expect(snapshotViewWithTrends).toMatch(/AS analyzed_at,\s+ro\.payload_json -> 'trends'\s+AS trends\s+FROM/u);
  });
});
