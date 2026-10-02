import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Browser, BrowserContext } from 'playwright';
import type { CompanyAccounts } from './discover-company-accounts';
import { readFacebook } from './platforms/facebook';
import { readInstagram } from './platforms/instagram';
import { readLinkedin } from './platforms/linkedin';
import { readTiktok } from './platforms/tiktok';
import { readYoutube } from './platforms/youtube';
import { launchBrowser, openContext, pause, sleep } from './social-browser';
import { PLATFORMS, type Platform } from './social-links';
import { resembles } from './search-account';
import {
  unread,
  type AccountReading,
  type AccountTarget,
  type CollectTarget,
  type PlatformReader,
} from './social-types';

/**
 * Recolecta las cuentas oficiales de las empresas, una red por trabajador.
 *
 * Las cinco redes corren en paralelo y cada una lee sus cuentas de a una, con
 * una pausa al azar entre cuenta y cuenta: lo que una red ve es una visita
 * lenta, no una ráfaga. Si una red bloquea tres cuentas seguidas, ese
 * trabajador espera diez minutos; si vuelve a pasar, se detiene y las cuentas
 * que faltan quedan sin leer —no en cero— para la próxima corrida.
 *
 * Cada lectura se agrega a `artifacts/social-raw/<corrida>/<red>.jsonl` en el
 * momento, junto con su HTML. Una corrida cortada se reanuda con
 * `--run=<corrida>`: lo ya leído no se vuelve a pedir.
 *
 *   yarn social:collect [--only=SLUG,…] [--platforms=instagram,…] [--run=AAAA-MM-DD]
 *                       [--session=<storageState.json>] [--parallel=N]
 *
 * El texto de los comentarios queda en el archivo crudo, que no se versiona.
 * `analyze-company-social.py` lo resume y escribe la semilla.
 */

const ACCOUNTS = resolve(__dirname, 'company-accounts.json');
const RAW_ROOT = resolve(__dirname, '../../../artifacts/social-raw');

const READERS: Record<Platform, PlatformReader> = {
  facebook: readFacebook,
  instagram: readInstagram,
  tiktok: readTiktok,
  youtube: readYoutube,
  linkedin: readLinkedin,
};

/** Segundos de pausa entre cuentas: LinkedIn es la que antes pide sesión. */
const PACE: Record<Platform, readonly [number, number]> = {
  facebook: [4, 8],
  instagram: [5, 9],
  tiktok: [4, 8],
  youtube: [2, 4],
  linkedin: [8, 15],
};

const STRIKES = 3;

/**
 * --budget-minutes=N: pasado ese tiempo no se empieza ninguna cuenta nueva y el
 * navegador se cierra limpio. Permite correr la recolección en tramos cortos que
 * se retoman con el mismo --run, sin cortar una cuenta a la mitad.
 */
const BUDGET_MS =
  Number(process.argv.find((value) => value.startsWith('--budget-minutes='))?.split('=')[1] ?? 0) *
  60_000;
const STARTED = Date.now();
const outOfTime = (): boolean => BUDGET_MS > 0 && Date.now() - STARTED > BUDGET_MS;
const COOL_DOWN_MS = 10 * 60_000;

function argument(name: string): string | undefined {
  return process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3);
}

function alreadyRead(file: string): Set<string> {
  if (!existsSync(file)) return new Set();
  return new Set(
    readFileSync(file, 'utf-8')
      .split('\n')
      .filter(Boolean)
      .map((line) => (JSON.parse(line) as AccountReading).profile.slug),
  );
}

function record(runDir: string, platform: Platform, reading: AccountReading): void {
  const { html, ...rest } = reading;
  appendFileSync(join(runDir, `${platform}.jsonl`), `${JSON.stringify(rest)}\n`);
  if (html) {
    const htmlDir = join(runDir, 'html', platform);
    mkdirSync(htmlDir, { recursive: true });
    writeFileSync(join(htmlDir, `${reading.profile.slug}.html`), html);
  }
}

async function readSafely(
  context: BrowserContext,
  platform: Platform,
  target: AccountTarget,
): Promise<AccountReading> {
  try {
    return await READERS[platform](context, target);
  } catch (error: unknown) {
    const message = error instanceof Error ? (error.message.split('\n')[0] ?? 'error') : 'error';
    return unread(target, 'ERROR', message.slice(0, 200));
  }
}

/**
 * Una cuenta hallada por buscador vale sólo si el nombre que la propia cuenta
 * muestra se parece a la empresa. Si no, es de otro —un medio, un cliente, la
 * marca en otro país— y queda `NOT_FOUND`, sin cifras: no se cuenta.
 */
function owned(target: CollectTarget, reading: AccountReading): AccountReading {
  const { profile } = reading;
  if (target.origin !== 'SEARCH' || profile.status !== 'OK') return reading;
  const handle =
    target.handle.startsWith('channel/') || /^\d+$/u.test(target.handle) ? '' : target.handle;
  if (resembles(target.name, profile.displayName ?? '', handle)) return reading;
  const shown = profile.displayName ?? '?';
  return unread(
    target,
    'NOT_FOUND',
    `la cuenta hallada por buscador («${shown}») no es de la empresa`,
  );
}

async function runPlatform(
  openFresh: () => Promise<BrowserContext>,
  platform: Platform,
  targets: readonly CollectTarget[],
  runDir: string,
): Promise<void> {
  const done = alreadyRead(join(runDir, `${platform}.jsonl`));
  const pending = targets.filter((target) => !done.has(target.slug));
  let strikes = 0;
  let cooled = false;
  let context = await openFresh();
  try {
    for (const [index, target] of pending.entries()) {
      if (outOfTime()) {
        console.log(`[${platform}] fin del tramo; faltan ${pending.length - index} cuentas`);
        return;
      }
      let reading = await readSafely(context, platform, target);
      if (!context.browser()?.isConnected()) {
        // Chromium se cayó (falta de memoria): esa lectura no vale como ERROR de la
        // cuenta. Se reabre y se vuelve a leer la misma.
        await context.close().catch(() => undefined);
        context = await openFresh();
        reading = await readSafely(context, platform, target);
      }
      reading = owned(target, reading);
      record(runDir, platform, reading);
      const { status, followers } = reading.profile;
      console.log(
        `[${platform} ${index + 1}/${pending.length}] ${target.slug}: ${status} ${followers ?? ''} posts=${reading.posts.length} comentarios=${reading.comments.length}`,
      );
      strikes = status === 'BLOCKED' ? strikes + 1 : 0;
      if (strikes >= STRIKES) {
        if (cooled) {
          console.log(
            `[${platform}] bloqueada otra vez: se detiene; faltan ${pending.length - index - 1} cuentas`,
          );
          return;
        }
        console.log(`[${platform}] ${STRIKES} bloqueos seguidos: espera de 10 minutos`);
        await sleep(COOL_DOWN_MS);
        cooled = true;
        strikes = 0;
      }
      await pause(...PACE[platform]);
    }
  } finally {
    await context.close().catch(() => undefined);
  }
}

function coverage(runDir: string): void {
  for (const platform of PLATFORMS) {
    const file = join(runDir, `${platform}.jsonl`);
    if (!existsSync(file)) continue;
    const lines = readFileSync(file, 'utf-8')
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line) as AccountReading);
    const byStatus = new Map<string, number>();
    for (const line of lines)
      byStatus.set(line.profile.status, (byStatus.get(line.profile.status) ?? 0) + 1);
    const posts = lines.reduce((sum, line) => sum + line.posts.length, 0);
    const comments = lines.reduce((sum, line) => sum + line.comments.length, 0);
    console.log(
      `${platform}: ${lines.length} cuentas ${JSON.stringify(Object.fromEntries(byStatus))} posts=${posts} comentarios=${comments}`,
    );
  }
}

async function main(): Promise<void> {
  const directory = JSON.parse(readFileSync(ACCOUNTS, 'utf-8')) as { companies: CompanyAccounts[] };
  const only = argument('only')?.split(',');
  const platforms = (argument('platforms')?.split(',') ?? [...PLATFORMS]) as Platform[];
  const runId = argument('run') ?? new Date().toISOString().slice(0, 10);
  const runDir = join(RAW_ROOT, runId);
  mkdirSync(runDir, { recursive: true });

  const session = argument('session');
  // Un solo Chromium para las redes; si se cae, el primero que lo note lo reabre.
  let browser = await launchBrowser();
  let relaunching: Promise<Browser> | null = null;
  const liveBrowser = async (): Promise<Browser> => {
    if (browser.isConnected()) return browser;
    relaunching ??= launchBrowser()
      .then((fresh) => (browser = fresh))
      .finally(() => {
        relaunching = null;
      });
    return relaunching;
  };
  const openFresh = async (): Promise<BrowserContext> => openContext(await liveBrowser(), session);
  // --parallel=N: cuántas redes a la vez. Cinco es lo normal; con poca memoria, menos.
  const parallel = Math.max(
    1,
    Math.min(platforms.length, Number(argument('parallel') ?? platforms.length)),
  );
  const queue = [...platforms];
  await Promise.all(
    Array.from({ length: parallel }, async () => {
      for (let platform = queue.shift(); platform; platform = queue.shift()) {
        const targets = directory.companies
          .filter((company) => !only || only.includes(company.slug))
          .flatMap((company) => {
            const account = company.accounts[platform];
            return account
              ? [
                  {
                    slug: company.slug,
                    platform,
                    url: account.url,
                    handle: account.handle,
                    name: company.name,
                    origin: account.origin,
                  },
                ]
              : [];
          });
        await runPlatform(openFresh, platform, targets, runDir);
      }
    }),
  );
  await browser.close().catch(() => undefined);
  console.log(`\ncorrida ${runId} en ${runDir}`);
  coverage(runDir);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
