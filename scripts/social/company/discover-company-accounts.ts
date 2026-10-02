import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { BrowserContext } from 'playwright';
import { launchBrowser, openContext } from './social-browser';
import { accountsIn, PLATFORMS, type FoundAccount, type Platform } from './social-links';
import { searchAccount } from './search-account';

/**
 * El directorio de cuentas oficiales de las empresas del ranking Merco.
 *
 * Se arma en dos pasadas y con un orden de confianza:
 *
 * 1. **La web de la empresa** (`HIGH`, o `MEDIUM` si la web es de la marca
 *    global): se abre la portada con un navegador —muchas pintan el pie con
 *    JavaScript— y se leen sus enlaces. Lo enlazó la empresa.
 * 2. **El buscador** (`LOW`): para cada red que la web no trae, el primer
 *    resultado de «<empresa> Bolivia site:<red>». Puede ser una cuenta ajena;
 *    por eso queda marcada para revisión y el recolector la lee igual, pero el
 *    tablero la muestra como no confirmada.
 *
 * Lo que una persona ya revisó (`reviewed: true`) no se pisa nunca.
 *
 *   yarn social:accounts [--only=SLUG,SLUG] [--fewer-than=N] [--domains=<company-domains.json>]
 */

const OUTPUT = resolve(__dirname, 'company-accounts.json');
const DOMAINS = resolve(
  __dirname,
  '../../../../observatorio-dashboard/scripts/company-domains.json',
);
const REGISTER = resolve(__dirname, '../../../src/database/seeds/boot/corporate-register.json');
const PARALLEL = 4;

interface DomainEntry {
  readonly domain?: string;
  readonly home?: string;
  readonly confidence?: string;
  readonly note?: string;
}

export type Confidence = 'HIGH' | 'MEDIUM' | 'LOW';

export interface AccountEntry {
  readonly url: string;
  readonly handle: string;
  readonly confidence: Confidence;
  readonly origin: 'WEBSITE' | 'SEARCH' | 'MANUAL';
  readonly reviewed?: boolean;
}

export interface CompanyAccounts {
  readonly slug: string;
  readonly name: string;
  readonly home: string | null;
  readonly checkedAt: string;
  readonly websiteStatus: 'READ' | 'UNREACHABLE' | 'NO_WEBSITE';
  readonly accounts: Partial<Record<Platform, AccountEntry>>;
}

function argument(name: string): string | undefined {
  return process.argv.find((value) => value.startsWith(`--${name}=`))?.split('=')[1];
}

function companyNames(): Map<string, string> {
  const register = JSON.parse(readFileSync(REGISTER, 'utf-8')) as {
    series: Array<{ group: string; groupLabel: string }>;
  };
  return new Map(register.series.map((series) => [series.group, series.groupLabel]));
}

function previous(): Map<string, CompanyAccounts> {
  if (!existsSync(OUTPUT)) return new Map();
  const list = JSON.parse(readFileSync(OUTPUT, 'utf-8')) as { companies: CompanyAccounts[] };
  return new Map(list.companies.map((company) => [company.slug, company]));
}

async function websiteAccounts(
  context: BrowserContext,
  home: string,
): Promise<FoundAccount[] | null> {
  const page = await context.newPage();
  try {
    await page.goto(home, { waitUntil: 'domcontentloaded', timeout: 40_000 });
    await page.waitForTimeout(3_500);
    await page.mouse.wheel(0, 20_000);
    await page.waitForTimeout(1_500);
    return accountsIn(await page.content());
  } catch {
    return null;
  } finally {
    await page.close();
  }
}

async function discover(
  context: BrowserContext,
  slug: string,
  name: string,
  domain: DomainEntry | undefined,
  kept: CompanyAccounts | undefined,
): Promise<CompanyAccounts> {
  const home = domain?.home ?? null;
  const global = /global|internacional|multinacional/iu.test(domain?.note ?? '');
  // --search-only: la web ya se leyó en una pasada anterior; sólo se buscan las redes que faltan.
  const searchOnly = process.argv.includes('--search-only');
  const found = home && !searchOnly ? await websiteAccounts(context, home) : null;
  const accounts: Partial<Record<Platform, AccountEntry>> = {};

  for (const platform of PLATFORMS) {
    const previous = kept?.accounts[platform];
    if (previous?.reviewed) {
      accounts[platform] = previous;
      continue;
    }
    const best = found?.find((account) => account.platform === platform);
    if (best) {
      accounts[platform] = {
        url: best.url,
        handle: best.handle,
        confidence: global ? 'MEDIUM' : 'HIGH',
        origin: 'WEBSITE',
      };
      continue;
    }
    // Lo que la web enlazó en una pasada anterior vale más que una búsqueda de hoy.
    if (previous?.origin === 'WEBSITE') {
      accounts[platform] = previous;
      continue;
    }
    const searched = await searchAccount(context, name, platform);
    if (searched) accounts[platform] = { ...searched, confidence: 'LOW', origin: 'SEARCH' };
    else if (previous) accounts[platform] = previous;
  }

  return {
    slug,
    name,
    home,
    checkedAt: new Date().toISOString(),
    websiteStatus:
      searchOnly && kept ? kept.websiteStatus : !home ? 'NO_WEBSITE' : found ? 'READ' : 'UNREACHABLE',
    accounts,
  };
}

/** Se guarda después de cada empresa: una pasada de una hora no se pierde por un corte. */
function save(results: Map<string, CompanyAccounts>): CompanyAccounts[] {
  const companies = [...results.values()].sort((left, right) =>
    left.slug.localeCompare(right.slug),
  );
  writeFileSync(
    OUTPUT,
    `${JSON.stringify({ generatedAt: new Date().toISOString(), companies }, null, 2)}\n`,
  );
  return companies;
}

async function main(): Promise<void> {
  const domains = JSON.parse(readFileSync(argument('domains') ?? DOMAINS, 'utf-8')) as Record<
    string,
    DomainEntry
  >;
  const names = companyNames();
  const only = argument('only')?.split(',');
  // --fewer-than=N: sólo las empresas con menos de N cuentas, para repasar las que quedaron cortas.
  const fewer = Number(argument('fewer-than') ?? 0);
  const force = process.argv.includes('--force') || Boolean(only);
  // Una pasada completa se retoma saltando lo de las últimas 12 horas; un repaso
  // (--fewer-than) saltando lo de la última hora, que es lo que él mismo ya hizo.
  const window = (fewer ? 1 : 12) * 3_600_000;
  const fresh = (checkedAt?: string): boolean => !checkedAt || Date.now() - Date.parse(checkedAt) > window;
  const kept = previous();
  const slugs = Object.keys(domains)
    .filter((slug) => !only || only.includes(slug))
    .filter((slug) => !fewer || Object.keys(kept.get(slug)?.accounts ?? {}).length < fewer)
    // Una pasada cortada se retoma: lo revisado en las últimas 12 horas no se repite (--force lo repite).
    .filter((slug) => force || fresh(kept.get(slug)?.checkedAt))
    .sort();

  // Si Chromium se cae (pasó por falta de memoria), se vuelve a abrir y la
  // empresa se intenta otra vez; una empresa que falla igual no detiene al resto.
  let browser = await launchBrowser();
  let context = await openContext(browser);
  let reopening: Promise<void> | null = null;
  const reopen = async (): Promise<void> => {
    reopening ??= (async () => {
      await browser.close().catch(() => undefined);
      browser = await launchBrowser();
      context = await openContext(browser);
    })().finally(() => {
      reopening = null;
    });
    await reopening;
  };
  const attempt = async (slug: string): Promise<CompanyAccounts | null> => {
    for (let round = 1; round <= 2; round += 1) {
      try {
        return await discover(
          context,
          slug,
          names.get(slug) ?? slug,
          domains[slug],
          kept.get(slug),
        );
      } catch (error: unknown) {
        const reason = error instanceof Error ? (error.message.split('\n')[0] ?? '') : 'error';
        console.error(`${slug}: ${reason}`);
        if (!browser.isConnected()) await reopen();
      }
    }
    return null;
  };
  const results = new Map(kept);
  let cursor = 0;
  const worker = async (): Promise<void> => {
    while (cursor < slugs.length) {
      const slug = slugs[cursor++] ?? '';
      const company = await attempt(slug);
      if (!company) continue;
      results.set(slug, company);
      save(results);
      const platforms = Object.keys(company.accounts).join(',') || '—';
      console.log(`${slug}: ${company.websiteStatus} ${platforms}`);
    }
  };
  await Promise.all(Array.from({ length: PARALLEL }, worker));
  await browser.close();

  const companies = save(results);
  const total = (platform: Platform, confidence?: Confidence): number =>
    companies.filter((company) => {
      const account = company.accounts[platform];
      return account && (!confidence || account.confidence === confidence);
    }).length;
  for (const platform of PLATFORMS) {
    console.log(
      `${platform}: ${total(platform)} (web ${total(platform, 'HIGH') + total(platform, 'MEDIUM')}, buscador ${total(platform, 'LOW')})`,
    );
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
