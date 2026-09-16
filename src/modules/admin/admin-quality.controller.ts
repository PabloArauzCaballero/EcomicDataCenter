import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { ACTOR_ROLES } from '../../common/auth/actor';
import { Roles } from '../../common/auth/auth.decorators';
import { RequestId } from '../../common/http/request-id.decorator';
import { ZodValidationPipe } from '../../common/validation/zod-validation.pipe';
import { paginate } from './admin-cursor';
import { envelope, shareOrNull, type AdminEnvelope } from './admin.envelope';
import { qualityEvaluationQuerySchema, type QualityEvaluationQuery } from './admin.schemas';
import { NotFoundError } from '../../common/errors/application.error';
import { DeploymentIdentity } from './deployment-identity';
import { QualityViewRepository } from './quality-view.repository';

/** The only shape the issue route accepts in its path. */
export const issueParamsSchema = z.object({ dataIssueId: z.string().uuid() });

/**
 * Quality results with the population behind every one of them.
 *
 * `share` is null whenever there is no denominator, and the count is always
 * next to it. That pairing is the whole contract of this screen: «80 %» is not
 * an answer, «8 de 10» is, and «0 de 0» is not a hundred per cent.
 */
@ApiTags('Administration')
@ApiBearerAuth()
@Controller('admin/quality')
export class AdminQualityController {
  constructor(
    private readonly identity: DeploymentIdentity,
    private readonly quality: QualityViewRepository,
  ) {}

  @Get('evaluations')
  @Roles(ACTOR_ROLES.ANALYST, ACTOR_ROLES.METHODOLOGY_STEWARD)
  @ApiOperation({ operationId: 'listAdminQualityEvaluations', summary: 'Rule evaluations' })
  async evaluations(
    @Query(new ZodValidationPipe(qualityEvaluationQuerySchema)) query: QualityEvaluationQuery,
    @RequestId() requestId: string,
  ): Promise<AdminEnvelope<unknown>> {
    const rows = await this.quality.evaluations(query);
    const page = paginate(rows, query.pageSize, (row) => ({
      occurredAt: row.assessed_at.toISOString(),
      identifier: row.quality_assessment_id,
    }));
    return envelope(
      {
        items: page.items.map((row) => {
          const numerator = row.numerator === null ? null : Number(row.numerator);
          const denominator = row.denominator === null ? null : Number(row.denominator);
          return {
            evaluationId: row.quality_assessment_id,
            ruleCode: row.rule_code,
            ruleName: row.rule_name,
            ruleVersion: row.rule_version,
            dimension: row.dimension,
            severity: row.severity,
            scope: row.evaluation_scope,
            status: row.status,
            numerator,
            denominator,
            notEvaluated: row.not_evaluated === null ? null : Number(row.not_evaluated),
            share:
              numerator === null || denominator === null
                ? null
                : shareOrNull(numerator, denominator),
            measuredValue: row.measured_value,
            evidence: row.details,
            assessedAt: row.assessed_at.toISOString(),
            cutoffAt: row.cutoff_at ? row.cutoff_at.toISOString() : null,
          };
        }),
        nextCursor: page.nextCursor,
      },
      {
        environmentId: this.identity.environmentId,
        requestId,
        observedAt: page.items[0]?.assessed_at ?? null,
        evidenceState: rows.length ? 'known' : 'unknown',
      },
    );
  }

  /**
   * One issue, its evidence and everything that was done to it.
   *
   * The original observation is never rewritten by a resolution, so the detail
   * shows the measurement that raised the issue next to the decisions taken
   * afterwards; a closure that erased the evidence would leave a status nobody
   * could argue with.
   */
  @Get('issues/:dataIssueId')
  @Roles(ACTOR_ROLES.ANALYST, ACTOR_ROLES.METHODOLOGY_STEWARD)
  @ApiOperation({ operationId: 'getAdminQualityIssue', summary: 'One quality issue' })
  async issue(
    @Param(new ZodValidationPipe(issueParamsSchema)) params: { dataIssueId: string },
    @RequestId() requestId: string,
  ): Promise<AdminEnvelope<unknown>> {
    const issue = await this.quality.findIssue(params.dataIssueId);
    if (!issue) throw new NotFoundError('Data issue', params.dataIssueId);
    const history = await this.quality.issueHistory(params.dataIssueId);
    const numerator = issue.numerator === null ? null : Number(issue.numerator);
    const denominator = issue.denominator === null ? null : Number(issue.denominator);
    return envelope(
      {
        dataIssueId: issue.data_issue_id,
        issueType: issue.issue_type,
        severity: issue.severity,
        status: issue.status,
        title: issue.title,
        description: issue.description,
        target: { type: issue.target_entity_type, id: issue.target_entity_id },
        detectedAt: issue.detected_at.toISOString(),
        resolvedAt: issue.resolved_at ? issue.resolved_at.toISOString() : null,
        resolutionNotes: issue.resolution_notes,
        evidence: {
          ruleCode: issue.rule_code,
          assessmentStatus: issue.assessment_status,
          measuredValue: issue.measured_value,
          numerator,
          denominator,
          share:
            numerator === null || denominator === null ? null : shareOrNull(numerator, denominator),
        },
        history: history.map((entry) => ({
          actorSubject: entry.actor_subject,
          actorRoles: entry.actor_roles.split(',').filter(Boolean),
          action: entry.action,
          outcome: entry.outcome,
          details: entry.details_json,
          occurredAt: entry.occurred_at.toISOString(),
        })),
      },
      {
        environmentId: this.identity.environmentId,
        requestId,
        observedAt: issue.detected_at,
        evidenceState: issue.rule_code ? 'known' : 'unknown',
      },
    );
  }

  /**
   * Coverage first, results second.
   *
   * The listing starts from the declared rules, so a rule that has never run is
   * on the screen. A summary built from assessments alone cannot show the check
   * nobody performed, which is the one worth knowing about.
   */
  @Get('summary')
  @Roles(ACTOR_ROLES.ANALYST, ACTOR_ROLES.METHODOLOGY_STEWARD)
  @ApiOperation({ operationId: 'getAdminQualitySummary', summary: 'Rule coverage and issues' })
  async summary(@RequestId() requestId: string): Promise<AdminEnvelope<unknown>> {
    const [coverage, issues] = await Promise.all([
      this.quality.ruleCoverage(),
      this.quality.openIssues(),
    ]);
    const evaluated = coverage.filter((rule) => Number(rule.evaluations) > 0);
    return envelope(
      {
        rules: coverage.map((rule) => ({
          ruleCode: rule.rule_code,
          ruleName: rule.rule_name,
          severity: rule.severity,
          isActive: rule.is_active,
          evaluations: Number(rule.evaluations),
          lastAssessedAt: rule.last_assessed_at ? rule.last_assessed_at.toISOString() : null,
          lastStatus: rule.last_status ?? 'NOT_EVALUATED',
        })),
        coverage: {
          declared: coverage.length,
          evaluated: evaluated.length,
          share: shareOrNull(evaluated.length, coverage.length),
        },
        blocking: coverage.filter(
          (rule) => rule.last_status === 'FAIL' && ['ERROR', 'CRITICAL'].includes(rule.severity),
        ).length,
        issues: issues.map((issue) => ({
          severity: issue.severity,
          status: issue.status,
          issues: Number(issue.issues),
        })),
      },
      {
        environmentId: this.identity.environmentId,
        requestId,
        observedAt: new Date(),
        evidenceState: evaluated.length ? 'known' : 'unknown',
      },
    );
  }
}
