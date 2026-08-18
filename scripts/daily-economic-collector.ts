import { createHash, randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { z } from 'zod';
import {
  comparable,
  effectiveContentType,
  evidenceCandidateKey,
  publicationWindowIssue,
  requireVerifiableText,
  resolveLinkedArticle,
  visibleText,
} from '../src/modules/intelligence/evidence-quality';
import { groundClaimToExcerpt } from '../src/modules/intelligence/claim-evidence-grounding';
import {
  extractPdfEvidence,
  pdfMetadataPublicationDates,
} from '../src/modules/intelligence/pdf-text-extraction';
import {
  canonicalSourceUrl,
  htmlSourceMetadata,
  assessPublicationMetadata,
} from '../src/modules/intelligence/source-metadata';
import { verifyStoredEvidenceBlob } from '../src/modules/intelligence/storage-integrity';
import type { GitHubBlobPayload } from '../src/modules/intelligence/storage-integrity';
import {
  fetchPublicSource,
  readResponseBodyLimited,
  validatePublicSourceUrl,
} from '../src/modules/intelligence/safe-source-fetch';
import { sourceResponseProvenance } from '../src/modules/intelligence/source-response-provenance';
import {
  economicResearchInstructions,
  economicResearchSystemInstruction,
} from '../src/modules/intelligence/research-policy';

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

interface Candidate {
  title: string;
  url: string;
  publisher: string;
  publishedAt: string | null;
  eventDate: string | null;
  claimType: string;
  assertion: string;
  excerpt: string;
  confidenceLevel: string;
  confidenceScore: number | null;
  impactLevel: string | null;
  timeHorizon: string | null;
  entityMentions: string[];
}

interface ResearchOutput {
  candidates: Candidate[];
}

const requiredNames = [
  'ECONOMIC_API_BASE_URL',
  'ECONOMIC_STORAGE_BASE_URL',
  'ECONOMIC_STORAGE_REPOSITORY',
  'ECONOMIC_SOURCE_ID',
  'ECONOMIC_AGENT_CODE',
  'ECONOMIC_PROMPT_VERSION',
  'ECONOMIC_SCHEMA_VERSION',
  'ECONOMIC_TIMEZONE',
  'ECONOMIC_COLLECTOR_KEY',
  'ECONOMIC_STORAGE_TOKEN',
] as const;

const env = Object.fromEntries(
  requiredNames.map((name) => {
    const value = process.env[name]?.trim();
    if (!value) throw new Error(`Missing required configuration: ${name}`);
    return [name, value];
  }),
) as Record<(typeof requiredNames)[number], string>;

const aiProvider = (process.env.AI_PROVIDER?.trim().toLowerCase() || 'groq') as 'groq' | 'openai';
if (!['groq', 'openai'].includes(aiProvider)) {
  throw new Error(`Unsupported AI_PROVIDER: ${aiProvider}`);
}
const aiModel =
  process.env.AI_MODEL?.trim() || (aiProvider === 'groq' ? 'groq/compound' : 'gpt-5.6-terra');
const aiApiKey = process.env[aiProvider === 'groq' ? 'GROQ_API_KEY' : 'OPENAI_API_KEY']?.trim();
if (!aiApiKey) {
  throw new Error(
    `Missing required configuration: ${aiProvider === 'groq' ? 'GROQ_API_KEY' : 'OPENAI_API_KEY'}`,
  );
}

const report: Record<string, Json> = {
  startedAt: new Date().toISOString(),
  status: 'FAILED',
  warnings: [],
  sourcesConsulted: 0,
  artifactsRegistered: 0,
  findingsSent: 0,
  qualityAdjustments: [],
};

const researchWindowMilliseconds = 72 * 60 * 60 * 1000;
const maximumEvidenceBytes = 5_000_000;

async function request(
  url: string,
  init: RequestInit = {},
  accepted: readonly number[] = [200],
  timeoutMs = 90_000,
): Promise<Response> {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  if (!accepted.includes(response.status)) {
    const body = (await response.text()).slice(0, 1_000);
    throw new Error(
      `${init.method ?? 'GET'} ${new URL(url).pathname} returned ${response.status}: ${body}`,
    );
  }
  return response;
}

async function waitForBackend(): Promise<void> {
  const delays = [0, 10_000, 20_000, 40_000, 60_000];
  let lastError: unknown;
  for (const delay of delays) {
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
    try {
      const response = await request(`${env.ECONOMIC_API_BASE_URL}/ready`);
      const body = (await response.json()) as {
        status?: string;
        dependencies?: { writer?: string; reader?: string };
      };
      if (
        body.status === 'ready' &&
        body.dependencies?.writer === 'up' &&
        body.dependencies.reader === 'up'
      ) {
        return;
      }
      lastError = new Error(`Unexpected readiness response: ${JSON.stringify(body)}`);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Backend readiness failed');
}

const candidateSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    title: { type: 'string', minLength: 3, maxLength: 300 },
    url: { type: 'string' },
    publisher: { type: 'string', minLength: 2, maxLength: 200 },
    publishedAt: { type: ['string', 'null'], format: 'date-time' },
    eventDate: { type: ['string', 'null'], format: 'date' },
    claimType: {
      type: 'string',
      enum: [
        'FACT',
        'INDICATOR_READING',
        'ESTIMATE',
        'OPINION',
        'FORECAST',
        'AI_INFERENCE',
        'RISK',
        'OPPORTUNITY',
        'THREAT',
        'TREND',
        'RECOMMENDATION',
      ],
    },
    assertion: { type: 'string', minLength: 20, maxLength: 4000 },
    excerpt: { type: 'string', minLength: 20, maxLength: 4000 },
    confidenceLevel: { type: 'string', enum: ['VERY_LOW', 'LOW', 'MEDIUM', 'HIGH', 'VERY_HIGH'] },
    confidenceScore: { type: ['number', 'null'], minimum: 0, maximum: 1 },
    impactLevel: {
      type: ['string', 'null'],
      enum: ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'NEGLIGIBLE', null],
    },
    timeHorizon: {
      type: ['string', 'null'],
      enum: ['IMMEDIATE', 'SHORT_TERM', 'MEDIUM_TERM', 'LONG_TERM', 'STRUCTURAL', null],
    },
    entityMentions: {
      type: 'array',
      maxItems: 25,
      items: { type: 'string', minLength: 2, maxLength: 250 },
    },
  },
  required: [
    'title',
    'url',
    'publisher',
    'publishedAt',
    'eventDate',
    'claimType',
    'assertion',
    'excerpt',
    'confidenceLevel',
    'confidenceScore',
    'impactLevel',
    'timeHorizon',
    'entityMentions',
  ],
} as const;

function extractOutputText(response: {
  output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
}): string {
  return (response.output ?? [])
    .flatMap((item) => item.content ?? [])
    .filter((item) => item.type === 'output_text' && typeof item.text === 'string')
    .map((item) => item.text)
    .join('');
}

const researchOutputSchema = z.object({
  candidates: z
    .array(
      z.object({
        title: z.string().min(3).max(300),
        url: z.url(),
        publisher: z.string().min(2).max(200),
        publishedAt: z.iso.datetime({ offset: true }).nullable(),
        eventDate: z.iso.date().nullable(),
        claimType: z.enum(candidateSchema.properties.claimType.enum),
        assertion: z.string().min(20).max(4000),
        excerpt: z.string().min(20).max(4000),
        confidenceLevel: z.enum(candidateSchema.properties.confidenceLevel.enum),
        confidenceScore: z.number().min(0).max(1).nullable(),
        impactLevel: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'NEGLIGIBLE']).nullable(),
        timeHorizon: z
          .enum(['IMMEDIATE', 'SHORT_TERM', 'MEDIUM_TERM', 'LONG_TERM', 'STRUCTURAL'])
          .nullable(),
        entityMentions: z.array(z.string().min(2).max(250)).max(25),
      }),
    )
    .max(8),
});

function parseResearchOutput(raw: string): ResearchOutput {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('AI provider returned invalid JSON');
  }
  return researchOutputSchema.parse(parsed);
}

function researchPrompt(since: Date, now: Date): string {
  const schema = {
    type: 'object',
    additionalProperties: false,
    properties: { candidates: { type: 'array', maxItems: 8, items: candidateSchema } },
    required: ['candidates'],
  };
  return `${economicResearchInstructions(since, now)} El colector descargará cada fuente y rechazará cualquier dato que no coincida. Responde únicamente con JSON válido según este esquema: ${JSON.stringify(schema)}`;
}

async function researchWithGroq(since: Date, now: Date): Promise<ResearchOutput> {
  const response = await request(
    'https://api.groq.com/openai/v1/chat/completions',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${aiApiKey}`,
        'Content-Type': 'application/json',
        'Groq-Model-Version': 'latest',
      },
      body: JSON.stringify({
        model: aiModel,
        messages: [
          {
            role: 'system',
            content: economicResearchSystemInstruction,
          },
          { role: 'user', content: researchPrompt(since, now) },
        ],
        response_format: { type: 'json_object' },
        search_settings: { country: 'bolivia' },
        compound_custom: { tools: { enabled_tools: ['web_search'] } },
      }),
    },
    [200],
    300_000,
  );
  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = payload.choices?.[0]?.message?.content;
  if (!content) throw new Error('Groq returned no JSON output');
  return parseResearchOutput(content);
}

async function researchWithOpenAi(since: Date, now: Date): Promise<ResearchOutput> {
  const response = await request(
    'https://api.openai.com/v1/responses',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${aiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: aiModel,
        tools: [{ type: 'web_search' }],
        reasoning: { effort: 'medium' },
        text: {
          format: {
            type: 'json_schema',
            name: 'daily_economic_research',
            strict: true,
            schema: {
              type: 'object',
              additionalProperties: false,
              properties: {
                candidates: { type: 'array', maxItems: 8, items: candidateSchema },
              },
              required: ['candidates'],
            },
          },
        },
        instructions: economicResearchSystemInstruction,
        input: economicResearchInstructions(since, now),
      }),
    },
    [200],
    300_000,
  );
  const payload = (await response.json()) as {
    status?: string;
    output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
  };
  if (payload.status !== 'completed')
    throw new Error(`OpenAI response status: ${payload.status ?? 'missing'}`);
  const outputText = extractOutputText(payload);
  if (!outputText) throw new Error('OpenAI returned no structured output');
  return parseResearchOutput(outputText);
}

async function research(): Promise<ResearchOutput> {
  const now = new Date();
  const since = new Date(now.getTime() - researchWindowMilliseconds);
  report.aiProvider = aiProvider;
  report.aiModel = aiModel;
  return aiProvider === 'groq' ? researchWithGroq(since, now) : researchWithOpenAi(since, now);
}

function contentExtension(contentType: string): string {
  if (contentType.includes('pdf')) return 'pdf';
  if (contentType.includes('json')) return 'json';
  if (contentType.includes('html')) return 'html';
  return 'txt';
}

async function downloadEvidenceSource(rawUrl: string | URL) {
  const sourceFetch = await fetchPublicSource(
    rawUrl,
    { headers: { 'User-Agent': 'EconomicDataCenterCollector/1.0' } },
    45_000,
  );
  if (sourceFetch.response.status !== 200) {
    throw new Error(`Source returned ${sourceFetch.response.status}`);
  }
  const bytes = await readResponseBodyLimited(sourceFetch.response, maximumEvidenceBytes);
  const declaredContentType =
    (sourceFetch.response.headers.get('content-type') ?? 'text/plain').split(';')[0]?.trim() ??
    'text/plain';
  return {
    bytes,
    contentType: effectiveContentType(bytes, declaredContentType),
    sourceUrl: sourceFetch.finalUrl,
    redirectCount: sourceFetch.redirectCount,
    httpProvenance: sourceResponseProvenance(sourceFetch.response),
  };
}

async function persistEvidence(candidate: Candidate) {
  const discoveredUrl = validatePublicSourceUrl(candidate.url);
  let downloaded = await downloadEvidenceSource(discoveredUrl);
  let { bytes, contentType, sourceUrl } = downloaded;
  let sourceRedirectCount = downloaded.redirectCount;
  if (contentType.includes('html')) {
    const linkedArticle = resolveLinkedArticle(bytes.toString('utf8'), sourceUrl, candidate.title);
    if (linkedArticle) {
      downloaded = await downloadEvidenceSource(linkedArticle);
      ({ bytes, contentType, sourceUrl } = downloaded);
      sourceRedirectCount += downloaded.redirectCount;
    }
  }
  let canonicalized = false;
  if (contentType.includes('html')) {
    const metadata = htmlSourceMetadata(bytes.toString('utf8'));
    const canonicalUrl = canonicalSourceUrl(metadata, sourceUrl);
    if (canonicalUrl) {
      canonicalUrl.hash = '';
      const currentUrl = new URL(sourceUrl);
      currentUrl.hash = '';
      if (canonicalUrl.toString() !== currentUrl.toString()) {
        downloaded = await downloadEvidenceSource(canonicalUrl);
        ({ bytes, contentType, sourceUrl } = downloaded);
        sourceRedirectCount += downloaded.redirectCount;
        canonicalized = true;
      }
    }
  }
  if (!bytes.length) throw new Error(`Unsupported source size: ${bytes.length}`);
  const pdfEvidence = contentType.includes('pdf') ? await extractPdfEvidence(bytes) : undefined;
  const text = pdfEvidence?.text ?? visibleText(bytes, contentType);
  requireVerifiableText(text, contentType);
  const sourceMetadata = contentType.includes('html')
    ? htmlSourceMetadata(bytes.toString('utf8'))
    : {
        publishers: [],
        publicationDates: pdfEvidence ? pdfMetadataPublicationDates(pdfEvidence.metadata) : [],
        canonicalUrls: [],
      };
  const publicationDateAssessment = assessPublicationMetadata(
    candidate.publishedAt ?? '',
    sourceMetadata.publicationDates,
  );
  if (publicationDateAssessment === 'CONTRADICTED') {
    throw new Error('The publication date contradicts the downloaded source metadata');
  }
  if (publicationDateAssessment === 'AMBIGUOUS') {
    throw new Error('The downloaded source declares conflicting publication dates');
  }
  const verifiedPublisher = sourceMetadata.publishers[0] ?? candidate.publisher;
  if (!comparable(text).includes(comparable(candidate.title))) {
    throw new Error('The candidate title was not found in the final downloaded source');
  }
  if (!comparable(text).includes(comparable(candidate.excerpt))) {
    throw new Error('The cited excerpt was not found in the downloaded source');
  }
  const grounding = groundClaimToExcerpt(
    candidate.assertion,
    candidate.entityMentions,
    candidate.excerpt,
  );
  const unsupportedNumbers = grounding.unsupportedNumbers;
  if (unsupportedNumbers.length) {
    throw new Error(
      `The assertion contains figures absent from the cited excerpt: ${unsupportedNumbers.join(', ')}`,
    );
  }
  const entityMentions = grounding.entityMentions;
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const path = `evidence/${sha256.slice(0, 2)}/${sha256.slice(2, 4)}/${sha256}.${contentExtension(contentType)}`;
  const githubUrl = `https://api.github.com/repos/${env.ECONOMIC_STORAGE_REPOSITORY}/contents/${path}`;
  const storageHeaders = {
    Authorization: `Bearer ${env.ECONOMIC_STORAGE_TOKEN}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  const existing = await fetch(githubUrl, {
    headers: storageHeaders,
    signal: AbortSignal.timeout(30_000),
  });
  if (existing.status === 404) {
    await request(
      githubUrl,
      {
        method: 'PUT',
        headers: { ...storageHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `evidence ${sha256}`,
          content: bytes.toString('base64'),
          branch: 'main',
        }),
      },
      [201],
      45_000,
    );
  } else if (existing.status !== 200) {
    throw new Error(`Evidence lookup returned ${existing.status}`);
  }
  const storedObjectResponse = await request(githubUrl, { headers: storageHeaders }, [200], 30_000);
  const storedObject = (await storedObjectResponse.json()) as { sha?: string };
  if (!storedObject.sha || !/^[0-9a-f]{40,64}$/u.test(storedObject.sha)) {
    throw new Error('Stored evidence did not return a valid Git object identifier');
  }
  const blobResponse = await request(
    `https://api.github.com/repos/${env.ECONOMIC_STORAGE_REPOSITORY}/git/blobs/${storedObject.sha}`,
    { headers: storageHeaders },
    [200],
    30_000,
  );
  verifyStoredEvidenceBlob((await blobResponse.json()) as GitHubBlobPayload, sha256, bytes.length);
  const storageUri = `${env.ECONOMIC_STORAGE_BASE_URL}/${path}`;
  const retrievedAt = new Date().toISOString();
  const artifactResponse = await backend('/api/v1/provenance/artifacts', {
    method: 'POST',
    body: JSON.stringify({
      sourceId: env.ECONOMIC_SOURCE_ID,
      artifactType: contentExtension(contentType).toUpperCase(),
      originalUri: sourceUrl.toString(),
      storageUri,
      mimeType: contentType,
      sha256,
      ...(candidate.publishedAt ? { publicationDate: candidate.publishedAt.slice(0, 10) } : {}),
      retrievedAt,
      fileSizeBytes: String(bytes.length),
      metadataJson: {
        title: candidate.title,
        publisher: verifiedPublisher,
        aiReportedPublisher: candidate.publisher,
        sourcePublicationDates: sourceMetadata.publicationDates,
        ...(pdfEvidence ? { pdfMetadata: pdfEvidence.metadata } : {}),
        publicationDateVerification: publicationDateAssessment,
        discoveredUri: discoveredUrl.toString(),
        resolvedArticle: sourceUrl.toString() !== discoveredUrl.toString(),
        sourceRedirectCount,
        httpProvenance: downloaded.httpProvenance,
        canonicalized,
        storageVerification: 'MATCHED_SHA256_AND_SIZE',
        claimGroundingScope: 'CITED_EXCERPT',
      },
    }),
  });
  const artifactPayload = (await artifactResponse.json()) as {
    artifact?: { sourceArtifactId?: string };
  };
  const sourceArtifactId = artifactPayload.artifact?.sourceArtifactId;
  if (!sourceArtifactId) throw new Error('Backend did not return sourceArtifactId');
  return {
    sourceArtifactId,
    retrievedAt,
    storageUri,
    sha256,
    sourceUrl: sourceUrl.toString(),
    entityMentions,
    publisher: verifiedPublisher,
    publisherVerified: sourceMetadata.publishers.length > 0,
    publicationDateVerified: publicationDateAssessment === 'MATCHED',
    canonicalized,
  };
}

function backend(path: string, init: RequestInit): Promise<Response> {
  return request(
    `${env.ECONOMIC_API_BASE_URL}${path}`,
    {
      ...init,
      headers: {
        Authorization: `Bearer ${env.ECONOMIC_COLLECTOR_KEY}`,
        'Content-Type': 'application/json',
        'X-Correlation-Id': randomUUID(),
        ...(init.headers ?? {}),
      },
    },
    [200, 201],
    90_000,
  );
}

async function openRun(): Promise<string> {
  const response = await backend('/api/v1/intelligence/agent-runs', {
    method: 'POST',
    body: JSON.stringify({
      agentCode: env.ECONOMIC_AGENT_CODE,
      triggerType: process.env.GITHUB_EVENT_NAME === 'workflow_dispatch' ? 'MANUAL' : 'SCHEDULED',
      attemptNo: 1,
      promptVersion: env.ECONOMIC_PROMPT_VERSION,
      schemaVersion: env.ECONOMIC_SCHEMA_VERSION,
    }),
  });
  const payload = (await response.json()) as { agentRunId?: string };
  if (!payload.agentRunId) throw new Error('Backend did not return agentRunId');
  return payload.agentRunId;
}

async function completeRun(
  agentRunId: string,
  status: string,
  warningCount: number,
  sourcesConsulted: number,
  errorSummary?: string,
) {
  await backend(`/api/v1/intelligence/agent-runs/${agentRunId}/completion`, {
    method: 'POST',
    body: JSON.stringify({
      status,
      sourcesConsulted,
      warningCount,
      ...(errorSummary ? { errorSummary: errorSummary.slice(0, 2000) } : {}),
      checkpoint: { completedAt: new Date().toISOString() },
    }),
  });
}

async function saveReport(): Promise<void> {
  report.completedAt = new Date().toISOString();
  await mkdir('artifacts', { recursive: true });
  // The destination is a fixed, non-executable JSON artifact. Network-derived
  // fields are serialized as data and are never used as a path or evaluated.
  // lgtm[js/http-to-file-access]
  await writeFile(
    'artifacts/daily-economic-report.json',
    `${JSON.stringify(report, null, 2)}\n`,
    'utf8',
  );
}

async function main(): Promise<void> {
  let agentRunId: string | undefined;
  const warnings: string[] = [];
  try {
    await waitForBackend();
    const output = await research();
    report.sourcesConsulted = output.candidates.length;
    agentRunId = await openRun();
    report.agentRunId = agentRunId;
    const items = [];
    const seenEvidence = new Set<string>();
    const publicationWindowEnd = new Date(Date.now() + 15 * 60 * 1000);
    const publicationWindowStart = new Date(
      publicationWindowEnd.getTime() - researchWindowMilliseconds - 15 * 60 * 1000,
    );
    for (const candidate of output.candidates) {
      try {
        const publicationIssue = publicationWindowIssue(
          candidate.publishedAt,
          publicationWindowStart,
          publicationWindowEnd,
        );
        if (publicationIssue) {
          (report.qualityAdjustments as Json[]).push({
            sourceUrl: candidate.url,
            action: `SKIPPED_${publicationIssue}`,
            publishedAt: candidate.publishedAt,
          });
          continue;
        }
        const candidateKey = evidenceCandidateKey(candidate.url, candidate.excerpt);
        if (seenEvidence.has(candidateKey)) {
          (report.qualityAdjustments as Json[]).push({
            sourceUrl: candidate.url,
            action: 'SKIPPED_DUPLICATE_EVIDENCE_CANDIDATE',
          });
          continue;
        }
        seenEvidence.add(candidateKey);
        const evidence = await persistEvidence(candidate);
        report.artifactsRegistered = Number(report.artifactsRegistered) + 1;
        if (evidence.canonicalized) {
          (report.qualityAdjustments as Json[]).push({
            sourceUrl: evidence.sourceUrl,
            action: 'RESOLVED_CANONICAL_SOURCE',
            discoveredUrl: candidate.url,
          });
        }
        const droppedEntityMentions = candidate.entityMentions.filter(
          (entity) => !evidence.entityMentions.includes(entity),
        );
        if (evidence.publisher !== candidate.publisher) {
          (report.qualityAdjustments as Json[]).push({
            sourceUrl: evidence.sourceUrl,
            action: 'CORRECTED_PUBLISHER_FROM_SOURCE_METADATA',
            aiReportedPublisher: candidate.publisher,
            verifiedPublisher: evidence.publisher,
          });
        }
        if (!evidence.publisherVerified || !evidence.publicationDateVerified) {
          (report.qualityAdjustments as Json[]).push({
            sourceUrl: evidence.sourceUrl,
            action: 'SOURCE_METADATA_UNAVAILABLE',
            publisherVerified: evidence.publisherVerified,
            publicationDateVerified: evidence.publicationDateVerified,
          });
        }
        if (droppedEntityMentions.length) {
          (report.qualityAdjustments as Json[]).push({
            sourceUrl: evidence.sourceUrl,
            action: 'DROPPED_UNGROUNDED_ENTITY_MENTIONS',
            entityMentions: droppedEntityMentions,
          });
        }
        const claim: Record<string, Json> = {
          claimType: candidate.claimType,
          assertion: candidate.assertion,
          confidenceLevel: candidate.confidenceLevel,
          entityMentions: evidence.entityMentions,
          evidence: [
            {
              sourceArtifactId: evidence.sourceArtifactId,
              excerpt: candidate.excerpt,
              locator: evidence.sourceUrl,
              retrievedAt: evidence.retrievedAt,
            },
          ],
        };
        if (candidate.eventDate) claim.eventDate = candidate.eventDate;
        if (candidate.publishedAt) claim.publishedAt = candidate.publishedAt;
        if (candidate.confidenceScore !== null) claim.confidenceScore = candidate.confidenceScore;
        if (candidate.impactLevel) claim.impactLevel = candidate.impactLevel;
        if (candidate.timeHorizon) claim.timeHorizon = candidate.timeHorizon;
        items.push({
          rawPayload: {
            title: candidate.title,
            publisher: evidence.publisher,
            url: evidence.sourceUrl,
            discoveredUrl: candidate.url,
            sha256: evidence.sha256,
            storageUri: evidence.storageUri,
          },
          claim,
        });
      } catch (error) {
        warnings.push(
          `${candidate.url}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
    if (items.length) {
      const date = new Intl.DateTimeFormat('en-CA', {
        timeZone: env.ECONOMIC_TIMEZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      })
        .format(new Date())
        .replaceAll('-', '_');
      const submissionCode = `DAILY_${date}_PART_001`;
      const response = await backend(`/api/v1/intelligence/agent-runs/${agentRunId}/submissions`, {
        method: 'POST',
        body: JSON.stringify({ submissionCode, items }),
      });
      const submission = (await response.json()) as Record<string, Json>;
      report.submissionCode = submissionCode;
      report.submission = submission;
      report.findingsSent = items.length;
    }
    await completeRun(
      agentRunId,
      warnings.length ? 'PARTIAL' : 'SUCCEEDED',
      warnings.length,
      output.candidates.length,
    );
    report.status = warnings.length ? 'PARTIAL' : 'SUCCEEDED';
    report.warnings = warnings;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    report.error = message;
    report.warnings = warnings;
    if (agentRunId) {
      try {
        await completeRun(
          agentRunId,
          'FAILED',
          warnings.length + 1,
          Number(report.sourcesConsulted),
          message,
        );
      } catch (closeError) {
        report.closeError = closeError instanceof Error ? closeError.message : String(closeError);
      }
    }
    throw error;
  } finally {
    await saveReport();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
