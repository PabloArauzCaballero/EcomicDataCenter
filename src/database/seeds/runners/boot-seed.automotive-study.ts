import { randomUUID } from 'node:crypto';
import type { Transaction } from 'sequelize';
import {
  ClaimEvidenceModel,
  FactClaimModel,
  RawObservationModel,
  SourceArtifactModel,
} from '../../models';
import { claimContentHash, rawPayloadHash } from '../../../common/intelligence/claim-normalizer';
import { textHash } from '../../../common/hashing/canonical-hash';
import { automotiveStudySchema } from '../schemas/automotive-study.schema';
import { reconcileHistoryRun } from './boot-seed.history-provenance';
import { readSeed } from './seed.utils';

/** Versioned study, additive on content hash; observations never replace older evidence. */
export async function reconcileAutomotiveStudy(
  sourceId: string,
  transaction: Transaction,
): Promise<void> {
  const study = await readSeed('boot/automotive-study.json', automotiveStudySchema);
  const payload = { dataCategory: 'AUTOMOTIVE_STUDY', recordType: 'RESEARCH_SNAPSHOT', study };
  const payloadHash = rawPayloadHash(payload);
  if (await RawObservationModel.findOne({ where: { payloadHash }, transaction })) return;
  const agentRunId = await reconcileHistoryRun('VEHICLE_PRICES', transaction);
  const artifacts: Array<{ id: string; url: string; title: string; retrievedAt: Date }> = [];
  for (const source of study.sources.filter((item) => item.httpStatus === 200)) {
    const existing = await SourceArtifactModel.findOne({
      where: { sha256: source.sha256 },
      transaction,
    });
    const id = existing?.sourceArtifactId ?? randomUUID();
    const retrievedAt = new Date(source.capturedAt);
    if (!existing)
      await SourceArtifactModel.create(
        {
          sourceArtifactId: id,
          sourceId,
          artifactType: source.format.toUpperCase(),
          mimeType: source.format === 'pdf' ? 'application/pdf' : 'text/html',
          originalUri: source.url,
          storageUri: source.url,
          sha256: source.sha256,
          publicationDate: null,
          retrievedAt,
          metadataJson: {
            dataset: 'boot/automotive-study.json',
            httpStatus: source.httpStatus,
            bytes: source.bytes,
            title: source.title,
            localArchive: source['archive'],
            retrievalStrategy: 'HASHED_PUBLIC_CAPTURE',
          },
        },
        { transaction },
      );
    artifacts.push({ id, url: source.url, title: source.title, retrievedAt });
  }
  const artifact = artifacts[0];
  if (!artifact) throw new Error('Estudio sin fuentes capturadas');
  const observation = await RawObservationModel.create(
    {
      agentRunId,
      sourceArtifactId: artifact.id,
      payloadJson: payload,
      payloadHash,
      receivedAt: new Date(),
      processingStatus: 'NORMALIZED',
      retryCount: 0,
    },
    { transaction },
  );
  const assertion = `Compilación automotriz ${study.version}: ${study.offers.length} anuncios observados, ${study.comparisons.length} pares con límites de equivalencia y estadísticas oficiales de períodos identificados.`;
  const factClaimId = randomUUID();
  await FactClaimModel.create(
    {
      factClaimId,
      agentRunId,
      rawObservationId: observation.rawObservationId,
      claimType: 'FACT',
      assertion,
      eventDate: study.observedAt,
      confidenceLevel: 'MEDIUM',
      confidenceScore: '0.6000',
      impactLevel: 'LOW',
      timeHorizon: 'SHORT_TERM',
      status: 'PUBLISHED',
      contentHash: claimContentHash({
        claimType: 'FACT',
        assertion: `${assertion} [${payloadHash}]`,
        eventDate: study.observedAt,
      }),
      createdAt: new Date(),
    },
    { transaction },
  );
  await ClaimEvidenceModel.bulkCreate(
    artifacts.map((item) => ({
      factClaimId,
      sourceArtifactId: item.id,
      excerpt: item.title,
      excerptHash: textHash(item.title),
      locator: item.url,
      retrievedAt: item.retrievedAt,
    })),
    { transaction },
  );
}
