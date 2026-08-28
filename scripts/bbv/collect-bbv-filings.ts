import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Reaches back through the exchange's register of material events.
 *
 * The first capture took what the listing page's endpoint returns before it
 * runs out of patience: a hundred and twenty-three pages, six hundred filings,
 * sixty-eight days. Read as a corporate record that is not a thin sample, it is
 * a wrong answer — "the year a company restructured its debt" has no entry, and
 * a reader who asks what the exchange saw in 2021 is told nothing happened.
 * The register itself reports its own size in every response: 39,760 filings.
 * Six hundred is one and a half per cent of it.
 *
 * The endpoint pages from newest to oldest at five records a page, so history
 * is a matter of continuing to ask. This walks back until it crosses the floor
 * — the year the rest of the corpus starts — and merges what it finds into the
 * file already held, keyed by the exchange's own filing id. Re-running it
 * converges rather than duplicating, and a run that dies halfway leaves a file
 * that the next run continues from.
 *
 * The endpoint rejects a request without the nonce its listing page carries, so
 * the page is read first for it. That is the same handshake a browser performs
 * and the same register a visitor can page through by hand; nothing here reads
 * anything the site does not publish.
 *
 * Run with `yarn bbv:filings`.
 */

const SEEDS = join('src', 'database', 'seeds', 'boot');
const FILE = join(SEEDS, 'company-filings-archive.json');
const LISTING =
  'https://www.bbv.com.bo/acerca-de-la-bolsa/hechos-relevantes-y-noticias/hechos-relevantes/';
const ENDPOINT = 'https://www.bbv.com.bo/wp-admin/admin-ajax.php';
const QUERY = 'action=search-news-api&post=hechos_relevantes-bbv&type=all&paged={n}';
const UA = 'Mozilla/5.0 (compatible; ObservatorioEconomicoBO/1.0)';

/** The year the rest of the corpus starts; there is no reader for earlier. */
const FLOOR = '2020-01-01';
/** The exchange publishes from Bolivia, which does not shift. */
const OFFSET = '-04:00';
const PAUSE_MS = 220;
const RETRIES = 4;

interface Item {
  emisor: string;
  titulo: string;
  abstract: string;
  id: number;
  participante: string;
  readonly [field: string]: unknown;
}

/**
 * Name of the timestamp field as the exchange writes it.
 *
 * Read through a constant rather than declared as a property: the wire format's
 * field names are the exchange's, not ours to rename, and naming one after it
 * would carry that choice into the codebase.
 */
const FIELD_DATE = 'fecha';

interface Filing {
  filingId: number;
  filerCode: string;
  filer: string;
  subject: string;
  statedInstant: string;
  publishedAt: string;
  eventDate: string;
  url: string;
  page: number;
  pageSha256: string;
  excerpt: string;
}

interface Archive {
  provenance: {
    publisher: string;
    listingUrl: string;
    endpointUrl: string;
    query: string;
    retrievedAt: string;
  };
  filings: Filing[];
}

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** The token the listing page hands its own script; without it the endpoint answers "no permitido". */
async function readNonce(): Promise<string> {
  const html = await (await fetch(LISTING, { headers: { 'user-agent': UA } })).text();
  const nonce = /ajax_var_releases\s*=\s*\{[^}]*"nonce":"([^"]+)"/u.exec(html)?.[1];
  if (!nonce) throw new Error('la página de hechos ya no publica el nonce de su endpoint');
  return nonce;
}

/** One page of the register, with the digest of the response it was read from. */
async function readPage(
  nonce: string,
  page: number,
): Promise<{ items: Item[]; total: number; sha256: string }> {
  const body = new URLSearchParams({
    action: 'search-news-api',
    nonce,
    paged: String(page),
    search: '',
    type: 'all',
    post: 'hechos_relevantes-bbv',
    from: '',
    to: '',
    codPart: '',
  });
  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'user-agent': UA,
      'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'x-requested-with': 'XMLHttpRequest',
      referer: LISTING,
    },
    body,
  });
  if (!response.ok) throw new Error(`http ${response.status}`);
  const text = await response.text();
  const parsed: unknown = JSON.parse(text);
  const shape = parsed as { response?: Item[]; total?: number };
  if (!Array.isArray(shape.response)) throw new Error('respuesta sin lista de hechos');
  return {
    items: shape.response,
    total: Number(shape.total ?? 0),
    sha256: createHash('sha256').update(text, 'utf8').digest('hex'),
  };
}

/** Retries a page a few times: one refusal in eight thousand is not a reason to stop. */
async function readPageWithRetry(
  nonce: string,
  page: number,
): Promise<{ items: Item[]; total: number; sha256: string } | null> {
  for (let attempt = 1; attempt <= RETRIES; attempt += 1) {
    try {
      return await readPage(nonce, page);
    } catch (error) {
      if (attempt === RETRIES) {
        process.stdout.write(
          `  página ${page} no respondió tras ${RETRIES} intentos: ` +
            `${error instanceof Error ? error.message : 'error'}\n`,
        );
        return null;
      }
      await wait(PAUSE_MS * 4 * attempt);
    }
  }
  return null;
}

function toFiling(item: Item, page: number, sha256: string): Filing | null {
  const stated = item[FIELD_DATE];
  const stamp =
    typeof stated === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/u.test(stated)
      ? stated
      : null;
  if (!stamp || !Number.isInteger(item.id) || item.id <= 0) return null;
  const filer = item.participante?.trim();
  const subject = item.titulo?.trim();
  if (!filer || filer.length < 2 || !subject || subject.length < 3) return null;
  return {
    filingId: item.id,
    filerCode: (item.emisor?.trim() || 'SIN_CODIGO').slice(0, 40),
    filer: filer.slice(0, 250),
    subject: subject.slice(0, 300),
    statedInstant: stamp,
    publishedAt: `${stamp}${OFFSET}`,
    eventDate: stamp.slice(0, 10),
    url: `${LISTING}?hecho=${item.id}`,
    page,
    pageSha256: sha256,
    excerpt: JSON.stringify(item).slice(0, 4_000),
  };
}

function load(): Archive {
  if (!existsSync(FILE)) {
    return {
      provenance: {
        publisher: 'BOLSA BOLIVIANA DE VALORES',
        listingUrl: LISTING,
        endpointUrl: ENDPOINT,
        query: QUERY,
        retrievedAt: new Date().toISOString().replace(/\.\d+Z$/u, 'Z'),
      },
      filings: [],
    };
  }
  return JSON.parse(readFileSync(FILE, 'utf8')) as Archive;
}

function save(archive: Archive): void {
  archive.filings.sort((a, b) =>
    a.statedInstant === b.statedInstant
      ? a.filingId - b.filingId
      : a.statedInstant < b.statedInstant
        ? 1
        : -1,
  );
  writeFileSync(FILE, `${JSON.stringify(archive, null, 0)}\n`, 'utf8');
}

/**
 * Where to resume, so a second run does not re-walk what the first already took.
 *
 * The register is ordered newest first at a fixed five records a page, and what
 * is held is a contiguous run from the newest filing backwards, so the boundary
 * sits near `held / 5`. Starting a margin of pages before it cannot skip
 * anything: the register only grows at the front, and every filing added there
 * pushes the boundary to a *higher* page than this estimate. So the estimate is
 * always short of the truth, which is the safe direction to be wrong in — the
 * cost of being wrong is re-reading pages already held, and those deduplicate.
 */
function resumeAt(held: number): number {
  const MARGIN_PAGES = 40;
  return Math.max(1, Math.floor(held / 5) - MARGIN_PAGES);
}

async function main(): Promise<void> {
  const archive = load();
  const held = new Map(archive.filings.map((filing) => [filing.filingId, filing]));
  process.stdout.write(`ya en el archivo: ${held.size} hechos\n`);

  const nonce = await readNonce();
  let page = resumeAt(held.size);
  if (page > 1) process.stdout.write(`retomando en la página ${page}\n`);
  let added = 0;
  let empty = 0;
  let total = 0;
  let oldest = '9999-99-99';

  while (empty < 3) {
    const result = await readPageWithRetry(nonce, page);
    if (!result) {
      page += 1;
      continue;
    }
    total = result.total || total;
    if (result.items.length === 0) {
      empty += 1;
      page += 1;
      continue;
    }
    empty = 0;

    for (const item of result.items) {
      const filing = toFiling(item, page, result.sha256);
      if (!filing) continue;
      if (filing.eventDate < oldest) oldest = filing.eventDate;
      if (!held.has(filing.filingId)) {
        held.set(filing.filingId, filing);
        added += 1;
      }
    }

    if (page % 100 === 0) {
      archive.filings = [...held.values()];
      save(archive);
      process.stdout.write(
        `  página ${page}: ${held.size} hechos (${added} nuevos), más antiguo ${oldest}\n`,
      );
    }
    if (oldest < FLOOR) break;

    page += 1;
    await wait(PAUSE_MS);
  }

  archive.provenance.retrievedAt = new Date().toISOString().replace(/\.\d+Z$/u, 'Z');
  archive.filings = [...held.values()];
  save(archive);
  process.stdout.write(
    `listo: ${held.size} hechos en el archivo (${added} nuevos), ` +
      `más antiguo ${oldest}, el registro declara ${total}\n`,
  );
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : 'fallo'}\n`);
  process.exitCode = 1;
});
