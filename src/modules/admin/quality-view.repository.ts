import { Injectable } from '@nestjs/common';
import { QueryTypes } from 'sequelize';
import { ReadQueryExecutor } from '../../common/persistence/read-query.executor';
import { decodeCursor } from './admin-cursor';
import type { QualityEvaluationQuery } from './admin.schemas';

export interface EvaluationRow {
  quality_assessment_id: string;
  rule_code: string;
  rule_name: string;
  rule_version: string | null;
  severity: string;
  dimension: string;
  evaluation_scope: string | null;
  status: string;
  numerator: string | null;
  denominator: string | null;
  not_evaluated: string | null;
  measured_value: string | null;
  threshold_value: string | null;
  details: Record<string, unknown>;
  assessed_at: Date;
  cutoff_at: Date | null;
}

export interface RuleCoverageRow {
  rule_code: string;
  rule_name: string;
  severity: string;
  is_active: boolean;
  evaluations: string;
  last_assessed_at: Date | null;
  last_status: string | null;
}

export interface IssueDetailRow {
  data_issue_id: string;
  issue_type: string;
  severity: string;
  status: string;
  title: string;
  description: string;
  target_entity_type: string;
  target_entity_id: string;
  detected_at: Date;
  resolved_at: Date | null;
  resolution_notes: string | null;
  rule_code: string | null;
  assessment_status: string | null;
  measured_value: string | null;
  numerator: string | null;
  denominator: string | null;
}

export interface IssueHistoryRow {
  actor_subject: string;
  actor_roles: string;
  action: string;
  outcome: string;
  details_json: Record<string, unknown>;
  occurred_at: Date;
}

/**
 * Reads quality results with the population they were measured against.
 *
 * Numerator, denominator and «not evaluated» travel together and are never
 * collapsed into a share here. A percentage computed in SQL loses the only
 * thing that makes it readable — how many rows it is a percentage of — and a
 * rule that evaluated nothing would come back as a hundred per cent, which is
 * the single most misleading number this portal could print.
 */
@Injectable()
export class QualityViewRepository {
  constructor(private readonly executor: ReadQueryExecutor) {}

  async evaluations(query: QualityEvaluationQuery): Promise<EvaluationRow[]> {
    const cursor = query.cursor ? decodeCursor(query.cursor) : null;
    return this.executor.run('operations.quality_evaluations', ({ database, transaction }) =>
      database.query<EvaluationRow>(
        `
SELECT
  assessment.quality_assessment_id::text AS quality_assessment_id,
  rule.code AS rule_code,
  rule.name AS rule_name,
  assessment.rule_version,
  rule.severity,
  dimension.code AS dimension,
  assessment.evaluation_scope,
  assessment.status,
  assessment.numerator::text AS numerator,
  assessment.denominator::text AS denominator,
  assessment.not_evaluated::text AS not_evaluated,
  assessment.measured_value,
  assessment.threshold_value,
  assessment.details,
  assessment.assessed_at,
  assessment.cutoff_at
FROM quality_lineage.quality_assessment assessment
JOIN quality_lineage.quality_rule rule ON rule.quality_rule_id = assessment.quality_rule_id
JOIN quality_lineage.quality_dimension dimension
  ON dimension.quality_dimension_id = rule.quality_dimension_id
WHERE (:ruleCode::varchar IS NULL OR rule.code = :ruleCode)
  AND (:result::varchar IS NULL OR assessment.status = :result)
  AND (:severity::varchar IS NULL OR rule.severity = :severity)
  AND (:since::timestamptz IS NULL OR assessment.assessed_at >= :since)
  AND (:until::timestamptz IS NULL OR assessment.assessed_at < :until)
  AND (
    :cursorAt::timestamptz IS NULL
    OR (assessment.assessed_at, assessment.quality_assessment_id)
       < (:cursorAt::timestamptz, :cursorId::bigint)
  )
ORDER BY assessment.assessed_at DESC, assessment.quality_assessment_id DESC
LIMIT :limit
        `,
        {
          type: QueryTypes.SELECT,
          transaction,
          replacements: {
            ruleCode: query.ruleCode ?? null,
            result: query.result ?? null,
            severity: query.severity ?? null,
            since: query.since ?? null,
            until: query.until ?? null,
            cursorAt: cursor?.occurredAt ?? null,
            cursorId: cursor?.identifier ?? null,
            limit: query.pageSize + 1,
          },
        },
      ),
    );
  }

  /**
   * Every declared rule, including the ones that have never been evaluated.
   *
   * Starting from the rule rather than from the results is the difference
   * between «all our checks pass» and «the checks that ran passed». A rule with
   * no evaluation is the most interesting row on the screen and it does not
   * exist in a listing built from assessments.
   */
  async ruleCoverage(): Promise<RuleCoverageRow[]> {
    return this.executor.run('operations.quality_rule_coverage', ({ database, transaction }) =>
      database.query<RuleCoverageRow>(
        `
SELECT
  rule.code AS rule_code,
  rule.name AS rule_name,
  rule.severity,
  rule.is_active,
  COALESCE(latest.evaluations, 0)::text AS evaluations,
  latest.last_assessed_at,
  latest.last_status
FROM quality_lineage.quality_rule rule
LEFT JOIN LATERAL (
  SELECT
    COUNT(*) AS evaluations,
    MAX(assessment.assessed_at) AS last_assessed_at,
    (ARRAY_AGG(assessment.status ORDER BY assessment.assessed_at DESC))[1] AS last_status
    FROM quality_lineage.quality_assessment assessment
   WHERE assessment.quality_rule_id = rule.quality_rule_id
) latest ON TRUE
ORDER BY rule.code
        `,
        { type: QueryTypes.SELECT, transaction },
      ),
    );
  }

  /**
   * One issue with the evaluation that raised it and the actions taken on it.
   *
   * The history comes from the audit trail rather than from a column on the
   * issue, because the issue holds its current state and the audit holds what
   * happened to it. Reading the second is how a resolution can be shown without
   * the original observation having been touched.
   */
  async findIssue(dataIssueId: string): Promise<IssueDetailRow | null> {
    const rows = await this.executor.run('operations.quality_issue', ({ database, transaction }) =>
      database.query<IssueDetailRow>(
        `
SELECT
  issue.data_issue_id,
  issue.issue_type,
  issue.severity,
  issue.status,
  issue.title,
  issue.description,
  issue.target_entity_type,
  issue.target_entity_id,
  issue.detected_at,
  issue.resolved_at,
  issue.resolution_notes,
  rule.code AS rule_code,
  assessment.status AS assessment_status,
  assessment.measured_value,
  assessment.numerator::text AS numerator,
  assessment.denominator::text AS denominator
FROM quality_lineage.data_issue issue
LEFT JOIN quality_lineage.quality_assessment assessment
  ON assessment.quality_assessment_id = issue.quality_assessment_id
LEFT JOIN quality_lineage.quality_rule rule
  ON rule.quality_rule_id = assessment.quality_rule_id
WHERE issue.data_issue_id = :dataIssueId
        `,
        { type: QueryTypes.SELECT, transaction, replacements: { dataIssueId } },
      ),
    );
    return rows[0] ?? null;
  }

  async issueHistory(dataIssueId: string): Promise<IssueHistoryRow[]> {
    return this.executor.run('operations.quality_issue_history', ({ database, transaction }) =>
      database.query<IssueHistoryRow>(
        `
SELECT actor_subject, actor_roles, action, outcome, details_json, occurred_at
FROM audit.audit_log
WHERE entity_reference = :dataIssueId
ORDER BY occurred_at DESC
LIMIT 100
        `,
        { type: QueryTypes.SELECT, transaction, replacements: { dataIssueId } },
      ),
    );
  }

  /** Open issues by severity, so a blocking failure cannot hide behind a mean. */
  async openIssues(): Promise<Array<{ severity: string; status: string; issues: string }>> {
    return this.executor.run('operations.quality_issues', ({ database, transaction }) =>
      database.query<{ severity: string; status: string; issues: string }>(
        `
SELECT severity, status, COUNT(*)::text AS issues
FROM quality_lineage.data_issue
WHERE status NOT IN ('CLOSED', 'DISMISSED')
GROUP BY severity, status
ORDER BY severity, status
        `,
        { type: QueryTypes.SELECT, transaction },
      ),
    );
  }
}
