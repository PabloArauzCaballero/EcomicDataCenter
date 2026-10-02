import type { BrowserContext } from 'playwright';
import { bingResults } from '../search-account';
import { pause } from '../social-browser';
import type { AccountReading, AccountTarget, PostReading, ProfileReading } from '../social-types';
import { readPost as readInstagramPost } from './instagram';
import { readVideo as readTiktokVideo } from './tiktok';

/**
 * Profundidad de TikTok e Instagram sin sesión. Ninguna de las dos lista más de lo que ya se leyó
 * (la grilla de TikTok termina en captcha y la de Instagram muestra doce), así que se buscan más
 * publicaciones de la misma cuenta en Bing con consultas distintas y cada una se abre suelta.
 * Las cifras de cada una salen de la propia publicación, igual que en la primera pasada.
 */

const escape = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');

async function discover(
  context: BrowserContext,
  queries: readonly string[],
  pattern: RegExp,
): Promise<string[]> {
  const found: string[] = [];
  for (const query of queries) {
    for (const result of await bingResults(context, query)) {
      const id = pattern.exec(result.url)?.[1];
      if (id && !found.includes(id)) found.push(id);
    }
  }
  return found;
}

export async function readTiktokDeep(
  context: BrowserContext,
  target: AccountTarget,
  base: ProfileReading,
  known: ReadonlySet<string>,
  limit: number,
  companyName: string,
): Promise<AccountReading> {
  const handle = target.handle;
  const own = new RegExp(`/@${escape(handle)}/video/(\\d+)`, 'iu');
  // La grilla del perfil enlaza decenas de videos antes de terminar en el captcha (el lector de
  // la primera pasada no la miraba); la página de inserción trae diez más.
  const ids: string[] = [];
  const add = (found: Iterable<string | undefined>): void => {
    for (const id of found) if (id && !ids.includes(id)) ids.push(id);
  };
  const page = await context.newPage();
  try {
    await page.goto(target.url, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await page.waitForTimeout(4_000);
    let still = 0;
    for (let round = 0; round < 16 && ids.length < limit * 2 && still < 3; round += 1) {
      const before = ids.length;
      await page.mouse.wheel(0, 3_500);
      await page.waitForTimeout(1_800);
      const hrefs = await page.$$eval('a[href*="/video/"]', (anchors) =>
        anchors.map((anchor) => anchor.getAttribute('href') ?? ''),
      );
      add(hrefs.map((href) => own.exec(href)?.[1]));
      still = ids.length === before ? still + 1 : 0;
    }
    await page.goto(`https://www.tiktok.com/embed/@${handle}`, {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    });
    await page.waitForTimeout(3_000);
    add([...(await page.content()).matchAll(/\/video\/(\d{15,})/gu)].map((match) => match[1]));
  } catch {
    // Una grilla caída no tira la cuenta: queda lo que Bing encuentre.
  } finally {
    await page.close().catch(() => undefined);
  }
  add(
    await discover(
      context,
      [`@${handle} tiktok video`, `${companyName} tiktok video oficial`],
      new RegExp(`tiktok\\.com/@${escape(handle)}/video/(\\d+)`, 'iu'),
    ),
  );
  const posts: PostReading[] = [];
  for (const id of ids.filter((candidate) => !known.has(candidate)).slice(0, limit)) {
    await pause(1, 2);
    const video = await readTiktokVideo(
      context,
      target,
      `https://www.tiktok.com/@${handle}/video/${id}`,
    );
    if (video) posts.push(video);
  }
  return { profile: base, posts, comments: [], html: null };
}

export async function readInstagramDeep(
  context: BrowserContext,
  target: AccountTarget,
  base: ProfileReading,
  known: ReadonlySet<string>,
  limit: number,
): Promise<AccountReading> {
  const handle = target.handle;
  const codes = await discover(
    context,
    [
      `instagram.com/${handle}/p`,
      `instagram.com/${handle}/reel`,
      `"${handle}" instagram reel`,
      `"${handle}" instagram 2026`,
    ],
    new RegExp(`instagram\\.com/${escape(handle)}/(?:p|reel|tv)/([A-Za-z0-9_-]+)`, 'iu'),
  );
  const posts: PostReading[] = [];
  // Una a la vez y con pausa larga: Instagram es la red que más pronto responde 429.
  for (const code of codes.filter((candidate) => !known.has(candidate)).slice(0, limit)) {
    await pause(4, 8);
    const post = await readInstagramPost(context, target, `https://www.instagram.com/p/${code}/`);
    if (post) posts.push(post);
  }
  return { profile: base, posts, comments: [], html: null };
}
