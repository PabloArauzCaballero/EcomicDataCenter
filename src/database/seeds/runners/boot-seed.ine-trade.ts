import { randomUUID } from 'node:crypto';
import { createHash } from 'node:crypto';
import { readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Transaction } from 'sequelize';
import {
  ClaimEvidenceModel,
  FactClaimModel,
  RawObservationModel,
  SourceArtifactModel,
} from '../../models';
import { claimContentHash, rawPayloadHash } from '../../../common/intelligence/claim-normalizer';
import { textHash } from '../../../common/hashing/canonical-hash';
import { reconcileHistoryRun } from './boot-seed.history-provenance';
import { roadHashesAlreadyHeld } from './boot-seed.bolivia-road-network';
import { tradeCatalogueSchema, tradeYearSchema, type TradeYear } from '../schemas/ine-trade.schema';
import { readSeed } from './seed.utils';

/**
 * Carga la base de comercio exterior del INE, resumida por partida y país.
 *
 * Un año no es una cifra sino un cubo de decenas de miles de filas, y cargarlo
 * como una observación por fila —como un tramo de carretera— serían más de un
 * millón de afirmaciones y evidencias que nadie va a citar una por una. Cada
 * año entra como UN bloque por grano (el detalle de exportaciones; el detalle
 * anual y el mensual de importaciones), con una afirmación que declara sus
 * totales y una evidencia que cita el cuaderno del INE por su huella. La
 * migración 0087 despliega las filas de los bloques vigentes en una copia
 * guardada con índices, `read_models.trade_flow`, que es lo que el tablero lee.
 *
 * Sin arreglo `measures`, por la misma razón que los precios exógenos: estas
 * filas no son series del panel anual y no deben entrar en él.
 *
 * Un año revisado por el INE —el «2025p» que cambia cada mes hasta cerrarse—
 * llega con otra huella y entra como un bloque nuevo; la vista se queda con el
 * recibido más tarde y el anterior queda como evidencia de lo que se publicó.
 */

const AGENT_CODE = 'INE_TRADE_RECORDS';
const DIRECTORY = 'boot/ine-trade';
const PAGE = 'https://www.ine.gob.bo/index.php/estadisticas-economicas/comercio-exterior/';
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

type Grain = 'X_DETAIL' | 'M_DETAIL' | 'M_MONTHLY';

interface Block {
  readonly payload: Record<string, unknown>;
  readonly hash: string;
  readonly assertion: string;
  readonly excerpt: string;
  readonly eventDate: string;
}

const FLOW_NAME = { X: 'Exportaciones', M: 'Importaciones' } as const;

function blockOf(seed: TradeYear, grain: Grain): Block {
  const monthly = grain === 'M_MONTHLY';
  const rows = monthly ? seed.monthly : seed.detail;
  const columns = monthly ? seed.columns.monthly : seed.columns.detail;
  const payload = {
    recordType: 'TRADE_RECORD_BLOCK',
    dataCategory: 'TRADE_RECORD',
    flow: seed.flow,
    grain,
    year: seed.year,
    label: seed.label,
    provisional: seed.provisional,
    months: seed.months,
    records: seed.records,
    totals: seed.totals,
    publisher: seed.provenance.publisher,
    columns,
    rows,
  };
  const value = seed.flow === 'X' ? 'US$ FOB' : 'US$ CIF frontera';
  const grainText =
    grain === 'X_DETAIL'
      ? 'por partida NANDINA, país, departamento y mes'
      : monthly
        ? 'por uso o destino económico, capítulo, departamento y mes'
        : 'por partida NANDINA y país de origen';
  return {
    payload,
    hash: rawPayloadHash(payload),
    assertion:
      `${FLOW_NAME[seed.flow]} de Bolivia en ${seed.year} según la base del INE (${seed.label}): ` +
      `${seed.totals.usd} ${value} en ${seed.records} registros, ${rows.length} filas ${grainText}.`,
    excerpt:
      `${seed.provenance.title}: ${seed.records} registros, meses ${seed.months.join(',')}; ` +
      `suma ${seed.totals.usd} ${value}, ${seed.totals.kg} kg.`,
    eventDate: `${seed.year}-01-01`,
  };
}

async function artifactFor(
  sourceId: string,
  sha256: string,
  uri: string,
  retrievedAt: string,
  dataset: string,
  transaction: Transaction,
): Promise<string> {
  const existing = await SourceArtifactModel.findOne({ where: { sha256 }, transaction });
  if (existing) return existing.sourceArtifactId;
  const sourceArtifactId = randomUUID();
  const workbook = uri.includes('nube.ine.gob.bo');
  await SourceArtifactModel.create(
    {
      sourceArtifactId,
      sourceId,
      artifactType: workbook ? 'XLSX' : 'JSON',
      mimeType: workbook ? XLSX : 'application/json',
      originalUri: uri,
      storageUri: uri,
      sha256,
      publicationDate: null,
      retrievedAt: new Date(retrievedAt),
      metadataJson: {
        publisher: 'INSTITUTO NACIONAL DE ESTADISTICA',
        dataset,
        retrievalStrategy: 'VERSIONED_SNAPSHOT_V1',
      },
    },
    { transaction },
  );
  return sourceArtifactId;
}

async function writeBlock(
  block: Block,
  sourceArtifactId: string,
  locator: string,
  retrievedAt: string,
  agentRunId: string,
  transaction: Transaction,
): Promise<void> {
  const observation = await RawObservationModel.create(
    {
      agentRunId,
      sourceArtifactId,
      payloadJson: block.payload,
      payloadHash: block.hash,
      receivedAt: new Date(retrievedAt),
      processingStatus: 'NORMALIZED' as const,
      retryCount: 0,
    },
    { transaction },
  );
  const factClaimId = randomUUID();
  await FactClaimModel.create(
    {
      factClaimId,
      agentRunId,
      rawObservationId: observation.rawObservationId,
      claimType: 'INDICATOR_READING' as const,
      assertion: block.assertion,
      eventDate: block.eventDate,
      confidenceLevel: 'HIGH' as const,
      confidenceScore: '0.9500',
      impactLevel: 'MEDIUM' as const,
      timeHorizon: 'SHORT_TERM' as const,
      status: 'PUBLISHED' as const,
      contentHash: claimContentHash({
        claimType: 'INDICATOR_READING',
        assertion: block.assertion,
        eventDate: block.eventDate,
      }),
      createdAt: new Date(),
    },
    { transaction },
  );
  await ClaimEvidenceModel.create(
    {
      factClaimId,
      sourceArtifactId,
      excerpt: block.excerpt,
      excerptHash: textHash(block.excerpt),
      locator,
      retrievedAt: new Date(retrievedAt),
    },
    { transaction },
  );
}

/** Los años que la carpeta trae, en orden, sin el catálogo. */
async function yearFiles(): Promise<string[]> {
  const names = await readdir(resolve(__dirname, '..', DIRECTORY));
  return names.filter((name) => /^(exports|imports)-\d{4}\.json$/u.test(name)).sort();
}

/** Devuelve si entró algo: sin bloques nuevos, las copias guardadas ya dicen lo que hay. */
export async function reconcileIneTrade(
  sourceId: string,
  transaction: Transaction,
): Promise<boolean> {
  const agentRunId = await reconcileHistoryRun(AGENT_CODE, transaction);
  let written = 0;

  // Uno a uno: cada año de importaciones son varios megabytes y no hace falta
  // tener los cincuenta y dos en memoria a la vez.
  for (const name of await yearFiles()) {
    const seed = await readSeed(`${DIRECTORY}/${name}`, tradeYearSchema);
    const grains: Grain[] = seed.flow === 'X' ? ['X_DETAIL'] : ['M_DETAIL', 'M_MONTHLY'];
    const blocks = grains.map((grain) => blockOf(seed, grain));
    const held = await roadHashesAlreadyHeld(
      blocks.map((block) => block.hash),
      transaction,
    );
    const fresh = blocks.filter((block) => !held.has(block.hash));
    if (!fresh.length) continue;
    const { sourceUrl, upstreamSha256, retrievedAt } = seed.provenance;
    const artifactId = await artifactFor(
      sourceId,
      upstreamSha256,
      sourceUrl,
      retrievedAt,
      `${DIRECTORY}/${name}`,
      transaction,
    );
    for (const block of fresh) {
      await writeBlock(block, artifactId, sourceUrl, retrievedAt, agentRunId, transaction);
      written += 1;
    }
  }

  const catalogue = await readSeed(`${DIRECTORY}/catalogue.json`, tradeCatalogueSchema);
  const payload = { recordType: 'TRADE_CATALOGUE', dataCategory: 'TRADE_CATALOGUE', ...catalogue };
  const hash = rawPayloadHash(payload);
  if ((await roadHashesAlreadyHeld([hash], transaction)).has(hash)) return written > 0;
  const products = Object.keys(catalogue.products).length;
  const countries = Object.keys(catalogue.countries).length;
  const retrievedAt = new Date().toISOString();
  const digest = createHash('sha256').update(JSON.stringify(catalogue)).digest('hex');
  const artifactId = await artifactFor(
    sourceId,
    digest,
    PAGE,
    retrievedAt,
    `${DIRECTORY}/catalogue.json`,
    transaction,
  );
  const text =
    `Catálogo de la base de comercio exterior del INE: ${products} partidas NANDINA y ` +
    `${countries} países con sus nombres y clasificaciones.`;
  await writeBlock(
    { payload, hash, assertion: text, excerpt: text, eventDate: retrievedAt.slice(0, 10) },
    artifactId,
    PAGE,
    retrievedAt,
    agentRunId,
    transaction,
  );
  return true;
}
