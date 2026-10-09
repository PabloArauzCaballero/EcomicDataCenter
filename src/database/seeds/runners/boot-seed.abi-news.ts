import { randomUUID, createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { Op, type Transaction } from 'sequelize';
import { ClaimEvidenceModel, FactClaimModel, RawObservationModel, SourceArtifactModel } from '../../models';
import { canonicalHash, textHash } from '../../../common/hashing/canonical-hash';
import { rawPayloadHash } from '../../../common/intelligence/claim-normalizer';
import { abiNewsShardSchema, type AbiArticle } from '../schemas/abi-news.schema';
import { reconcileHistoryRun } from './boot-seed.history-provenance';
import { readSeed } from './seed.utils';

/** Volatile retrieval metadata lives on the artifact, never in article identity. */
export function abiPayload(article: AbiArticle): Record<string, unknown> {
  const abi: Record<string, unknown> = { ...article };
  for (const key of ['retrievedAt', 'responseUrl', 'responseSha256', 'responseStorage']) delete abi[key];
  return { recordType: 'NEWS', dataCategory: 'PRESS_COVERAGE', outlet: 'ABI',
    domain: new URL(article.url).hostname, section: article.categories.map(c => c.name).join(', ').slice(0, 80) || 'Noticias',
    headline: article.title, summary: article.summary, url: article.canonicalUrl,
    eventDate: article.publicationDay, statedInstant: article.statedDate,
    publicationInDocument: article.dateQuality === 'CONSISTENT', sourceTier: 'PRESS',
    publisher: 'ABI', publisherVerified: true, retrievalMethod: article.edition === 'CURRENT' ? 'PUBLISHER_API' : 'PUBLISHER_HTML',
    abiKey: article.key, abi };
}
async function artifactFor(article: AbiArticle, sourceId: string, transaction: Transaction): Promise<string> {
  const existing = await SourceArtifactModel.findOne({ where: { sha256: article.responseSha256 }, transaction });
  if (existing) return existing.sourceArtifactId;
  const bytes = gunzipSync(await readFile(resolve(__dirname, '../boot/abi-news', article.responseStorage)));
  if (createHash('sha256').update(bytes).digest('hex') !== article.responseSha256) throw new Error('ABI evidence digest mismatch');
  const artifact = await SourceArtifactModel.create({ sourceArtifactId: randomUUID(), sourceId,
    artifactType: article.edition === 'CURRENT' ? 'JSON' : 'HTML',
    mimeType: article.edition === 'CURRENT' ? 'application/json' : 'text/html',
    originalUri: article.responseUrl, storageUri: `seed://boot/abi-news/${article.responseStorage}`,
    sha256: article.responseSha256, retrievedAt: new Date(article.retrievedAt),
    metadataJson: { publisher: 'ABI', sourceTier: 'PRESS', compression: 'gzip', parserVersion: article.parserVersion },
  }, { transaction });
  return artifact.sourceArtifactId;
}

async function loadShard(articles: AbiArticle[], sourceId: string, agentRunId: string, transaction: Transaction): Promise<void> {
  const entries = articles.map(article => ({ article, payload: abiPayload(article) }));
  const hashes = entries.map(e => rawPayloadHash(e.payload));
  const held = new Set((await RawObservationModel.findAll({ attributes: ['payloadHash'],
    where: { payloadHash: { [Op.in]: hashes } }, transaction })).map(r => r.payloadHash));
  // A publisher can restore an older revision. Reactivate its original evidence
  // instead of allowing the previously newer revision to remain current.
  if (held.size && RawObservationModel.sequelize) {
    await RawObservationModel.sequelize.query(`
      UPDATE intelligence.fact_claim old SET superseded_by_claim_id = desired.fact_claim_id
      FROM intelligence.raw_observation prior, intelligence.raw_observation target,
           intelligence.fact_claim desired
      WHERE old.raw_observation_id = prior.raw_observation_id
        AND desired.raw_observation_id = target.raw_observation_id
        AND target.payload_hash IN (:hashes)
        AND prior.payload_json ->> 'abiKey' = target.payload_json ->> 'abiKey'
        AND old.fact_claim_id <> desired.fact_claim_id AND old.superseded_by_claim_id IS NULL`,
      { replacements: { hashes: [...held] }, transaction });
    await RawObservationModel.sequelize.query(`
      UPDATE intelligence.fact_claim claim SET superseded_by_claim_id = NULL
      FROM intelligence.raw_observation observation
      WHERE claim.raw_observation_id = observation.raw_observation_id
        AND observation.payload_hash IN (:hashes) AND claim.superseded_by_claim_id IS NOT NULL`,
      { replacements: { hashes: [...held] }, transaction });
  }
  const artifacts = new Map<string, string>();
  const pending: Array<{ article: AbiArticle; payload: Record<string, unknown>; payloadHash: string; artifactId: string }> = [];
  for (const [index, entry] of entries.entries()) {
    const payloadHash = hashes[index]!;
    if (held.has(payloadHash)) continue;
    held.add(payloadHash);
    const article = entry.article;
    let artifactId = artifacts.get(article.responseSha256);
    if (!artifactId) { artifactId = await artifactFor(article, sourceId, transaction); artifacts.set(article.responseSha256, artifactId); }
    pending.push({ ...entry, payloadHash, artifactId });
  }
  if (!pending.length) return;
  const observations = await RawObservationModel.bulkCreate(pending.map(e => ({
    agentRunId, sourceArtifactId: e.artifactId, payloadJson: e.payload, payloadHash: e.payloadHash,
    receivedAt: new Date(e.article.retrievedAt), processingStatus: 'NORMALIZED', retryCount: 0,
  })), { transaction, returning: true });
  const claims = pending.map((e, i) => ({ factClaimId: randomUUID(), agentRunId,
    rawObservationId: observations[i]!.rawObservationId, claimType: 'FACT',
    assertion: `ABI publicó el ${e.article.publicationDay}: ${e.article.title}`,
    eventDate: e.article.publicationDay, publishedAt: e.article.publishedAt ? new Date(e.article.publishedAt) : null,
    confidenceLevel: 'MEDIUM', confidenceScore: '0.6000', impactLevel: 'LOW', timeHorizon: 'SHORT_TERM',
    status: 'PUBLISHED', contentHash: canonicalHash({ key: e.article.key, version: e.article.contentSha256 }), createdAt: new Date(),
  }));
  await FactClaimModel.bulkCreate(claims, { transaction });
  await ClaimEvidenceModel.bulkCreate(claims.map((claim, i) => ({
    factClaimId: claim.factClaimId, sourceArtifactId: pending[i]!.artifactId,
    excerpt: (pending[i]!.article.text || pending[i]!.article.title).slice(0, 3500), excerptHash: textHash((pending[i]!.article.text || pending[i]!.article.title).slice(0, 3500)),
    locator: pending[i]!.article.url, retrievedAt: new Date(pending[i]!.article.retrievedAt),
  })), { transaction });
  // Corrections supersede old versions in general press too, retaining their evidence.
  if (!RawObservationModel.sequelize) throw new Error('ABI loader requires a database');
  await RawObservationModel.sequelize.query(`
    UPDATE intelligence.fact_claim old SET superseded_by_claim_id = fresh.fact_claim_id
    FROM intelligence.raw_observation prior, intelligence.raw_observation current,
         intelligence.fact_claim fresh
    WHERE old.raw_observation_id = prior.raw_observation_id
      AND fresh.raw_observation_id = current.raw_observation_id
      AND fresh.fact_claim_id IN (:ids)
      AND prior.payload_json ->> 'abiKey' = current.payload_json ->> 'abiKey'
      AND old.fact_claim_id <> fresh.fact_claim_id AND old.superseded_by_claim_id IS NULL
      AND prior.raw_observation_id < current.raw_observation_id`,
    { replacements: { ids: claims.map(c => c.factClaimId) }, transaction });
}

export async function reconcileAbiNews(sourceId: string, transaction: Transaction): Promise<void> {
  // Serialise concurrent manual/boot loads of the same source.
  if (!RawObservationModel.sequelize) throw new Error('ABI loader requires a database');
  await RawObservationModel.sequelize.query("SELECT pg_advisory_xact_lock(hashtext('abi-news-load'))", { transaction });
  const manifest = JSON.parse(await readFile(resolve(__dirname, '../boot/abi-news/manifest.json'), 'utf8')) as { files: string[] };
  const agentRunId = await reconcileHistoryRun('PRESS_COVERAGE', transaction);
  for (const file of manifest.files) {
    if (!/^articles\/[a-z]+-\d{4}-\d{2}-\d{3}\.json$/u.test(file)) throw new Error('Invalid ABI shard path');
    const shard = await readSeed(`boot/abi-news/${file}`, abiNewsShardSchema);
    await loadShard(shard.articles, sourceId, agentRunId, transaction);
  }
}
