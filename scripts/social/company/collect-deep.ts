import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { BrowserContext } from 'playwright';
import { readFacebookDeep, readYoutubeDeep, type DeepOptions } from './platforms/deep';
import { readInstagramDeep, readTiktokDeep } from './platforms/deep-search';
import { launchBrowser, openContext, pause } from './social-browser';
import type { AccountReading, AccountTarget } from './social-types';
import { completedDeepSlugs } from './deep-progress';

/**
 * Segunda pasada de profundidad sobre las cuentas ya leídas `OK` (ADR 0027).
 *
 *   tsx scripts/social/company/collect-deep.ts --run=2026-10-01 --platforms=youtube,facebook
 *       [--budget-minutes=8] [--details=8] [--list=100] [--fb-rounds=30] [--only=SLUG,…]
 *
 * Lee `<corrida>/<red>.jsonl` (la primera pasada) y escribe `<corrida>-deep/<red>.jsonl`. Las cuentas más
 * grandes primero; las ya leídas a fondo no se repiten; un tramo se retoma con el mismo comando.
 * Una red a la vez y un solo Chromium.
 */

const RAW_ROOT = resolve(__dirname, '../../../artifacts/social-raw');
const argument = (name: string): string | undefined =>
  process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3);

const run = argument('run') ?? '';
const source = join(RAW_ROOT, run);
const deepDir = join(RAW_ROOT, `${run}-deep`);
const BUDGET_MS = Number(argument('budget-minutes') ?? 0) * 60_000;
const STARTED = Date.now();
const options: DeepOptions = {
  details: Number(argument('details') ?? 8),
  listLimit: Number(argument('list') ?? 100),
  facebookRounds: Number(argument('fb-rounds') ?? 30),
  searchPosts: Number(argument('search-posts') ?? 15),
};
const only = argument('only')?.split(',');
const retryEmpty = process.argv.includes('--retry-empty');
const platforms = (argument('platforms') ?? 'youtube,facebook').split(',');
const PACE: Record<string, readonly [number, number]> = {
  youtube: [2, 4],
  facebook: [4, 8],
  tiktok: [3, 6],
  instagram: [8, 14],
};
const names = new Map(
  (
    JSON.parse(readFileSync(resolve(__dirname, 'company-accounts.json'), 'utf-8')) as {
      companies: Array<{ slug: string; name: string }>;
    }
  ).companies.map((company) => [company.slug, company.name]),
);

function readJsonl(file: string): AccountReading[] {
  if (!existsSync(file)) return [];
  const rows: AccountReading[] = [];
  for (const line of readFileSync(file, 'utf-8').split('\n')) {
    if (!line) continue;
    try {
      rows.push(JSON.parse(line) as AccountReading);
    } catch {
      // Una línea cortada por un tramo interrumpido no es lectura: se ignora.
    }
  }
  return rows;
}

const latest = (rows: AccountReading[]): Map<string, AccountReading> =>
  new Map(rows.map((row) => [row.profile.slug, row]));

async function main(): Promise<void> {
  if (!run) throw new Error('falta --run=<corrida>');
  mkdirSync(deepDir, { recursive: true });
  const browser = await launchBrowser();
  try {
    for (const platform of platforms) {
      const base = latest(readJsonl(join(source, `${platform}.jsonl`)));
      const deepFile = join(deepDir, `${platform}.jsonl`);
      const done = completedDeepSlugs(
        [...latest(readJsonl(deepFile)).values()],
        retryEmpty,
      );
      const pending = [...base.values()]
        .filter((row) => row.profile.status === 'OK' && !done.has(row.profile.slug))
        .filter((row) => !only || only.includes(row.profile.slug))
        .sort((a, b) => (b.profile.followers ?? 0) - (a.profile.followers ?? 0));
      console.log(`[${platform}-deep] pendientes ${pending.length}`);
      let context: BrowserContext = await openContext(browser);
      let index = 0;
      for (const row of pending) {
        if (BUDGET_MS > 0 && Date.now() - STARTED > BUDGET_MS) {
          console.log(`[${platform}-deep] fin del tramo; faltan ${pending.length - index}`);
          break;
        }
        index += 1;
        const target: AccountTarget = {
          slug: row.profile.slug,
          platform: row.profile.platform,
          url: row.profile.url,
          handle: row.profile.handle,
        };
        let reading: AccountReading;
        try {
          const knownIds = new Set(row.posts.map((post) => post.postId));
          reading =
            platform === 'youtube'
              ? await readYoutubeDeep(
                  context,
                  target,
                  options,
                  new Set(
                    row.posts.filter((post) => post.likes !== null).map((post) => post.postId),
                  ),
                )
              : platform === 'tiktok'
                ? await readTiktokDeep(
                    context,
                    target,
                    row.profile,
                    knownIds,
                    options.searchPosts,
                    names.get(target.slug) ?? target.handle,
                  )
                : platform === 'instagram'
                  ? await readInstagramDeep(
                      context,
                      target,
                      row.profile,
                      knownIds,
                      options.searchPosts,
                    )
                  : await readFacebookDeep(context, target, options);
        } catch (error: unknown) {
          const note = error instanceof Error ? (error.message.split('\n')[0] ?? 'error') : 'error';
          reading = {
            profile: { ...row.profile, status: 'ERROR', statusNote: note.slice(0, 200) },
            posts: [],
            comments: [],
            html: null,
          };
          await context.close().catch(() => undefined);
          context = await openContext(browser);
        }
        const rest = { ...reading, html: undefined };
        appendFileSync(deepFile, `${JSON.stringify(rest)}\n`);
        console.log(
          `[${platform}-deep ${index}/${pending.length}] ${target.slug}: ${reading.profile.status} posts ${row.posts.length}->${reading.posts.length} comentarios ${row.comments.length}->${reading.comments.length}`,
        );
        await pause(...(PACE[platform] ?? [3, 6]));
      }
      await context.close().catch(() => undefined);
    }
  } finally {
    await browser.close().catch(() => undefined);
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
