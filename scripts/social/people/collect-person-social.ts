import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { readFacebook } from '../company/platforms/facebook';
import { readInstagram } from '../company/platforms/instagram';
import { readLinkedin } from '../company/platforms/linkedin';
import { readTiktok } from '../company/platforms/tiktok';
import { readYoutube } from '../company/platforms/youtube';
import { launchBrowser, openContext, pause } from '../company/social-browser';
import { accountUrl, type Platform } from '../company/social-links';
import { unread, type AccountReading, type AccountTarget, type PlatformReader } from '../company/social-types';

/** Raw readings remain in artifacts; the public seed requires identity review. */
const SHORTLIST = resolve(__dirname, 'shortlist.json');
const YOUTUBE_LEADS = resolve(__dirname, 'youtube-leads.json');
const RAW = resolve(__dirname, '../../../artifacts/people-social-raw');
const READERS: Record<Platform, PlatformReader> = {
  facebook: readFacebook, instagram: readInstagram, tiktok: readTiktok,
  youtube: readYoutube, linkedin: readLinkedin,
};

interface Person {
  readonly slug: string;
  readonly name: string;
  readonly accounts?: Partial<Record<Platform, { url: string; confidence: string; sourceUrl: string }>>;
}

interface YoutubeLead {
  readonly status: string;
  readonly channels: readonly { readonly url: string; readonly displayName: string }[];
}

function folded(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/gu, '').toUpperCase().replace(/[^A-Z0-9]+/gu, ' ').trim();
}

function argument(name: string): string | undefined {
  return process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3);
}

function completed(file: string): Set<string> {
  if (!existsSync(file)) return new Set();
  return new Set(readFileSync(file, 'utf-8').split('\n').filter(Boolean).map((line) =>
    (JSON.parse(line) as AccountReading).profile.slug));
}

async function main(): Promise<void> {
  const run = argument('run') ?? new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(run)) throw new Error('run must be YYYY-MM-DD');
  const platforms = (argument('platforms')?.split(/[\s,]+/u) ?? Object.keys(READERS)) as Platform[];
  if (platforms.some((platform) => !(platform in READERS))) throw new Error('unknown platform');
  const only = new Set(argument('only')?.split(/[\s,]+/u) ?? []);
  const includeYoutubeLeads = process.argv.includes('--pilot-youtube-leads');
  const max = Number(argument('max') ?? Number.MAX_SAFE_INTEGER);
  const people = (JSON.parse(readFileSync(SHORTLIST, 'utf-8')) as { people: Person[] }).people;
  const youtubeLeads = includeYoutubeLeads
    ? (JSON.parse(readFileSync(YOUTUBE_LEADS, 'utf-8')) as { people: Record<string, YoutubeLead> }).people
    : {};
  const runDir = join(RAW, run);
  mkdirSync(runDir, { recursive: true });
  const browser = await launchBrowser();
  const context = await openContext(browser);
  let count = 0;
  try {
    for (const person of people) {
      if (only.size && !only.has(person.slug)) continue;
      for (const platform of platforms) {
        if (count >= max) break;
        let linked = person.accounts?.[platform];
        if (!linked && platform === 'youtube' && includeYoutubeLeads) {
          const lead = youtubeLeads[person.slug];
          const channel = lead?.status === 'LEADS_UNVERIFIED'
            ? lead.channels.find((item) => folded(item.displayName) === folded(person.name))
            : undefined;
          if (channel) linked = { url: channel.url, confidence: 'UNVERIFIED_YOUTUBE_SEARCH', sourceUrl: YOUTUBE_LEADS };
        }
        if (!linked || !['UNVERIFIED_WIKIDATA', 'UNVERIFIED_YOUTUBE_SEARCH'].includes(linked.confidence)) continue;
        const parsed = accountUrl(linked.url);
        if (parsed?.platform !== platform) continue;
        const file = join(runDir, `${platform}.jsonl`);
        if (completed(file).has(person.slug)) continue;
        const target: AccountTarget = { slug: person.slug, platform, url: parsed.url, handle: parsed.handle };
        let reading: AccountReading;
        try {
          reading = await READERS[platform](context, target);
        } catch (error: unknown) {
          const note = error instanceof Error ? error.message.split('\n')[0] ?? 'error' : 'error';
          reading = unread(target, 'ERROR', note.slice(0, 200));
        }
        const { html, ...publicShape } = reading;
        appendFileSync(file, `${JSON.stringify(publicShape)}\n`);
        if (html) {
          const htmlDir = join(runDir, 'html', platform);
          mkdirSync(htmlDir, { recursive: true });
          writeFileSync(join(htmlDir, `${person.slug}.html`), html);
        }
        count += 1;
        process.stdout.write(`${person.name} ${platform}: ${reading.profile.status}, ${reading.posts.length} posts, ${reading.comments.length} comments\n`);
        await pause(3, 6);
      }
      if (count >= max) break;
    }
  } finally {
    await context.close();
    await browser.close();
  }
  process.stdout.write(`accounts attempted ${count}\n`);
}

void main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
