import { createHash, randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';

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
  'OPENAI_API_KEY',
  'OPENAI_MODEL',
] as const;

const env = Object.fromEntries(
  requiredNames.map((name) => {
    const value = process.env[name]?.trim();
    if (!value) throw new Error(`Missing required configuration: ${name}`);
    return [name, value];
  }),
) as Record<(typeof requiredNames)[number], string>;

const report: Record<string, Json> = {
  startedAt: new Date().toISOString(),
  status: 'FAILED',
  warnings: [],
  sourcesConsulted: 0,
  artifactsRegistered: 0,
  findingsSent: 0,
};

function safeUrl(raw: string): URL {
  const url = new URL(raw);
  if (!['http:', 'https:'].includes(url.protocol))
    throw new Error('Only HTTP(S) sources are allowed');
  const host = url.hostname.toLowerCase();
  if (
    host === 'localhost' ||
    host === '::1' ||
    host.endsWith('.local') ||
    /^(127\.|10\.|192\.168\.|169\.254\.)/u.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./u.test(host)
  ) {
    throw new Error('Private network source rejected');
  }
  return url;
}

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
    publishedAt: { type: ['string', 'null'] },
    eventDate: { type: ['string', 'null'] },
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

async function research(): Promise<ResearchOutput> {
  const now = new Date();
  const since = new Date(now.getTime() - 72 * 60 * 60 * 1000);
  const response = await request(
    'https://api.openai.com/v1/responses',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: env.OPENAI_MODEL,
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
                candidates: { type: 'array', maxItems: 12, items: candidateSchema },
              },
              required: ['candidates'],
            },
          },
        },
        input: `Investiga novedades económicas verificables publicadas entre ${since.toISOString()} y ${now.toISOString()} que afecten a Bolivia. Prioriza BCB, INE, ASFI, MEFP, ministerios, organismos multilaterales y documentos corporativos oficiales. Abre las fuentes; no uses snippets. Devuelve como máximo 12 hallazgos. Cada excerpt debe ser una cita textual corta que aparezca en la URL indicada. No inventes fechas, cifras ni URLs. Si no hay novedades suficientemente sustentadas, devuelve candidates vacío.`,
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
  return JSON.parse(outputText) as ResearchOutput;
}

function contentExtension(contentType: string): string {
  if (contentType.includes('pdf')) return 'pdf';
  if (contentType.includes('json')) return 'json';
  if (contentType.includes('html')) return 'html';
  return 'txt';
}

function visibleText(bytes: Buffer, contentType: string): string {
  if (contentType.includes('pdf')) return '';
  let outsideMarkup = '';
  let insideTag = false;
  for (const character of bytes.toString('utf8')) {
    if (character === '<') {
      insideTag = true;
      outsideMarkup += ' ';
    } else if (character === '>') {
      insideTag = false;
      outsideMarkup += ' ';
    } else if (!insideTag) {
      outsideMarkup += character;
    }
  }
  return outsideMarkup
    .replace(/&nbsp;/giu, ' ')
    .replace(/&amp;/giu, '&')
    .replace(/\s+/gu, ' ')
    .trim();
}

function comparable(value: string): string {
  return value.normalize('NFKC').replace(/\s+/gu, ' ').trim().toLocaleLowerCase('es');
}

async function persistEvidence(candidate: Candidate) {
  const sourceUrl = safeUrl(candidate.url);
  const sourceResponse = await request(
    sourceUrl.toString(),
    { headers: { 'User-Agent': 'EconomicDataCenterCollector/1.0' } },
    [200],
    45_000,
  );
  const bytes = Buffer.from(await sourceResponse.arrayBuffer());
  if (!bytes.length || bytes.length > 5_000_000)
    throw new Error(`Unsupported source size: ${bytes.length}`);
  const contentType =
    (sourceResponse.headers.get('content-type') ?? 'text/plain').split(';')[0]?.trim() ??
    'text/plain';
  const text = visibleText(bytes, contentType);
  if (text && !comparable(text).includes(comparable(candidate.excerpt))) {
    throw new Error('The cited excerpt was not found in the downloaded source');
  }
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
  await request(githubUrl, { headers: storageHeaders }, [200], 30_000);
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
      metadataJson: { title: candidate.title, publisher: candidate.publisher },
    }),
  });
  const artifactPayload = (await artifactResponse.json()) as {
    artifact?: { sourceArtifactId?: string };
  };
  const sourceArtifactId = artifactPayload.artifact?.sourceArtifactId;
  if (!sourceArtifactId) throw new Error('Backend did not return sourceArtifactId');
  return { sourceArtifactId, retrievedAt, storageUri, sha256 };
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
    for (const candidate of output.candidates) {
      try {
        const evidence = await persistEvidence(candidate);
        report.artifactsRegistered = Number(report.artifactsRegistered) + 1;
        const claim: Record<string, Json> = {
          claimType: candidate.claimType,
          assertion: candidate.assertion,
          confidenceLevel: candidate.confidenceLevel,
          entityMentions: candidate.entityMentions,
          evidence: [
            {
              sourceArtifactId: evidence.sourceArtifactId,
              excerpt: candidate.excerpt,
              locator: candidate.url,
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
            publisher: candidate.publisher,
            url: candidate.url,
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
