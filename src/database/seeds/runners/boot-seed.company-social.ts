import { randomUUID } from 'node:crypto';
import type { Transaction } from 'sequelize';
import {
  ClaimEvidenceModel,
  FactClaimModel,
  RawObservationModel,
  SourceArtifactModel,
} from '../../models';
import { claimContentHash, rawPayloadHash } from '../../../common/intelligence/claim-normalizer';
import { canonicalHash, textHash } from '../../../common/hashing/canonical-hash';
import { reconcileHistoryRun } from './boot-seed.history-provenance';
import { roadHashesAlreadyHeld } from './boot-seed.bolivia-road-network';
import {
  companySocialSchema,
  type CompanySocial,
  type CompanySocialProfile,
} from '../schemas/company-social.schema';
import { readSeed } from './seed.utils';

/**
 * Carga las cuentas oficiales de las empresas en redes sociales (ADR 0027).
 *
 * Tres clases de observación, y ninguna lleva `measures`: no entran a las
 * vistas de indicadores, porque una cifra que una red declara sobre una cuenta
 * no es una serie del país. La migración 0094 abre sus propias vistas.
 *
 * - `COMPANY_SOCIAL_PROFILE`: una por empresa, red y corrida.
 * - `COMPANY_SOCIAL_POSTS`: los posts de esa misma lectura, juntos.
 * - `COMPANY_SOCIAL_TERMS`: los términos de una empresa en una corrida, por
 *   ámbito (lo que publica y lo que le comentan).
 *
 * El artefacto de un perfil es el HTML que se leyó, por su huella. Un perfil
 * que no dejó HTML, y los términos —que se derivan de muchas páginas—, cuelgan
 * del artefacto de la corrida, cuya huella es la de su propia sección.
 */

const AGENT_CODE = 'COMPANY_SOCIAL';
const CHUNK = 500;
const FILE = 'boot/company-social.json';

interface Pending {
  readonly payload: Record<string, unknown>;
  readonly hash: string;
  readonly assertion: string;
  readonly excerpt: string;
  readonly eventDate: string;
  readonly retrievedAt: string;
  readonly artifact: ArtifactRef;
}

interface ArtifactRef {
  readonly sha256: string;
  readonly uri: string;
  readonly type: 'HTML' | 'JSON';
  readonly publisher: string;
}

function dayOf(iso: string): string {
  return iso.slice(0, 10);
}

function profileAssertion(profile: CompanySocialProfile): string {
  if (profile.status !== 'OK') {
    return `${profile.platform} de ${profile.slug} no se pudo leer el ${dayOf(profile.retrievedAt)} (${profile.status}).`;
  }
  const followers =
    profile.followers === null ? 'sin cifra de seguidores' : `${profile.followers} seguidores`;
  return `${profile.platform} de ${profile.slug} declaraba ${followers} el ${dayOf(profile.retrievedAt)}.`;
}

function pendingOf(seed: CompanySocial): Pending[] {
  const { runId, retrievedAt, collector } = seed.provenance;
  const runArtifact = (section: string): ArtifactRef => ({
    sha256: canonicalHash({ runId, section, collector }),
    uri: `${collector}#${runId}/${section}`,
    type: 'JSON',
    publisher: 'Observatorio (corrida de redes sociales)',
  });
  const entries: Pending[] = [];

  for (const profile of seed.profiles) {
    const date = dayOf(profile.retrievedAt);
    const artifact: ArtifactRef = profile.sha256
      ? { sha256: profile.sha256, uri: profile.url, type: 'HTML', publisher: profile.platform }
      : runArtifact(`unread/${profile.platform}/${profile.slug}`);
    const payload = {
      recordType: 'COMPANY_SOCIAL_PROFILE',
      dataCategory: 'COMPANY_SOCIAL_PROFILE',
      runId,
      date,
      ...profile,
    };
    const assertion = profileAssertion(profile);
    entries.push({
      payload,
      hash: rawPayloadHash(payload),
      assertion,
      excerpt: assertion,
      eventDate: date,
      retrievedAt: profile.retrievedAt,
      artifact,
    });

    const posts = seed.posts.filter(
      (post) => post.slug === profile.slug && post.platform === profile.platform,
    );
    if (posts.length === 0) continue;
    const postPayload = {
      recordType: 'COMPANY_SOCIAL_POSTS',
      dataCategory: 'COMPANY_SOCIAL_POSTS',
      runId,
      date,
      slug: profile.slug,
      platform: profile.platform,
      posts,
    };
    const postAssertion = `${posts.length} posts de ${profile.platform} de ${profile.slug} leídos el ${date}.`;
    entries.push({
      payload: postPayload,
      hash: rawPayloadHash(postPayload),
      assertion: postAssertion,
      excerpt: postAssertion,
      eventDate: date,
      retrievedAt: profile.retrievedAt,
      artifact,
    });
  }

  const groups = new Map<string, CompanySocial['terms']>();
  for (const term of seed.terms) {
    const key = `${term.slug}|${term.scope}`;
    groups.set(key, [...(groups.get(key) ?? []), term]);
  }
  const date = dayOf(retrievedAt);
  for (const [key, terms] of groups) {
    const [slug, scope] = key.split('|') as [string, string];
    const payload = {
      recordType: 'COMPANY_SOCIAL_TERMS',
      dataCategory: 'COMPANY_SOCIAL_TERMS',
      runId,
      date,
      slug,
      scope,
      texts: terms[0]?.texts ?? 0,
      terms: terms.map(({ kind, term, count, rank }) => ({ kind, term, count, rank })),
    };
    const assertion = `Términos más repetidos de ${slug} (${scope}) en la corrida ${runId}.`;
    entries.push({
      payload,
      hash: rawPayloadHash(payload),
      assertion,
      excerpt: assertion,
      eventDate: date,
      retrievedAt,
      artifact: runArtifact('terms'),
    });
  }
  return entries;
}

async function reconcileArtifact(
  sourceId: string,
  entry: Pending,
  transaction: Transaction,
): Promise<string> {
  const { artifact } = entry;
  const existing = await SourceArtifactModel.findOne({
    where: { sha256: artifact.sha256 },
    transaction,
  });
  if (existing) return existing.sourceArtifactId;
  const sourceArtifactId = randomUUID();
  await SourceArtifactModel.create(
    {
      sourceArtifactId,
      sourceId,
      artifactType: artifact.type,
      mimeType: artifact.type === 'HTML' ? 'text/html' : 'application/json',
      originalUri: artifact.uri,
      storageUri: artifact.uri,
      sha256: artifact.sha256,
      publicationDate: null,
      retrievedAt: new Date(entry.retrievedAt),
      metadataJson: {
        publisher: artifact.publisher,
        dataset: FILE,
        retrievalStrategy: 'VERSIONED_SNAPSHOT_V1',
      },
    },
    { transaction },
  );
  return sourceArtifactId;
}

async function writeBlock(
  block: readonly Pending[],
  sourceArtifactId: string,
  agentRunId: string,
  transaction: Transaction,
): Promise<void> {
  const observations = await RawObservationModel.bulkCreate(
    block.map((entry) => ({
      agentRunId,
      sourceArtifactId,
      payloadJson: entry.payload,
      payloadHash: entry.hash,
      receivedAt: new Date(entry.retrievedAt),
      processingStatus: 'NORMALIZED' as const,
      retryCount: 0,
    })),
    { transaction, returning: true },
  );
  const claims = block.map((entry, index) => ({
    factClaimId: randomUUID(),
    agentRunId,
    rawObservationId: observations[index]?.rawObservationId ?? '',
    claimType: 'INDICATOR_READING' as const,
    assertion: entry.assertion,
    eventDate: entry.eventDate,
    confidenceLevel: 'MEDIUM' as const,
    confidenceScore: '0.6000',
    impactLevel: 'LOW' as const,
    timeHorizon: 'SHORT_TERM' as const,
    status: 'PUBLISHED' as const,
    contentHash: claimContentHash({
      claimType: 'INDICATOR_READING',
      assertion: entry.assertion,
      eventDate: entry.eventDate,
    }),
    createdAt: new Date(),
  }));
  await FactClaimModel.bulkCreate(claims, { transaction });
  await ClaimEvidenceModel.bulkCreate(
    claims.map((claim, index) => {
      const entry = block[index];
      const excerpt = entry?.excerpt ?? claim.assertion;
      return {
        factClaimId: claim.factClaimId,
        sourceArtifactId,
        excerpt,
        excerptHash: textHash(excerpt),
        locator: entry?.artifact.uri ?? '',
        retrievedAt: new Date(entry?.retrievedAt ?? Date.now()),
      };
    }),
    { transaction },
  );
}

export async function reconcileCompanySocial(
  sourceId: string,
  transaction: Transaction,
): Promise<void> {
  const agentRunId = await reconcileHistoryRun(AGENT_CODE, transaction);
  const seed = await readSeed(FILE, companySocialSchema);
  const entries = pendingOf(seed);
  const held = await roadHashesAlreadyHeld(
    entries.map((entry) => entry.hash),
    transaction,
  );

  const byArtifact = new Map<string, Pending[]>();
  for (const entry of entries) {
    if (held.has(entry.hash)) continue;
    held.add(entry.hash);
    const own = byArtifact.get(entry.artifact.sha256);
    if (own) own.push(entry);
    else byArtifact.set(entry.artifact.sha256, [entry]);
  }
  for (const pending of byArtifact.values()) {
    const first = pending[0];
    if (!first) continue;
    const sourceArtifactId = await reconcileArtifact(sourceId, first, transaction);
    for (let start = 0; start < pending.length; start += CHUNK) {
      await writeBlock(
        pending.slice(start, start + CHUNK),
        sourceArtifactId,
        agentRunId,
        transaction,
      );
    }
  }
}
