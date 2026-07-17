import { Injectable } from '@nestjs/common';
import type { Transaction } from 'sequelize';
import { z } from 'zod';
import {
  DataIssueModel,
  QualityAssessmentModel,
  QualityRuleModel,
} from '../../database/models';
import type { ObservationRecordInput } from './observation-input.schemas';

const requiredMeasureConfig = z.object({ measureDefinitionId: z.string().uuid() }).strict();
const numericRangeConfig = z
  .object({
    measureDefinitionId: z.string().uuid(),
    minimum: z.string().optional(),
    maximum: z.string().optional(),
  })
  .strict();
const nonNegativeConfig = z.object({ measureDefinitionId: z.string().uuid() }).strict();

interface EvaluationResult {
  criticalFailure: boolean;
  assessmentIds: readonly string[];
  issueIds: readonly string[];
}

interface RuleOutcome {
  status: 'PASS' | 'WARNING' | 'FAIL' | 'ERROR';
  measuredValue?: string;
  thresholdValue?: string;
  details: Record<string, unknown>;
}

@Injectable()
export class QualityEvaluatorService {
  async evaluateRevision(
    observationRevisionId: string,
    dataEntryBatchId: string,
    record: ObservationRecordInput,
    transaction: Transaction,
  ): Promise<EvaluationResult> {
    const rules = await QualityRuleModel.findAll({
      where: { isActive: true, targetEntityType: 'OBSERVATION_REVISION' },
      transaction,
    });
    const assessmentIds: string[] = [];
    const issueIds: string[] = [];
    let criticalFailure = false;

    for (const rule of rules) {
      const outcome = this.evaluateRule(rule.ruleType, rule.configurationJson, record);
      const assessment = await QualityAssessmentModel.create(
        {
          qualityRuleId: rule.qualityRuleId,
          dataEntryBatchId,
          targetEntityType: 'OBSERVATION_REVISION',
          targetEntityId: observationRevisionId,
          status: outcome.status,
          measuredValue: outcome.measuredValue ?? null,
          thresholdValue: outcome.thresholdValue ?? null,
          details: outcome.details,
          assessedAt: new Date(),
        },
        { transaction },
      );
      assessmentIds.push(assessment.qualityAssessmentId);

      if (outcome.status === 'FAIL' || outcome.status === 'ERROR') {
        const issue = await DataIssueModel.create(
          {
            qualityAssessmentId: assessment.qualityAssessmentId,
            issueType: rule.ruleType,
            severity: rule.severity,
            targetEntityType: 'OBSERVATION_REVISION',
            targetEntityId: observationRevisionId,
            title: `Quality rule ${rule.code} did not pass`,
            description: rule.name,
            status: 'OPEN',
            detectedAt: new Date(),
            resolvedAt: null,
            resolutionNotes: null,
          },
          { transaction },
        );
        issueIds.push(issue.dataIssueId);
        criticalFailure ||= rule.severity === 'CRITICAL';
      }
    }
    return { criticalFailure, assessmentIds, issueIds };
  }

  private evaluateRule(
    ruleType: string,
    configuration: Record<string, unknown>,
    record: ObservationRecordInput,
  ): RuleOutcome {
    try {
      if (ruleType === 'REQUIRED_MEASURE') {
        const config = requiredMeasureConfig.parse(configuration);
        const exists = record.measures.some((item) => item.measureDefinitionId === config.measureDefinitionId);
        return { status: exists ? 'PASS' : 'FAIL', details: { measureDefinitionId: config.measureDefinitionId } };
      }
      if (ruleType === 'NON_NEGATIVE') {
        const config = nonNegativeConfig.parse(configuration);
        const measure = record.measures.find((item) => item.measureDefinitionId === config.measureDefinitionId);
        const numeric = measure?.numericValue;
        const passed = numeric !== undefined && Number(numeric) >= 0;
        return { status: passed ? 'PASS' : 'FAIL', measuredValue: numeric, thresholdValue: '>= 0', details: config };
      }
      if (ruleType === 'NUMERIC_RANGE') {
        const config = numericRangeConfig.parse(configuration);
        const measure = record.measures.find((item) => item.measureDefinitionId === config.measureDefinitionId);
        const numeric = measure?.numericValue;
        const parsed = numeric === undefined ? Number.NaN : Number(numeric);
        const minimumOk = config.minimum === undefined || parsed >= Number(config.minimum);
        const maximumOk = config.maximum === undefined || parsed <= Number(config.maximum);
        return {
          status: Number.isFinite(parsed) && minimumOk && maximumOk ? 'PASS' : 'FAIL',
          measuredValue: numeric,
          thresholdValue: `${config.minimum ?? '-∞'}..${config.maximum ?? '+∞'}`,
          details: config,
        };
      }
      return { status: 'ERROR', details: { reason: 'Unsupported quality rule type', ruleType } };
    } catch (error) {
      return {
        status: 'ERROR',
        details: {
          reason: 'Invalid quality rule configuration',
          errorType: error instanceof Error ? error.name : 'UnknownError',
        },
      };
    }
  }
}
