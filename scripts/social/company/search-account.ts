import type { BrowserContext, Page } from 'playwright';
import { accountUrl, type Platform } from './social-links';
import { openContext, pause } from './social-browser';

/**
 * La cuenta de una empresa en una red, cuando su web no la enlaza: el primer
 * resultado del buscador que sea una cuenta y que se parezca a la empresa.
 *
 * Se usa Bing con la consulta «<empresa> <red>». El operador `site:` no sirve:
 * Bing lo ignora y devuelve la web de la empresa. DuckDuckGo HTML responde con
 * un desafío anti-robots. Cada resultado llega como un enlace de seguimiento
 * (`/ck/a?…&u=a1<dirección en base64url>`) que se decodifica aquí.
 *
 * El parecido se exige en el título o en el handle: al menos una palabra
 * distintiva del nombre —no «Banco», «Bolivia» ni «S.A.», que comparten
 * decenas— tiene que aparecer. Un video suelto (`tiktok.com/@cuenta/video/…`)
 * vale como pista de su cuenta. Aun así esto es una conjetura y vuelve como tal.
 */

const COMMON = new Set([
  'banco',
  'bolivia',
  'boliviana',
  'boliviano',
  'nacional',
  'empresa',
  'compania',
  'sociedad',
  'anonima',
  'grupo',
  'industrias',
  'industria',
  'servicios',
  'corporacion',
  'cooperativa',
  'ltda',
  'srl',
  'del',
  'las',
  'los',
  'para',
  'con',
  'santa',
  'cruz',
  'paz',
  'seguros',
]);

function folded(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

/** Las palabras del nombre que distinguen a la empresa de otras. */
export function distinctiveWords(name: string): string[] {
  return folded(name)
    .split(/[^a-z0-9]+/u)
    .filter((word) => word.length >= 3 && !COMMON.has(word));
}

/**
 * Un nombre hecho sólo de palabras comunes —«Banco Nacional de Bolivia»— se
 * reconoce entero o por su sigla («bnb»), nunca por una de sus palabras.
 */
export function resembles(name: string, ...evidence: string[]): boolean {
  const haystack = folded(evidence.join(' ')).replace(/[^a-z0-9]+/gu, '');
  const words = distinctiveWords(name);
  if (words.length > 0) return words.some((word) => haystack.includes(word));
  const all = folded(name)
    .split(/[^a-z0-9]+/u)
    .filter((word) => word.length >= 3);
  const initials = all.map((word) => word[0]).join('');
  const whole = folded(name).replace(/[^a-z0-9]+/gu, '');
  return (
    haystack.includes(whole) ||
    haystack.includes(all.join('')) ||
    (initials.length >= 3 && haystack.includes(initials))
  );
}

/** Sufijos de cuentas de otro país o de la marca global: no son la cuenta boliviana. */
const FOREIGN =
  /(?:^|[._-])(?:arg|argentina|peru|pe|chile|cl|mx|mexico|colombia|co|ecuador|ec|paraguay|py|uruguay|uy|usa|us|spain|es|brasil|br|global|latam|int|international)$/u;

/**
 * Una cuenta hallada por buscador vale sólo si su HANDLE se parece a la
 * empresa. El título no alcanza: Bing devuelve videos de terceros que nombran a
 * la empresa («Minera San Cristóbal» en el video de `urgente.bonoticias`), y
 * cuentas de la marca en otro país (`pluspetrol.arg`, `dhl_global`).
 */
export function plausibleHandle(name: string, handle: string): boolean {
  const plain = folded(handle).replace(/^@/u, '');
  if (FOREIGN.test(plain)) return false;
  // Un identificador opaco (canal de YouTube, página numérica de Facebook) no dice
  // nada por sí solo: pasa, y el recolector lo valida con el nombre que muestra la cuenta.
  if (/^(?:channel\/uc[\w-]+|\d{6,})$/u.test(plain)) return true;
  return resembles(name, plain);
}

/** Una búsqueda a la vez: varias en paralelo y Bing contesta con un desafío. */
let queue: Promise<unknown> = Promise.resolve();
function oneAtATime<T>(task: () => Promise<T>): Promise<T> {
  const next = queue.then(task, task);
  queue = next.catch(() => undefined);
  return next;
}

/** La dirección real detrás de un enlace de seguimiento de Bing. */
export function bingTarget(href: string): string {
  const encoded = /[?&]u=a1([^&]+)/u.exec(href)?.[1];
  if (!encoded) return href;
  return Buffer.from(encoded.replace(/-/gu, '+').replace(/_/gu, '/'), 'base64').toString('utf-8');
}

export interface SearchResult {
  readonly url: string;
  readonly title: string;
  /** El extracto que el buscador muestra bajo el título (cifras incluidas). */
  readonly snippet?: string;
}

/**
 * Los resultados de una consulta, ya con su dirección real. Una a la vez, y
 * cada una en un contexto limpio: con las cookies de cien búsquedas seguidas
 * Bing empieza a devolver la página sin resultados, y eso se leía como «la
 * empresa no tiene cuenta». Una consulta que vuelve vacía se repite una vez.
 */
export function bingResults(context: BrowserContext, query: string): Promise<SearchResult[]> {
  return oneAtATime(async () => {
    const browser = context.browser();
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      // Abrir el contexto y la página también puede fallar (Chromium caído por memoria):
      // dentro del try, para que eso sea una búsqueda vacía y no el proceso entero.
      let fresh: BrowserContext | null = null;
      let page: Page | null = null;
      try {
        fresh = browser?.isConnected() ? await openContext(browser) : context;
        page = await fresh.newPage();
        await page.goto(`https://www.bing.com/search?setlang=es&q=${encodeURIComponent(query)}`, {
          waitUntil: 'domcontentloaded',
          timeout: 30_000,
        });
        await page.waitForTimeout(1_500);
        const results = await page.$$eval('li.b_algo h2 a', (anchors) =>
          anchors.map((anchor) => ({
            href: anchor.getAttribute('href') ?? '',
            title: anchor.textContent ?? '',
            snippet:
              anchor.closest('li.b_algo')?.querySelector('.b_caption p, p')?.textContent ?? '',
          })),
        );
        if (results.length)
          return results.map((result) => ({
            url: bingTarget(result.href),
            title: result.title,
            snippet: result.snippet,
          }));
      } catch {
        // Una consulta caída vale lo mismo que una vacía: se reintenta una vez.
      } finally {
        await page?.close().catch(() => undefined);
        if (fresh && fresh !== context) await fresh.close().catch(() => undefined);
        await pause(1.5, 3.5);
      }
    }
    return [];
  });
}

export async function searchAccount(
  context: BrowserContext,
  name: string,
  platform: Platform,
): Promise<{ url: string; handle: string } | null> {
  const results = await bingResults(context, `${name} Bolivia ${platform}`);
  for (const result of results.slice(0, 6)) {
    const account = accountUrl(result.url);
    if (account?.platform === platform && plausibleHandle(name, account.handle)) {
      return { url: account.url, handle: account.handle };
    }
  }
  return null;
}
