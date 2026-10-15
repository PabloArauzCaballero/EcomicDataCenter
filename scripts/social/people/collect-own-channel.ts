/**
 * Comentarios en los últimos videos del canal propio de YouTube de cada persona del ranking.
 *
 * Es la medida «su público» (ver collect_conversation.py --own): la única que existe sin sesión para un creador,
 * porque su contenido vive en TikTok e Instagram y nadie lo nombra en un título. El cliente HTTP de Python recibe
 * 429 en las páginas de video; un navegador real las carga, así que se lee con el mismo Chromium que el recolector
 * de empresas, despacio y sin esquivar nada: ante un 429 o un captcha se detiene y deja lo ya leído.
 *
 * Salida: artifacts/people-conversation-raw-own.jsonl, una línea por persona, el formato que lee
 * analyze_conversation.py. Se puede interrumpir y repetir: salta a quien ya está.
 *
 *   npx tsx scripts/social/people/collect-own-channel.ts [--max=N] [--videos=8]
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { launchBrowser, openContext, pause } from '../company/social-browser';

const ROOT = join(__dirname, '..', '..', '..');
const RANKING = join(__dirname, 'ranking-top300.json');
const OUT = join(ROOT, 'artifacts', 'people-conversation-raw-own.jsonl');
const COMMENTS_PER_VIDEO = 150;

interface RankedPerson {
  slug: string;
  name: string;
  adultReview: string;
  sector: string;
  verifiedAccounts: Array<{ platform: string; url?: string }>;
}

interface VideoRead {
  videoId: string;
  title: string;
  published: string | null;
  comments: string[];
}

const arg = (name: string, fallback: number): number => {
  const raw = process.argv.find((item) => item.startsWith(`--${name}=`));
  return raw ? Number(raw.split('=')[1]) : fallback;
};

const WALK_SCRIPT = `(() => {
  var found = [];
  var seen = {};
  function walk(node) {
    if (Array.isArray(node)) { node.forEach(walk); return; }
    if (!node || typeof node !== 'object') return;
    var lockup = node.lockupViewModel;
    if (lockup && lockup.contentType === 'LOCKUP_CONTENT_TYPE_VIDEO') {
      var id = String(lockup.contentId || '');
      var meta = lockup.metadata && lockup.metadata.lockupMetadataViewModel;
      var age = /"content":"(hace [^"]+|[^"]*ago)"/.exec(JSON.stringify(lockup));
      if (id && !seen[id]) {
        seen[id] = true;
        found.push({ id: id, title: (meta && meta.title && meta.title.content) || '', published: age ? age[1] : null });
      }
    }
    var video = node.videoRenderer;
    if (video && typeof video.videoId === 'string' && !seen[video.videoId]) {
      seen[video.videoId] = true;
      var runs = (video.title && video.title.runs) || [];
      found.push({ id: video.videoId, title: runs.map(function (r) { return r.text || ''; }).join(''),
                   published: (video.publishedTimeText && video.publishedTimeText.simpleText) || null });
    }
    Object.values(node).forEach(walk);
  }
  walk(window.ytInitialData);
  return found;
})()`;

class RateLimited extends Error {}

const readJsonl = (path: string): Array<{ slug: string }> =>
  existsSync(path)
    ? readFileSync(path, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line) as { slug: string })
    : [];

async function listVideos(
  context: Awaited<ReturnType<typeof openContext>>,
  channel: string,
  limit: number,
): Promise<Array<{ id: string; title: string; published: string | null }>> {
  const page = await context.newPage();
  try {
    const response = await page.goto(`${channel.replace(/\/$/, '')}/videos`, {
      waitUntil: 'domcontentloaded',
      timeout: 45_000,
    });
    if (response?.status() === 429) throw new RateLimited(channel);
    await page.waitForTimeout(3_000);
    // La grilla de la pestaña Videos viene en `ytInitialData`: `lockupViewModel` (diseño nuevo) o `videoRenderer`.
    // Se pasa como cadena: tsx inyecta `__name` en las funciones y la página no lo conoce.
    const cards = (await page.evaluate(WALK_SCRIPT)) as Array<{
      id: string;
      title: string;
      published: string | null;
    }>;
    return cards.slice(0, limit);
  } finally {
    await page.close();
  }
}

async function readComments(
  context: Awaited<ReturnType<typeof openContext>>,
  id: string,
): Promise<string[]> {
  const page = await context.newPage();
  try {
    const response = await page.goto(`https://www.youtube.com/watch?v=${id}`, {
      waitUntil: 'domcontentloaded',
      timeout: 45_000,
    });
    if (response?.status() === 429) throw new RateLimited(id);
    await page.waitForTimeout(3_000);
    if (await page.$('form[action*="consent"], #captcha-form, iframe[src*="recaptcha"]')) {
      throw new RateLimited(`${id} (captcha o consentimiento)`);
    }
    await page.evaluate(() => window.scrollBy(0, 700));
    await page.waitForTimeout(2_500);
    let comments: string[] = [];
    let still = 0;
    for (let round = 0; round < 16 && comments.length < COMMENTS_PER_VIDEO && still < 2; round += 1) {
      await page.evaluate(() => window.scrollBy(0, 2_000));
      await page.waitForTimeout(1_400);
      const seen = comments.length;
      comments = await page.$$eval('ytd-comment-thread-renderer #content-text', (nodes) =>
        nodes.map((node) => node.textContent?.trim() ?? '').filter(Boolean),
      );
      still = comments.length === seen ? still + 1 : 0;
    }
    return comments.slice(0, COMMENTS_PER_VIDEO);
  } finally {
    await page.close();
  }
}

async function main(): Promise<void> {
  const ranking = (JSON.parse(readFileSync(RANKING, 'utf8')) as { people: RankedPerson[] }).people;
  const done = new Set(readJsonl(OUT).map((row) => row.slug));
  // Mismas reglas que collect_conversation.py: sin menores conocidos; MEDIA/POLITICS/BUSINESS sin fecha de nacimiento.
  const eligible = (person: RankedPerson): boolean =>
    person.adultReview === 'ADULT_BY_WIKIDATA_BIRTH' ||
    (person.adultReview === 'UNKNOWN' && ['POLITICS', 'BUSINESS', 'MEDIA'].includes(person.sector));
  const todo = ranking
    .filter((person) => eligible(person) && !done.has(person.slug))
    .map((person) => ({
      person,
      channel: person.verifiedAccounts.find((a) => a.platform === 'youtube' && a.url)?.url ?? null,
    }))
    .filter((item): item is { person: RankedPerson; channel: string } => item.channel !== null)
    .slice(0, arg('max', 1_000));
  const videosPerChannel = arg('videos', 8);
  console.log(`${todo.length} canales propios por leer`);
  mkdirSync(dirname(OUT), { recursive: true });

  const browser = await launchBrowser();
  const context = await openContext(browser);
  let written = 0;
  try {
    for (const { person, channel } of todo) {
      const videos: VideoRead[] = [];
      for (const card of await listVideos(context, channel, videosPerChannel)) {
        videos.push({
          videoId: card.id,
          title: card.title,
          published: card.published,
          comments: await readComments(context, card.id),
        });
        await pause(4, 8);
      }
      const total = videos.reduce((sum, video) => sum + video.comments.length, 0);
      console.log(`${person.name}: ${videos.length} videos, ${total} comentarios`);
      // Sin ningún comentario en ningún video casi siempre es un límite o un canal sin comentarios habilitados:
      // no se guarda como leído para que se repita en la próxima corrida.
      if (total > 0) {
        appendFileSync(OUT, `${JSON.stringify({ slug: person.slug, channel, videos })}\n`);
        written += 1;
      }
      await pause(6, 12);
    }
  } catch (error: unknown) {
    if (error instanceof RateLimited) {
      console.log(`DETENIDO por límite de YouTube en ${error.message}. Lo leído hasta aquí ya está guardado.`);
    } else {
      throw error;
    }
  } finally {
    await context.close();
    await browser.close();
  }
  console.log(`${written} canales guardados en ${OUT}`);
}

void main();
