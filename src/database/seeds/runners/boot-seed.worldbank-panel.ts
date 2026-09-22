import { randomUUID } from 'node:crypto';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { Op, type Transaction } from 'sequelize';
import {
  ClaimEvidenceModel,
  FactClaimModel,
  RawObservationModel,
  SourceArtifactModel,
} from '../../models';
import { reconcileHistoryRun } from './boot-seed.history-provenance';
import { textHash } from '../../../common/hashing/canonical-hash';
import { claimContentHash, rawPayloadHash } from '../../../common/intelligence/claim-normalizer';
import {
  worldBankPanelSchema,
  type WorldBankPanel,
  type WorldBankPanelSeries,
} from '../schemas/worldbank-panel.schema';
import { readSeed } from './seed.utils';

/**
 * Loads the World Development Indicators panel.
 *
 * This catalogue is three orders of magnitude larger than any other the
 * observatory holds — a million observations against the hundreds each of the
 * others carries — and that changes how it has to be written, not what it
 * means. Every other loader creates a row, a claim and an evidence record one
 * at a time, which is clear and is fine at a thousand rows. At a million it is
 * three million round trips, and against a database on another continent that
 * is days rather than minutes.
 *
 * So this one batches. The rows are the same rows: same payload, same digest,
 * same claim, same evidence pointing at the same address. What changes is that
 * a thousand of them travel per statement instead of one.
 *
 * The evidence is the figure itself, quoted with its country and year, because
 * that is what the register actually retrieved: the World Bank serves a number
 * and not a sentence about it. Writing a longer excerpt would be inventing
 * prose the publisher never wrote.
 *
 * See ADR 0024.
 */

const AGENT_CODE = 'WORLDBANK_PANEL';
const PANEL_DIR = 'boot/worldbank-panel';

/**
 * Which economies of the panel to load, when not all of them fit.
 *
 * The corpus is thirty economies and 1,28 million observations, which is about
 * 3,3 GB once every row carries its claim and its evidence. Not every database
 * this loads into has that: a hosted branch on a small plan has half a gigabyte
 * in total, and the honest response to that is to load Bolivia and as many
 * comparators as fit rather than to fail, or worse, to load a random prefix and
 * leave a reader unable to say which countries are in.
 *
 * `PANEL_COUNTRIES` names them — `PANEL_COUNTRIES=BOL,PER,CHL`. Unset, every
 * economy in the files is loaded. What is left out is left out visibly: the
 * catalogue counts countries per indicator, so a panel loaded with three shows
 * three.
 */
function wantedCountries(): ReadonlySet<string> | undefined {
  const requested = process.env.PANEL_COUNTRIES?.trim();
  if (!requested) return undefined;
  const codes = requested
    .split(',')
    .map((code) => code.trim().toUpperCase())
    .filter((code) => /^[A-Z]{3}$/u.test(code));
  return codes.length > 0 ? new Set(codes) : undefined;
}
/** Rows per statement. Large enough to matter, small enough to keep the
 *  parameter count under Postgres' limit for the widest of these tables. */
const CHUNK = 1_000;

interface Point {
  readonly country: string;
  readonly year: number;
  readonly value: number;
}

/** What the register asserts, in the narrow form every other loader uses. */
function assertionFor(series: WorldBankPanelSeries, point: Point): string {
  return `${series.indicatorName} — ${point.country} ${point.year}: ${point.value}`;
}

function payloadFor(
  panel: WorldBankPanel,
  series: WorldBankPanelSeries,
  point: Point,
): Record<string, unknown> {
  return {
    recordType: 'ANNUAL_INDICATOR',
    dataCategory: 'MACRO_PANEL',
    frequency: 'ANNUAL',
    period: String(point.year),
    eventDate: `${point.year}-12-31`,
    country: point.country,
    indicatorCode: series.indicatorCode,
    indicatorName: series.indicatorName,
    measures: [{ indicatorCode: series.indicatorCode, value: String(point.value), unit: 'NATIVE' }],
    publisher: panel.provenance.publisher,
    domain: panel.provenance.domain,
    publisherVerified: true,
    sourceTier: 'OFFICIAL',
    publicationInDocument: false,
    url: series.sourceUrl,
  };
}

/** The document each series was read from, registered once per series. */
async function reconcileSeriesArtifact(
  panel: WorldBankPanel,
  series: WorldBankPanelSeries,
  sourceId: string,
  transaction: Transaction,
): Promise<string> {
  const existing = await SourceArtifactModel.findOne({
    where: { sha256: series.sha256 },
    transaction,
  });
  if (existing) return existing.sourceArtifactId;

  const sourceArtifactId = randomUUID();
  await SourceArtifactModel.create(
    {
      sourceArtifactId,
      sourceId,
      artifactType: 'DATASET',
      originalUri: series.sourceUrl,
      storageUri: series.sourceUrl,
      mimeType: 'application/json',
      sha256: series.sha256,
      publicationDate: panel.provenance.recordedAt.slice(0, 10),
      retrievedAt: new Date(panel.provenance.recordedAt),
      metadataJson: {
        publisher: panel.provenance.publisher,
        domain: panel.provenance.domain,
        indicatorCode: series.indicatorCode,
        indicatorName: series.indicatorName,
        countries: panel.countries,
        retrievalStrategy: 'WORLDBANK_API_V2',
      },
    },
    { transaction },
  );
  return sourceArtifactId;
}

/** Which of these payload digests the register already holds. */
async function alreadyHeld(
  hashes: readonly string[],
  transaction: Transaction,
): Promise<Set<string>> {
  const held = new Set<string>();
  for (let start = 0; start < hashes.length; start += CHUNK) {
    const rows = await RawObservationModel.findAll({
      attributes: ['payloadHash'],
      where: { payloadHash: { [Op.in]: hashes.slice(start, start + CHUNK) } },
      transaction,
    });
    for (const row of rows) held.add(row.payloadHash);
  }
  return held;
}

async function loadSeries(
  panel: WorldBankPanel,
  series: WorldBankPanelSeries,
  sourceId: string,
  agentRunId: string,
  countries: ReadonlySet<string> | undefined,
  transaction: Transaction,
): Promise<number> {
  const points: Point[] = series.points
    .filter(([country]) => !countries || countries.has(country))
    .map(([country, year, value]) => ({ country, year, value }));
  if (points.length === 0) return 0;
  const payloads = points.map((point) => payloadFor(panel, series, point));
  const hashes = payloads.map((payload) => rawPayloadHash(payload));
  const held = await alreadyHeld(hashes, transaction);

  const pending = points
    .map((point, index) => ({ point, payload: payloads[index], hash: hashes[index] }))
    .filter(
      (entry): entry is { point: Point; payload: Record<string, unknown>; hash: string } =>
        entry.hash !== undefined && entry.payload !== undefined && !held.has(entry.hash),
    );
  if (pending.length === 0) return 0;

  const sourceArtifactId = await reconcileSeriesArtifact(panel, series, sourceId, transaction);
  const receivedAt = new Date(panel.provenance.recordedAt);

  for (let start = 0; start < pending.length; start += CHUNK) {
    const batch = pending.slice(start, start + CHUNK);

    const observations = await RawObservationModel.bulkCreate(
      batch.map((entry) => ({
        agentRunId,
        sourceArtifactId,
        payloadJson: entry.payload,
        payloadHash: entry.hash,
        receivedAt,
        processingStatus: 'NORMALIZED' as const,
        retryCount: 0,
      })),
      { transaction, returning: true },
    );

    const claims = batch.map((entry, index) => {
      const assertion = assertionFor(series, entry.point);
      const eventDate = `${entry.point.year}-12-31`;
      return {
        factClaimId: randomUUID(),
        agentRunId,
        rawObservationId: observations[index]?.rawObservationId ?? '',
        claimType: 'INDICATOR_READING' as const,
        assertion,
        eventDate,
        confidenceLevel: 'HIGH' as const,
        confidenceScore: '0.9000',
        impactLevel: 'MEDIUM' as const,
        timeHorizon: 'STRUCTURAL' as const,
        status: 'PUBLISHED' as const,
        contentHash: claimContentHash({ claimType: 'INDICATOR_READING', assertion, eventDate }),
        createdAt: new Date(),
      };
    });
    await FactClaimModel.bulkCreate(claims, { transaction });

    await ClaimEvidenceModel.bulkCreate(
      claims.map((claim) => ({
        factClaimId: claim.factClaimId,
        sourceArtifactId,
        // The publisher serves a number, not a sentence. The quotation is that
        // number with the country and year that identify it, which is exactly
        // what was retrieved and nothing more.
        excerpt: claim.assertion,
        excerptHash: textHash(claim.assertion),
        locator: series.sourceUrl,
        retrievedAt: receivedAt,
      })),
      { transaction },
    );
  }

  return pending.length;
}

/**
 * Loads every slice the collector wrote, in name order.
 *
 * The whole panel lands in the caller's transaction, like every other boot
 * catalogue: either the corpus is there or none of it is. That is the right
 * guarantee for a register whose value is that a figure and its provenance
 * arrive together, and it is why the load is worth batching rather than
 * splitting — a million rows in one transaction is minutes when they travel a
 * thousand at a time, and days when they travel one at a time.
 *
 * Re-running is cheap: every payload carries a digest, and a slice already held
 * is skipped without writing anything.
 */
export async function reconcileWorldBankPanel(
  sourceId: string,
  transaction: Transaction,
): Promise<number> {
  const directory = join(__dirname, '..', PANEL_DIR);
  let files: string[];
  try {
    files = (await readdir(directory)).filter((name) => name.endsWith('.json')).sort();
  } catch {
    // The panel is collected, not shipped with the repository at every size.
    // Its absence is a corpus nobody has gathered yet, not a broken load.
    return 0;
  }
  if (files.length === 0) return 0;

  const agentRunId = await reconcileHistoryRun(AGENT_CODE, transaction);
  const countries = wantedCountries();
  let loaded = 0;
  for (const file of files) {
    const panel = await readSeed(`${PANEL_DIR}/${file}`, worldBankPanelSchema);
    for (const series of panel.series) {
      loaded += await loadSeries(panel, series, sourceId, agentRunId, countries, transaction);
    }
  }
  return loaded;
}
