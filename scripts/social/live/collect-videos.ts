import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { freemem } from 'node:os';
import { join } from 'node:path';
import type { BrowserContext, Response } from 'playwright';
import { openContext, pause, sleep } from '../company/social-browser';
import { launch, wall } from './live-page';
import { commerceScore, kindOf, pseudonym, sellerKey } from './live-room';

/**
 * Historia de videos de los vendedores de lives y de cuentas parecidas (catálogo «videos», aparte de
 * los lives; ADR 0031).
 *
 * Sin sesión, como el resto: el perfil entrega sus ~16-35 videos más recientes por la API de la grilla
 * (`api/post/item_list`) y después pide iniciar sesión. Se guarda lo que esa API devuelve —fecha
 * exacta, descripción, cifras— y las cuentas que el perfil sugiere, que son la vía para encontrar
 * vendedores parecidos que apuntan al mismo público.
 *
 *   tsx scripts/social/live/collect-videos.ts --max-accounts=250 --depth=2
 *
 * Escribe en `artifacts/video-raw/<fecha>/` (fuera de Git): `videos.jsonl`, `profiles.jsonl` y
 * `similar.jsonl`. Se reanuda: una cuenta ya leída en la corrida no se vuelve a abrir.
 */

type Json = Record<string, unknown>;

const ROOT = process.cwd();
const RUN = new Date(Date.now() - 4 * 3_600_000).toISOString().slice(0, 10);
const OUT = join(ROOT, 'artifacts', 'video-raw', RUN);
const LIVE_RAW = join(ROOT, 'artifacts', 'live-raw');

function flag(name: string, fallback: number): number {
  const raw = process.argv.find((arg) => arg.startsWith(`--${name}=`))?.split('=')[1];
  const parsed = Number(raw);
  return raw && Number.isFinite(parsed) ? parsed : fallback;
}

const MAX_ACCOUNTS = flag('max-accounts', 250);
const DEPTH = flag('depth', 2);
const MIN_FREE_MB = flag('min-free-mb', 900);

function log(file: string, row: Json): void {
  appendFileSync(join(OUT, file), `${JSON.stringify(row)}\n`, 'utf8');
}

function readJsonl(path: string): Json[] {
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Json);
}

const text = (value: unknown): string => (typeof value === 'string' ? value : '');

/** Las cuentas de partida: las que se vieron en vivo vendiendo, cocinando o entreteniendo. */
function seedAccounts(): string[] {
  const handles = new Set<string>();
  if (!existsSync(LIVE_RAW)) return [];
  for (const night of readdirSync(LIVE_RAW).filter((name) => /^\d{4}-\d{2}-\d{2}$/u.test(name))) {
    for (const row of readJsonl(join(LIVE_RAW, night, 'candidates.jsonl'))) {
      const state = {
        title: text(row.title),
        nickname: text(row.nickname),
        bio: text(row.bio),
        handle: text(row.handle),
      };
      if (state.handle && kindOf(commerceScore(state))) handles.add(state.handle);
    }
  }
  return [...handles];
}

function videoRow(item: Json, handle: string, origin: string): Json | null {
  const id = typeof item.id === 'string' ? item.id : null;
  if (!id) return null;
  const stats = (item.statsV2 ?? item.stats ?? {}) as Json;
  const video = (item.video ?? {}) as Json;
  const number = (value: unknown): number | null => {
    const parsed = typeof value === 'string' ? Number(value) : value;
    return typeof parsed === 'number' && Number.isFinite(parsed) ? parsed : null;
  };
  return {
    handle,
    origin,
    id,
    createTime: number(item.createTime),
    desc: typeof item.desc === 'string' ? item.desc : '',
    duration: number(video.duration),
    plays: number(stats.playCount),
    likes: number(stats.diggCount),
    comments: number(stats.commentCount),
    shares: number(stats.shareCount),
    saves: number(stats.collectCount),
    isAd: Boolean(item.isAd),
    imagePost: Boolean(item.imagePost),
    hashtags: ((item.challenges ?? []) as Json[])
      .map((challenge) => challenge.title)
      .filter((title): title is string => typeof title === 'string'),
  };
}

async function readAccount(
  context: BrowserContext,
  handle: string,
  origin: string,
): Promise<{ videos: number; similar: string[]; status: string }> {
  const page = await context.newPage();
  const videos: Json[] = [];
  const similar = new Set<string>();
  let profile: Json | null = null;
  const onResponse = async (response: Response): Promise<void> => {
    const url = response.url();
    try {
      if (url.includes('/api/post/item_list')) {
        const body = (await response.json()) as { itemList?: Json[] };
        for (const item of body.itemList ?? []) {
          const row = videoRow(item, handle, origin);
          if (row) videos.push(row);
        }
      } else if (/\/api\/(recommend\/user|user\/recommend|related)/u.test(url)) {
        const body = (await response.json()) as { userList?: { user?: Json }[] };
        for (const entry of body.userList ?? []) {
          const unique = entry.user?.uniqueId;
          if (typeof unique === 'string') similar.add(unique);
        }
      }
    } catch {
      // una respuesta que no es JSON no cuenta
    }
  };
  page.on('response', (response) => void onResponse(response));
  try {
    await page.goto(`https://www.tiktok.com/@${handle}`, {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    });
    await sleep(7_000);
    const html = await page.content();
    const raw = /id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/u.exec(
      html,
    )?.[1];
    if (raw) {
      const scope = (JSON.parse(raw) as { __DEFAULT_SCOPE__?: Json }).__DEFAULT_SCOPE__ ?? {};
      const info = (scope['webapp.user-detail'] as Json | undefined)?.userInfo as Json | undefined;
      if (info) profile = info;
    }
    for (let round = 0; round < DEPTH * 3; round += 1) {
      if ((await wall(page)) === 'CAPTCHA') break;
      await page.mouse.wheel(0, 3_000);
      await sleep(2_500);
    }
    // Las sugeridas aparecen en el DOM aunque no pasen por una API conocida.
    const linked = await page
      .evaluate(() =>
        [...document.querySelectorAll('a[href^="/@"], a[href*="tiktok.com/@"]')].map(
          (anchor) => (anchor as HTMLAnchorElement).getAttribute('href') ?? '',
        ),
      )
      .catch(() => [] as string[]);
    for (const href of linked) {
      const unique = /\/@([\w.]+)(?:\?|$|\/?$)/u.exec(href)?.[1];
      if (unique && unique !== handle) similar.add(unique);
    }
  } catch (error: unknown) {
    await page.close().catch(() => undefined);
    return { videos: 0, similar: [], status: error instanceof Error ? 'ERROR' : 'ERROR' };
  }
  await page.close().catch(() => undefined);
  const user = (profile?.user ?? {}) as Json;
  const stats = (profile?.statsV2 ?? profile?.stats ?? {}) as Json;
  log('profiles.jsonl', {
    handle,
    origin,
    at: new Date().toISOString(),
    nickname: user.nickname ?? null,
    bio: user.signature ?? null,
    verified: Boolean(user.verified),
    followers: Number(stats.followerCount ?? NaN) || null,
    hearts: Number(stats.heartCount ?? stats.heart ?? NaN) || null,
    videoCount: Number(stats.videoCount ?? NaN) || null,
    videosRead: videos.length,
  });
  const seen = new Set<string>();
  for (const row of videos) {
    if (seen.has(String(row.id))) continue;
    seen.add(String(row.id));
    log('videos.jsonl', row);
  }
  for (const other of similar) log('similar.jsonl', { from: handle, handle: other });
  return { videos: seen.size, similar: [...similar], status: profile ? 'OK' : 'SIN_PERFIL' };
}

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  const done = new Set(readJsonl(join(OUT, 'profiles.jsonl')).map((row) => String(row.handle)));
  const key = sellerKey();
  const queue: { handle: string; origin: string }[] = seedAccounts().map((handle) => ({
    handle,
    origin: 'LIVE',
  }));
  for (const row of readJsonl(join(OUT, 'similar.jsonl'))) {
    queue.push({ handle: String(row.handle), origin: 'SIMILAR' });
  }
  const browser = await launch();
  const context = await openContext(browser);
  let read = done.size;
  console.log(JSON.stringify({ run: RUN, seeds: queue.length, alreadyRead: done.size }));
  while (queue.length && read < MAX_ACCOUNTS) {
    const next = queue.shift();
    if (!next || done.has(next.handle)) continue;
    while (Math.round(freemem() / 1_048_576) < MIN_FREE_MB) await sleep(30_000);
    done.add(next.handle);
    const result = await readAccount(context, next.handle, next.origin);
    read += 1;
    console.log(
      JSON.stringify({
        n: read,
        seller: pseudonym(next.handle, key),
        origin: next.origin,
        videos: result.videos,
        similar: result.similar.length,
        status: result.status,
      }),
    );
    // Las cuentas parecidas entran al final de la cola: primero se agotan las que se vieron en vivo.
    for (const other of result.similar)
      if (!done.has(other)) queue.push({ handle: other, origin: 'SIMILAR' });
    await pause(3, 7);
  }
  await browser.close();
  console.log(JSON.stringify({ run: RUN, accountsRead: read }));
}

void main();
