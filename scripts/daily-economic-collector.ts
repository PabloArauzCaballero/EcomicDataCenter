import { createHash, randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { z } from 'zod';
import {
  calibrateConfidenceForExcerptUniqueness,
  comparable,
  evidenceCandidateKey,
  locateExcerpt,
  publicationLocalDateIssue,
  publicationWindowIssue,
  requireVerifiableText,
  resolveLinkedArticle,
  visibleText,
} from '../src/modules/intelligence/evidence-quality';
import { assessEvidenceContentType } from '../src/modules/intelligence/evidence-content-type';
import {
  calibrateConfidenceForGrounding,
  groundClaimToExcerpt,
} from '../src/modules/intelligence/claim-evidence-grounding';
import {
  consolidateCorroboratingClaims,
  summarizeCorroboration,
  type CorroboratedClaim,
  type CorroboratedClaimItem,
} from '../src/modules/intelligence/claim-corroboration';
import {
  extractPdfEvidence,
  pdfMetadataPublicationDates,
} from '../src/modules/intelligence/pdf-text-extraction';
import {
  canonicalSourceUrl,
  htmlSourceMetadata,
} from '../src/modules/intelligence/source-metadata';
import { jsonSourceMetadata } from '../src/modules/intelligence/json-source-metadata';
import { indicatorEventDateIssue } from '../src/modules/intelligence/indicator-event-date';
import {
  parallelQuotationAssertion,
  parseBcbQuotationTable,
  parseParallelQuotation,
} from '../src/modules/intelligence/daily-indicator-parsers';
import {
  undatedOfficialIndicator,
  verifiedSource,
} from '../src/modules/intelligence/verified-source-registry';
import { assessPublicationMetadata } from '../src/modules/intelligence/publication-metadata';
import { calibrateConfidenceForSourceMetadata } from '../src/modules/intelligence/source-metadata-confidence';
import { verifyStoredEvidenceBlob } from '../src/modules/intelligence/storage-integrity';
import type { GitHubBlobPayload } from '../src/modules/intelligence/storage-integrity';
import {
  fetchPublicSource,
  readResponseBodyLimited,
  validatePublicSourceUrl,
} from '../src/modules/intelligence/safe-source-fetch';
import {
  assessSourceBodyLength,
  sourceResponseProvenance,
} from '../src/modules/intelligence/source-response-provenance';
import { assessSourceContentDigest } from '../src/modules/intelligence/source-content-digest';
import { decodeSourceText } from '../src/modules/intelligence/source-text-decoding';
import {
  economicResearchInstructions,
  economicResearchSystemInstruction,
} from '../src/modules/intelligence/research-policy';

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

type DownloadedSource = Awaited<ReturnType<typeof downloadEvidenceSource>>;

/**
 * How the candidate's source was reached.
 *
 * A deterministic collector parses a known endpoint, so its publisher is
 * established by the domain the collector downloaded. Research output is
 * untrusted: everything about it, the publisher included, has to be verified
 * against the downloaded page.
 */
type SourceTrust = 'DIRECT' | 'AI_REPORTED';

interface Candidate {
  sourceTrust: SourceTrust;
  /**
   * Bytes the reading was parsed from, when a deterministic collector already
   * downloaded them.
   *
   * A market endpoint refreshes its quotation about once a minute, so
   * downloading the source a second time to build the evidence raced the value:
   * the quotation cited no longer appeared in the bytes that were stored, and
   * the reading was discarded as unverifiable. Retaining the exact response
   * makes the evidence the very thing the value was read from.
   */
  prefetched?: DownloadedSource;
  recordType: 'DAILY_INDICATOR' | 'NEWS';
  dataCategory:
    'FX_OFFICIAL' | 'FX_PARALLEL' | 'UFV' | 'SOVEREIGN_BONDS' | 'MACRO_DAILY' | 'COMPANY_NEWS';
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

/**
 * Research output declares neither its own trust level nor its evidence: the
 * collector assigns the first and downloads the second.
 */
type AiCandidate = Omit<Candidate, 'sourceTrust' | 'prefetched'>;

interface ResearchOutput {
  candidates: AiCandidate[];
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
/**
 * Model for the selected provider.
 *
 * A provider-specific variable wins over the shared one, so switching provider
 * is a single change. Reading only the shared `AI_MODEL` meant a switch would
 * have sent one provider's model name to the other and failed on the first
 * call, while the already-configured `OPENAI_MODEL` was never read at all.
 */
const aiModel =
  process.env[aiProvider === 'groq' ? 'GROQ_MODEL' : 'OPENAI_MODEL']?.trim() ||
  process.env.AI_MODEL?.trim() ||
  (aiProvider === 'groq' ? 'groq/compound' : 'gpt-5.6-terra');
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
  directCollectorErrors: [],
};

const researchWindowMilliseconds = 72 * 60 * 60 * 1000;
const maximumEvidenceBytes = 5_000_000;
const collectorUserAgent = 'EconomicDataCenterCollector/1.0';

/**
 * Categories a deterministic collector produces on any calendar day, so their
 * absence is a real coverage failure the scheduler must surface.
 */
const requiredDailyCategories = ['FX_OFFICIAL', 'FX_PARALLEL', 'UFV'] as const;

/**
 * Categories that depend on a publication the country does not make daily.
 *
 * Bond quotations and macro releases do not exist on a weekend or a holiday,
 * so demanding them every run marked every single execution as failed and hid
 * the failures that were real.
 */
const desiredDailyCategories = ['SOVEREIGN_BONDS', 'MACRO_DAILY', 'COMPANY_NEWS'] as const;

/**
 * Research budget.
 *
 * The provider counts the prompt, the search loop and the reserved completion
 * against one tokens-per-minute window, so a generous result cap made every
 * attempt exceed the window and return nothing at all. A smaller cap that
 * succeeds collects more than a larger one that is always rejected.
 */
const maximumResearchResults = 12;
const maximumResearchCompletionTokens = 3_000;

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

function retryDelayMilliseconds(response: Response, attempt: number): number {
  const retryAfter = response.headers.get('retry-after')?.trim();
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) {
      const delay = Math.min(Math.max(seconds * 1_000, 1_000), 90_000);
      return response.status === 429 ? Math.max(delay, 60_000) : delay;
    }
    const retryDate = Date.parse(retryAfter);
    if (Number.isFinite(retryDate)) {
      const delay = Math.min(Math.max(retryDate - Date.now(), 1_000), 90_000);
      return response.status === 429 ? Math.max(delay, 60_000) : delay;
    }
  }
  if (response.status === 429) return 60_000;
  return [1_000, 5_000][attempt] ?? 10_000;
}

async function requestAi(url: string, init: RequestInit): Promise<Response> {
  const maximumAttempts = 4;
  for (let attempt = 0; attempt < maximumAttempts; attempt += 1) {
    const response = await fetch(url, { ...init, signal: AbortSignal.timeout(300_000) });
    if (response.status === 200) return response;
    const body = (await response.text()).slice(0, 1_000);
    const retryable = response.status === 408 || response.status === 429 || response.status >= 500;
    if (!retryable || attempt === maximumAttempts - 1) {
      throw new Error(
        `${init.method ?? 'GET'} ${new URL(url).pathname} returned ${response.status}: ${body}`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, retryDelayMilliseconds(response, attempt)));
  }
  throw new Error('AI provider retry loop exhausted unexpectedly');
}

/** Calendar date of an instant in the deployment's reporting time zone. */
function localDate(instant: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: env.ECONOMIC_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant);
}

async function researchOfficialBcb(): Promise<Candidate[]> {
  const url = 'https://www.bcb.gob.bo/librerias/indicadores/otras/ultimo.php';
  const prefetched = await downloadEvidenceSource(url);
  const {
    effectiveDate: eventDate,
    officialRate,
    ufv,
  } = parseBcbQuotationTable(prefetched.decodedText ?? '');
  const candidates: Candidate[] = [];
  if (officialRate) {
    candidates.push({
      sourceTrust: 'DIRECT',
      prefetched,
      recordType: 'DAILY_INDICATOR',
      dataCategory: 'FX_OFFICIAL',
      title: 'Tabla de Cotizaciones',
      url,
      publisher: 'BANCO CENTRAL DE BOLIVIA',
      publishedAt: null,
      eventDate,
      claimType: 'INDICATOR_READING',
      assertion: `El tipo de cambio oficial de Bolivia es ${officialRate} Bs/USD.`,
      excerpt: `Tipo de Cambio Oficial (TCO) (Bs/USD) ESTADOS UNIDOS D&Oacute;LAR USD ${officialRate}`,
      confidenceLevel: 'VERY_HIGH',
      confidenceScore: 0.99,
      impactLevel: 'HIGH',
      timeHorizon: 'IMMEDIATE',
      entityMentions: [],
    });
  }
  if (ufv) {
    candidates.push({
      sourceTrust: 'DIRECT',
      prefetched,
      recordType: 'DAILY_INDICATOR',
      dataCategory: 'UFV',
      title: 'Tabla de Cotizaciones',
      url,
      publisher: 'BANCO CENTRAL DE BOLIVIA',
      publishedAt: null,
      eventDate,
      claimType: 'INDICATOR_READING',
      assertion: `La Unidad de Fomento de Vivienda es ${ufv} Bs/UFV.`,
      excerpt: `BOLIVIA (UFV) UNIDAD DE FOMENTO DE VIVIENDA Bs/UFV ${ufv}`,
      confidenceLevel: 'VERY_HIGH',
      confidenceScore: 0.99,
      impactLevel: 'MEDIUM',
      timeHorizon: 'IMMEDIATE',
      entityMentions: [],
    });
  }
  if (!candidates.length) throw new Error('BCB quotation page contained no USD or UFV readings');
  return candidates;
}

/**
 * Venues quoted for the parallel USD rate.
 *
 * Bolivia has no official parallel quotation, so the rate is observed where it
 * actually trades. Each venue is read independently and kept as its own claim
 * with its own evidence: three venues that agree corroborate each other, and a
 * venue that drifts stays visible instead of being averaged away.
 */
const parallelExchangeVenues = ['/v1/eldorado', '/v1/saldoar', '/v1/takenos'] as const;
const parallelExchangeBaseUrl = 'https://api.dolarbluebolivia.click';

/**
 * Reads one venue and turns its literal payload into a candidate reading.
 */
async function researchParallelVenue(path: string): Promise<Candidate> {
  const url = `${parallelExchangeBaseUrl}${path}`;
  const prefetched = await downloadEvidenceSource(url);
  const quotation = parseParallelQuotation(prefetched.decodedText ?? '');
  return {
    sourceTrust: 'DIRECT',
    prefetched,
    recordType: 'DAILY_INDICATOR',
    dataCategory: 'FX_PARALLEL',
    title: quotation.instrument,
    url,
    publisher: 'DOLAR BLUE BOLIVIA',
    publishedAt: quotation.capturedAt,
    eventDate: localDate(new Date(quotation.capturedAt)),
    claimType: 'INDICATOR_READING',
    assertion: parallelQuotationAssertion(quotation),
    excerpt: quotation.excerpt,
    confidenceLevel: 'HIGH',
    confidenceScore: 0.85,
    impactLevel: 'HIGH',
    timeHorizon: 'IMMEDIATE',
    entityMentions: [quotation.venue],
  };
}

async function researchParallelExchange(): Promise<Candidate[]> {
  const candidates: Candidate[] = [];
  for (const path of parallelExchangeVenues) {
    try {
      candidates.push(await researchParallelVenue(path));
    } catch (error) {
      (report.directCollectorErrors as Json[]).push({
        collector: `parallel-exchange${path}`,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  if (!candidates.length) throw new Error('No parallel exchange venue returned a quotation');
  return candidates;
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
    recordType: { type: 'string', enum: ['DAILY_INDICATOR', 'NEWS'] },
    dataCategory: {
      type: 'string',
      enum: ['FX_OFFICIAL', 'FX_PARALLEL', 'UFV', 'SOVEREIGN_BONDS', 'MACRO_DAILY', 'COMPANY_NEWS'],
    },
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
    'recordType',
    'dataCategory',
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
        recordType: z.enum(['DAILY_INDICATOR', 'NEWS']),
        dataCategory: z.enum([
          'FX_OFFICIAL',
          'FX_PARALLEL',
          'UFV',
          'SOVEREIGN_BONDS',
          'MACRO_DAILY',
          'COMPANY_NEWS',
        ]),
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
    .max(maximumResearchResults),
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

/**
 * Field list sent instead of the full JSON Schema.
 *
 * Serializing `candidateSchema` into the request body cost more tokens than the
 * instructions themselves, and the provider bills the prompt against the same
 * per-minute budget as the agentic search loop, so every attempt was rejected
 * before any research happened. The collector validates the response against
 * the real schema on arrival, so the model only needs the field names.
 */
const researchResponseShape = [
  'recordType (DAILY_INDICATOR|NEWS)',
  `dataCategory (${candidateSchema.properties.dataCategory.enum.join('|')})`,
  'title',
  'url',
  'publisher',
  'publishedAt (ISO-8601 con zona, o null)',
  'eventDate (YYYY-MM-DD, o null)',
  `claimType (${candidateSchema.properties.claimType.enum.join('|')})`,
  'assertion',
  'excerpt',
  'confidenceLevel (VERY_LOW|LOW|MEDIUM|HIGH|VERY_HIGH)',
  'confidenceScore (0..1, o null)',
  'impactLevel (CRITICAL|HIGH|MEDIUM|LOW|NEGLIGIBLE, o null)',
  'timeHorizon (IMMEDIATE|SHORT_TERM|MEDIUM_TERM|LONG_TERM|STRUCTURAL, o null)',
  'entityMentions (array de strings)',
].join(', ');

function researchPrompt(since: Date, now: Date): string {
  return `${economicResearchInstructions(since, now)} El colector descargara cada fuente y rechazara cualquier dato que no coincida. Responde solo con JSON: {"candidates":[...]} donde cada elemento tiene exactamente estos campos: ${researchResponseShape}.`;
}

async function researchWithGroq(since: Date, now: Date): Promise<ResearchOutput> {
  const response = await requestAi('https://api.groq.com/openai/v1/chat/completions', {
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
      max_completion_tokens: maximumResearchCompletionTokens,
      search_settings: { country: 'bolivia' },
      compound_custom: { tools: { enabled_tools: ['web_search'] } },
    }),
  });
  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = payload.choices?.[0]?.message?.content;
  if (!content) throw new Error('Groq returned no JSON output');
  return parseResearchOutput(content);
}

async function researchWithOpenAi(since: Date, now: Date): Promise<ResearchOutput> {
  const response = await requestAi('https://api.openai.com/v1/responses', {
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
              candidates: {
                type: 'array',
                maxItems: maximumResearchResults,
                items: candidateSchema,
              },
            },
            required: ['candidates'],
          },
        },
      },
      instructions: economicResearchSystemInstruction,
      input: economicResearchInstructions(since, now),
    }),
  });
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

/** Deterministic collectors, each isolated so one broken source cannot hide the rest. */
const directCollectors = [
  { name: 'official-bcb', collect: researchOfficialBcb },
  { name: 'parallel-exchange', collect: researchParallelExchange },
] as const;

async function research(): Promise<{ candidates: Candidate[] }> {
  const now = new Date();
  const since = new Date(now.getTime() - researchWindowMilliseconds);
  report.aiProvider = aiProvider;
  report.aiModel = aiModel;
  const direct: Candidate[] = [];
  for (const collector of directCollectors) {
    try {
      direct.push(...(await collector.collect()));
    } catch (error) {
      (report.directCollectorErrors as Json[]).push({
        collector: collector.name,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  try {
    const aiOutput =
      aiProvider === 'groq'
        ? await researchWithGroq(since, now)
        : await researchWithOpenAi(since, now);
    // Research output is untrusted no matter which provider produced it.
    const researched = aiOutput.candidates.map<Candidate>((candidate) => ({
      ...candidate,
      sourceTrust: 'AI_REPORTED',
    }));
    return { candidates: [...direct, ...researched] };
  } catch (error) {
    report.aiError = error instanceof Error ? error.message : String(error);
    return { candidates: direct };
  }
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
    { headers: { 'User-Agent': collectorUserAgent } },
    45_000,
  );
  if (sourceFetch.response.status !== 200) {
    throw new Error(`Source returned ${sourceFetch.response.status}`);
  }
  const bytes = await readResponseBodyLimited(sourceFetch.response, maximumEvidenceBytes);
  const contentDigestAssessment = assessSourceContentDigest(sourceFetch.response, bytes);
  if (['INVALID', 'MISMATCHED'].includes(contentDigestAssessment.status)) {
    throw new Error(
      `Source Content-Digest verification failed (${contentDigestAssessment.status})`,
    );
  }
  const declaredContentType = sourceFetch.response.headers.get('content-type') ?? undefined;
  const contentTypeAssessment = assessEvidenceContentType(bytes, declaredContentType);
  const contentType = contentTypeAssessment.effectiveMediaType;
  const textDecoding = contentType.includes('pdf')
    ? undefined
    : decodeSourceText(bytes, declaredContentType ?? contentType, contentType);
  return {
    bytes,
    contentType,
    sourceUrl: sourceFetch.finalUrl,
    redirectCount: sourceFetch.redirectCount,
    httpProvenance: sourceResponseProvenance(sourceFetch.response),
    bodyLengthAssessment: assessSourceBodyLength(sourceFetch.response, bytes.length),
    contentDigestAssessment,
    contentTypeAssessment,
    ...(textDecoding ? { decodedText: textDecoding.text, textDecoding } : {}),
  };
}

async function persistEvidence(candidate: Candidate) {
  const discoveredUrl = validatePublicSourceUrl(candidate.url);
  let downloaded = candidate.prefetched ?? (await downloadEvidenceSource(discoveredUrl));
  let { bytes, contentType, sourceUrl } = downloaded;
  let sourceRedirectCount = downloaded.redirectCount;
  // Article and canonical resolution exists to upgrade a section or homepage
  // URL supplied by the research model. A deterministic collector already
  // points at the exact document, and re-downloading it would only reopen the
  // race the retained response closes.
  const resolvesSource = candidate.sourceTrust === 'AI_REPORTED';
  if (resolvesSource && contentType.includes('html')) {
    const linkedArticle = resolveLinkedArticle(
      downloaded.decodedText ?? '',
      sourceUrl,
      candidate.title,
    );
    if (linkedArticle) {
      downloaded = await downloadEvidenceSource(linkedArticle);
      ({ bytes, contentType, sourceUrl } = downloaded);
      sourceRedirectCount += downloaded.redirectCount;
    }
  }
  let canonicalized = false;
  if (resolvesSource && contentType.includes('html')) {
    const metadata = htmlSourceMetadata(downloaded.decodedText ?? '');
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
  const text = pdfEvidence?.text ?? visibleText(downloaded.decodedText ?? '', contentType);
  requireVerifiableText(text, contentType);
  const sourceMetadata = contentType.includes('html')
    ? htmlSourceMetadata(downloaded.decodedText ?? '')
    : contentType.includes('json')
      ? jsonSourceMetadata(downloaded.decodedText ?? '')
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
  // The host is not self-reported: the SSRF guard resolved it and the bytes
  // above were downloaded from it, so a registered domain establishes the
  // publisher for pages that carry no metadata of their own.
  const registeredSource = verifiedSource(sourceUrl);
  const verifiedPublisher =
    sourceMetadata.publishers[0] ?? registeredSource?.publisher ?? candidate.publisher;
  const publisherVerification =
    sourceMetadata.publishers.length > 0
      ? 'SOURCE_METADATA'
      : registeredSource
        ? `REGISTERED_DOMAIN_${registeredSource.tier}`
        : 'UNVERIFIED';
  const publicationDateVerified =
    publicationDateAssessment === 'MATCHED' ||
    undatedOfficialIndicator({
      recordType: candidate.recordType,
      publishedAt: candidate.publishedAt,
      publicationDateAssessment,
      source: registeredSource,
    });
  if (!comparable(text).includes(comparable(candidate.title))) {
    throw new Error('The candidate title was not found in the final downloaded source');
  }
  const excerptLocator = locateExcerpt(text, candidate.excerpt);
  if (!excerptLocator) {
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
        publicationDateVerified,
        publisherVerification,
        discoveredUri: discoveredUrl.toString(),
        resolvedArticle: sourceUrl.toString() !== discoveredUrl.toString(),
        sourceRedirectCount,
        httpProvenance: downloaded.httpProvenance,
        bodyLengthVerification: downloaded.bodyLengthAssessment,
        contentDigestVerification: downloaded.contentDigestAssessment,
        contentTypeVerification: downloaded.contentTypeAssessment,
        canonicalized,
        storageVerification: 'MATCHED_SHA256_AND_SIZE',
        claimGroundingScope: 'CITED_EXCERPT',
        lexicalGrounding: grounding.lexicalGrounding,
        excerptTextLocator: excerptLocator,
        textExtractionStrategy: pdfEvidence ? 'PDFJS_TEXT_V1' : 'VISIBLE_TEXT_V1',
        ...(downloaded.textDecoding
          ? {
              textDecoding: {
                encoding: downloaded.textDecoding.encoding,
                selectionSource: downloaded.textDecoding.selectionSource,
                declaredEncoding: downloaded.textDecoding.declaredEncoding ?? null,
                httpDeclaredEncoding: downloaded.textDecoding.httpDeclaredEncoding ?? null,
                htmlMetaEncoding: downloaded.textDecoding.htmlMetaEncoding ?? null,
                replacementCharacterCount: downloaded.textDecoding.replacementCharacterCount,
              },
            }
          : {}),
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
    publisherVerified: publisherVerification !== 'UNVERIFIED',
    publicationDateVerified,
    excerptOccurrenceCount: excerptLocator.occurrenceCount,
    lexicalGrounding: grounding.lexicalGrounding,
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
  /**
   * Only a missing guaranteed category fails the run.
   *
   * A source that 404s, a venue that is briefly down or a research provider
   * having a bad minute are ordinary and were already recorded as warnings.
   * Letting any of them fail the scheduler made every run red, which is the
   * same as having no alert at all.
   */
  const coverageFailures: string[] = [];
  try {
    await waitForBackend();
    agentRunId = await openRun();
    report.agentRunId = agentRunId;
    const output = await research();
    report.sourcesConsulted = output.candidates.length;
    if (typeof report.aiError === 'string') warnings.push(`AI_RESEARCH_FAILED: ${report.aiError}`);
    for (const failure of report.directCollectorErrors as Json[]) {
      warnings.push(`DIRECT_COLLECTOR_FAILED: ${JSON.stringify(failure)}`);
    }
    const items: CorroboratedClaimItem[] = [];
    const collectedCategories = new Set<Candidate['dataCategory']>();
    const seenEvidence = new Set<string>();
    const localEventDate = localDate(new Date());
    const publicationWindowEnd = new Date(Date.now() + 15 * 60 * 1000);
    const publicationWindowStart = new Date(
      publicationWindowEnd.getTime() - researchWindowMilliseconds - 15 * 60 * 1000,
    );
    for (const candidate of output.candidates) {
      try {
        const categoryTypeMismatch =
          (candidate.dataCategory === 'COMPANY_NEWS' && candidate.recordType !== 'NEWS') ||
          (candidate.dataCategory !== 'COMPANY_NEWS' && candidate.recordType !== 'DAILY_INDICATOR');
        if (categoryTypeMismatch) {
          (report.qualityAdjustments as Json[]).push({
            sourceUrl: candidate.url,
            action: 'SKIPPED_CATEGORY_TYPE_MISMATCH',
            dataCategory: candidate.dataCategory,
            recordType: candidate.recordType,
          });
          continue;
        }
        const eventDateIssue =
          candidate.recordType === 'DAILY_INDICATOR'
            ? indicatorEventDateIssue(candidate.eventDate, new Date(), env.ECONOMIC_TIMEZONE)
            : undefined;
        if (eventDateIssue) {
          (report.qualityAdjustments as Json[]).push({
            sourceUrl: candidate.url,
            action: `SKIPPED_${eventDateIssue}`,
            eventDate: candidate.eventDate,
            expectedEventDate: localEventDate,
          });
          continue;
        }
        if (candidate.recordType === 'NEWS') {
          const localDateIssue = publicationLocalDateIssue(
            candidate.publishedAt,
            new Date(),
            env.ECONOMIC_TIMEZONE,
          );
          if (localDateIssue) {
            (report.qualityAdjustments as Json[]).push({
              sourceUrl: candidate.url,
              action: `SKIPPED_${localDateIssue}`,
              publishedAt: candidate.publishedAt,
              timeZone: env.ECONOMIC_TIMEZONE,
            });
            continue;
          }
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
        const requiresLexicalReview = evidence.lexicalGrounding.status !== 'SUPPORTED';
        const groundingConfidence = calibrateConfidenceForGrounding(
          candidate.confidenceLevel,
          candidate.confidenceScore,
          evidence.lexicalGrounding,
        );
        const metadataConfidence = calibrateConfidenceForSourceMetadata(
          groundingConfidence.confidenceLevel,
          groundingConfidence.confidenceScore,
          {
            publicationDateVerified: evidence.publicationDateVerified,
            publisherVerified: evidence.publisherVerified,
          },
        );
        for (const reason of metadataConfidence.reasons) {
          (report.qualityAdjustments as Json[]).push({
            sourceUrl: evidence.sourceUrl,
            action:
              reason === 'UNVERIFIED_PUBLICATION_DATE'
                ? 'ROUTED_TO_REVIEW_UNVERIFIED_PUBLICATION_DATE'
                : 'ROUTED_TO_REVIEW_UNVERIFIED_PUBLISHER',
            aiReportedConfidenceLevel: candidate.confidenceLevel,
            calibratedConfidenceLevel: metadataConfidence.confidenceLevel,
          });
        }
        const calibratedConfidence = calibrateConfidenceForExcerptUniqueness(
          metadataConfidence.confidenceLevel,
          metadataConfidence.confidenceScore,
          evidence.excerptOccurrenceCount,
        );
        if (evidence.excerptOccurrenceCount > 1) {
          (report.qualityAdjustments as Json[]).push({
            sourceUrl: evidence.sourceUrl,
            action: 'ROUTED_TO_REVIEW_AMBIGUOUS_EXCERPT',
            occurrenceCount: evidence.excerptOccurrenceCount,
            aiReportedConfidenceLevel: candidate.confidenceLevel,
            calibratedConfidenceLevel: calibratedConfidence.confidenceLevel,
          });
        }
        if (requiresLexicalReview) {
          (report.qualityAdjustments as Json[]).push({
            sourceUrl: evidence.sourceUrl,
            action: `ROUTED_TO_REVIEW_${evidence.lexicalGrounding.status}_LEXICAL_GROUNDING`,
            aiReportedConfidenceLevel: candidate.confidenceLevel,
            assertionTermCount: evidence.lexicalGrounding.assertionTermCount,
            matchedTermCount: evidence.lexicalGrounding.matchedTermCount,
            coverage: evidence.lexicalGrounding.coverage,
            polarityAligned: evidence.lexicalGrounding.polarityAligned,
            directionAligned: evidence.lexicalGrounding.directionAligned,
            assertionDirections: evidence.lexicalGrounding.assertionDirections,
            excerptDirections: evidence.lexicalGrounding.excerptDirections,
            assertionSignedDirections: evidence.lexicalGrounding.assertionSignedDirections,
            excerptSignedDirections: evidence.lexicalGrounding.excerptSignedDirections,
          });
        }
        const claim: CorroboratedClaim = {
          claimType: candidate.claimType,
          assertion: candidate.assertion,
          confidenceLevel: calibratedConfidence.confidenceLevel,
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
        if (calibratedConfidence.confidenceScore !== null) {
          claim.confidenceScore = calibratedConfidence.confidenceScore;
        }
        if (candidate.impactLevel) claim.impactLevel = candidate.impactLevel;
        if (candidate.timeHorizon) claim.timeHorizon = candidate.timeHorizon;
        const rawSource = {
          title: candidate.title,
          publisher: evidence.publisher,
          publisherVerified: evidence.publisherVerified,
          url: evidence.sourceUrl,
          discoveredUrl: candidate.url,
          sha256: evidence.sha256,
          storageUri: evidence.storageUri,
          publishedAt: candidate.publishedAt,
        };
        const rawPayload = {
          recordType: candidate.recordType,
          dataCategory: candidate.dataCategory,
          eventDate: candidate.eventDate,
          ...rawSource,
          sources: [rawSource],
          corroboration: summarizeCorroboration([rawSource]),
        };
        items.push({
          rawPayload,
          claim,
        });
        collectedCategories.add(candidate.dataCategory);
      } catch (error) {
        warnings.push(
          `${candidate.url}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
    const missingDailyCategories = requiredDailyCategories.filter(
      (category) => !collectedCategories.has(category),
    );
    for (const category of missingDailyCategories) {
      const failure = `Cobertura diaria incompleta: no se guardó ${category} para ${localEventDate}`;
      warnings.push(failure);
      coverageFailures.push(failure);
    }
    const missingDesiredCategories = desiredDailyCategories.filter(
      (category) => !collectedCategories.has(category),
    );
    report.coverage = {
      eventDate: localEventDate,
      collectedCategories: [...collectedCategories].sort(),
      missingRequiredCategories: missingDailyCategories,
      // Recorded, never fatal: these depend on a publication that does not
      // exist on a weekend or a holiday.
      missingDesiredCategories,
      companyNewsCollected: collectedCategories.has('COMPANY_NEWS'),
    };
    const consolidatedItems = consolidateCorroboratingClaims(items);
    if (consolidatedItems.length < items.length) {
      (report.qualityAdjustments as Json[]).push({
        action: 'CONSOLIDATED_CORROBORATING_CLAIMS',
        inputClaimCount: items.length,
        outputClaimCount: consolidatedItems.length,
      });
    }
    for (const item of consolidatedItems) {
      if (item.rawPayload.corroboration.sourceCount < 2) continue;
      (report.qualityAdjustments as Json[]).push({
        action: 'ASSESSED_CLAIM_CORROBORATION',
        assertionSha256: createHash('sha256').update(item.claim.assertion).digest('hex'),
        ...item.rawPayload.corroboration,
      });
    }
    if (consolidatedItems.length) {
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
        body: JSON.stringify({ submissionCode, items: consolidatedItems }),
      });
      const submission = (await response.json()) as Record<string, Json>;
      report.submissionCode = submissionCode;
      report.submission = submission;
      report.findingsSent = consolidatedItems.length;
    }
    const status = coverageFailures.length ? 'PARTIAL' : 'SUCCEEDED';
    await completeRun(agentRunId, status, warnings.length, output.candidates.length);
    report.status = status;
    report.warnings = warnings;
    if (coverageFailures.length) {
      // A missing guaranteed reading must be visible as a failed scheduler run.
      // The report and agent run retain PARTIAL so operators can distinguish a
      // coverage gap from a collector crash.
      process.exitCode = 1;
    }
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
