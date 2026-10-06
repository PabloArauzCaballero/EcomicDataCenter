import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { pause, sleep } from '../company/social-browser';
import type { ChatItem } from './live-chat';
import { say } from './live-run';

/**
 * Lo que se lee de una página de TikTok: el muro, el feed de lives y el chat.
 */

// ----------------------------------------------------------------- muros

/** Lo que pinta la página, por texto: los selectores de TikTok cambian. */
export async function wall(page: Page): Promise<string | null> {
  const text = (
    await page
      .locator('body')
      .innerText({ timeout: 10_000 })
      .catch(() => '')
  ).slice(0, 20_000);
  if (
    /captcha|desliza|arrastra el control|verify to continue|objetos de la misma forma|selecciona \d+ objetos|rompecabezas/iu.test(
      text,
    )
  ) {
    return 'CAPTCHA';
  }
  if (/inicia sesi[oó]n para (ver|continuar)|log in to (watch|continue)/iu.test(text))
    return 'LOGIN';
  if (
    /el live ha finalizado|live ha terminado|LIVE has ended|ha finalizado el live|no est[aá] en vivo/iu.test(
      text,
    )
  ) {
    return 'ENDED';
  }
  return null;
}

// ----------------------------------------------------------- descubrimiento

export async function discoverFromFeed(
  context: BrowserContext,
  seconds: number,
): Promise<string[]> {
  const page = await context.newPage();
  const found = new Set<string>();
  try {
    await page.goto('https://www.tiktok.com/live', {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    });
    await sleep(8_000);
    const started = Date.now();
    while (Date.now() - started < seconds * 1_000) {
      for (const handle of await liveLinks(page)) found.add(handle);
      if ((await wall(page)) === 'CAPTCHA') break;
      await page.mouse.wheel(0, 1_800);
      await pause(4, 8);
    }
  } catch (error: unknown) {
    say('feed-error', { error: error instanceof Error ? error.message.slice(0, 200) : 'feed' });
  } finally {
    await page.close().catch(() => undefined);
  }
  return [...found];
}

export async function liveLinks(page: Page): Promise<string[]> {
  const hrefs = await page
    .evaluate(() =>
      [...document.querySelectorAll('a[href*="/live"]')].map((a) => (a as HTMLAnchorElement).href),
    )
    .catch(() => [] as string[]);
  return hrefs
    .map((href) => /tiktok\.com\/@([\w.]+)\/live/u.exec(href)?.[1])
    .filter((handle): handle is string => Boolean(handle));
}

// ------------------------------------------------------------------- chat

/**
 * Ojo: dentro de `evaluate` no puede haber funciones con nombre. tsx/esbuild les
 * agrega un `__name(...)` que en la página no existe, la evaluación lanza y el
 * `catch` devuelve una lista vacía: el chat sale en 0 sin ningún error a la vista.
 */
export async function readChat(page: Page): Promise<ChatItem[]> {
  return page
    .evaluate(() => {
      const container = document.querySelector('[data-e2e="live-chat-container"]') ?? document.body;
      return [...container.querySelectorAll('[data-index]')].map((node) => {
        const message = node.querySelector('[data-e2e="chat-message"]');
        const owner = node.querySelector('[data-e2e="message-owner-name"]');
        const body = message?.querySelector('div.w-full.break-words');
        return {
          idx: node.getAttribute('data-index') ?? '',
          author: (owner?.getAttribute('title') ?? owner?.textContent ?? '')
            .replace(/\s+/gu, ' ')
            .trim(),
          ownerText:
            (owner?.parentElement?.parentElement as HTMLElement | null)?.innerText
              ?.replace(/\s+/gu, ' ')
              .trim() ?? '',
          body: ((body as HTMLElement | null)?.innerText ?? '').replace(/\s+/gu, ' ').trim(),
          full: ((node as HTMLElement).innerText ?? '').replace(/\s+/gu, ' ').trim(),
          chat: Boolean(message),
        };
      });
    })
    .catch((error: unknown) => {
      say('chat-read-error', { error: error instanceof Error ? error.message.slice(0, 160) : '' });
      return [] as ChatItem[];
    });
}

export async function launch(): Promise<Browser> {
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      return await chromium.launch({
        channel: 'chrome',
        headless: true,
        args: ['--disable-blink-features=AutomationControlled', '--mute-audio'],
      });
    } catch (error: unknown) {
      say('launch-retry', {
        attempt,
        error: error instanceof Error ? error.message.slice(0, 160) : '',
      });
      await sleep(attempt * 20_000);
    }
  }
  throw new Error('Chrome no arrancó');
}
