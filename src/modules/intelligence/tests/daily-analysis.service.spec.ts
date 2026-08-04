import type { Actor } from '../../../common/auth/actor';
import { TracingService } from '../../../common/observability/tracing.service';
import type { AgentRegistryService } from '../agent-registry.service';
import { DailyAnalysisService } from '../daily-analysis.service';
import type { ReviewService } from '../review.service';
import type { SubmissionService } from '../submission.service';
import type { SubmitDailyAnalysisInput } from '../intelligence.schemas';

const ORG = '33333333-3333-4333-8333-333333333333';
const ARTIFACT = '22222222-2222-4222-8222-222222222222';

const actor: Actor = { subject: 'agent-1', roles: ['INGESTION_AGENT'], organizationId: ORG };

const input: SubmitDailyAnalysisInput = {
  agent: {
    agentCode: 'CODEX-01',
    triggerType: 'SCHEDULED',
    attemptNo: 1,
    promptVersion: 'p1',
    schemaVersion: 's1',
  },
  submission: {
    submissionCode: 'DAILY-001',
    items: [
      {
        rawPayload: { value: 1 },
        claim: {
          claimType: 'INDICATOR_READING',
          assertion: 'The reference exchange rate held steady during the session.',
          confidenceLevel: 'HIGH',
          entityMentions: [],
          evidence: [
            {
              sourceArtifactId: ARTIFACT,
              excerpt: 'Official bulletin reports an unchanged reference rate for the day.',
              retrievedAt: new Date('2026-07-22T00:00:00.000Z'),
            },
          ],
        },
      },
    ],
  },
  completion: { status: 'SUCCEEDED', sourcesConsulted: 2, warningCount: 0 },
};

function buildService(overrides: {
  open?: jest.Mock;
  submit?: jest.Mock;
  completeRun?: jest.Mock;
}): {
  service: DailyAnalysisService;
  open: jest.Mock;
  submit: jest.Mock;
  completeRun: jest.Mock;
} {
  const open =
    overrides.open ?? jest.fn().mockResolvedValue({ agentRunId: 'run-1', agentCode: 'CODEX-01' });
  const submit =
    overrides.submit ??
    jest.fn().mockResolvedValue({ agentRunId: 'run-1', submissionCode: 'DAILY-001', items: [] });
  const completeRun =
    overrides.completeRun ??
    jest.fn().mockResolvedValue({ agentRunId: 'run-1', status: 'SUCCEEDED' });
  const service = new DailyAnalysisService(
    { open } as unknown as AgentRegistryService,
    { submit } as unknown as SubmissionService,
    { completeRun } as unknown as ReviewService,
    new TracingService(),
  );
  return { service, open, submit, completeRun };
}

describe('DailyAnalysisService', () => {
  it('opens the run, submits the claims and closes the run in order', async () => {
    const { service, open, submit, completeRun } = buildService({});

    const result = await service.run(input, actor, 'corr-1');

    expect(open).toHaveBeenCalledWith(input.agent, actor, 'corr-1');
    expect(submit).toHaveBeenCalledWith('run-1', input.submission, actor);
    expect(completeRun).toHaveBeenCalledWith('run-1', input.completion, actor);
    expect(result).toMatchObject({
      agentRunId: 'run-1',
      agentCode: 'CODEX-01',
      correlationId: 'corr-1',
      completion: { status: 'SUCCEEDED' },
    });
  });

  it('closes the run as FAILED and rethrows when the submission fails', async () => {
    const submit = jest.fn().mockRejectedValue(new Error('submission failed'));
    const completeRun = jest.fn().mockResolvedValue({ agentRunId: 'run-1', status: 'FAILED' });
    const { service } = buildService({ submit, completeRun });

    await expect(service.run(input, actor, 'corr-1')).rejects.toThrow('submission failed');
    expect(completeRun).toHaveBeenCalledWith(
      'run-1',
      expect.objectContaining({ status: 'FAILED' }),
      actor,
    );
  });

  it('never masks the original error when the failure close also fails', async () => {
    const submit = jest.fn().mockRejectedValue(new Error('submission failed'));
    const completeRun = jest.fn().mockRejectedValue(new Error('close failed'));
    const { service } = buildService({ submit, completeRun });

    await expect(service.run(input, actor, 'corr-1')).rejects.toThrow('submission failed');
  });
});
