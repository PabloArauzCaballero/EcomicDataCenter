import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { QueryTypes, type Sequelize } from 'sequelize';
import { BusinessRuleError, ConflictError, NotFoundError } from '../../common/errors/application.error';
import { READER_DATABASE, WRITER_DATABASE } from '../../database/database.tokens';
import {
  DataIssueModel,
  IndicatorRelationModel,
  LineageRelationModel,
  QualityDimensionModel,
  QualityRuleModel,
  SeriesBreakModel,
} from '../../database/models';
import type {
  CreateIndicatorRelationInput,
  CreateLineageRelationInput,
  CreateQualityDimensionInput,
  CreateQualityRuleInput,
  CreateSeriesBreakInput,
  IssueListInput,
  IssueTransitionInput,
} from './quality.schemas';

const ISSUE_TRANSITIONS: Readonly<Record<string, readonly string[]>> = {
  OPEN: ['TRIAGED'],
  TRIAGED: ['IN_CORRECTION', 'DISMISSED'],
  IN_CORRECTION: ['RESOLVED'],
  RESOLVED: ['VERIFIED', 'IN_CORRECTION'],
  VERIFIED: ['CLOSED'],
  CLOSED: ['REOPENED'],
  REOPENED: ['TRIAGED'],
};

@Injectable()
export class QualityService {
  constructor(
    @Inject(WRITER_DATABASE) private readonly writer: Sequelize,
    @Inject(READER_DATABASE) private readonly reader: Sequelize,
  ) {}

  createDimension(input: CreateQualityDimensionInput) {
    return QualityDimensionModel.create({
      qualityDimensionId: randomUUID(),
      code: input.code,
      name: input.name,
      description: input.description ?? null,
    });
  }

  createRule(input: CreateQualityRuleInput) {
    return QualityRuleModel.create({
      qualityRuleId: randomUUID(),
      qualityDimensionId: input.qualityDimensionId,
      code: input.code,
      name: input.name,
      ruleType: input.ruleType,
      severity: input.severity,
      targetEntityType: input.targetEntityType,
      configurationJson: input.configurationJson,
      isActive: input.isActive,
    });
  }

  createLineage(input: CreateLineageRelationInput) {
    if (input.sourceEntityType === input.targetEntityType && input.sourceEntityId === input.targetEntityId) {
      throw new ConflictError('Lineage source and target cannot be the same entity');
    }
    return LineageRelationModel.create({
      lineageRelationId: randomUUID(),
      methodologyVersionId: input.methodologyVersionId ?? null,
      sourceEntityType: input.sourceEntityType,
      sourceEntityId: input.sourceEntityId,
      targetEntityType: input.targetEntityType,
      targetEntityId: input.targetEntityId,
      relationType: input.relationType,
      transformationDescription: input.transformationDescription ?? null,
      formula: input.formula ?? null,
      createdAt: new Date(),
    });
  }

  createIndicatorRelation(input: CreateIndicatorRelationInput) {
    if (input.sourceIndicatorVersionId === input.targetIndicatorVersionId) {
      throw new ConflictError('An indicator version cannot relate to itself');
    }
    return IndicatorRelationModel.create({
      indicatorRelationId: randomUUID(),
      sourceIndicatorVersionId: input.sourceIndicatorVersionId,
      targetIndicatorVersionId: input.targetIndicatorVersionId,
      relationType: input.relationType,
      formula: input.formula ?? null,
      description: input.description ?? null,
      validFrom: input.validFrom ?? null,
      validTo: input.validTo ?? null,
    });
  }

  createSeriesBreak(input: CreateSeriesBreakInput) {
    return SeriesBreakModel.create({
      seriesBreakId: randomUUID(),
      seriesId: input.seriesId,
      methodologyVersionId: input.methodologyVersionId ?? null,
      breakDate: input.breakDate,
      breakType: input.breakType,
      reason: input.reason,
      isComparableBeforeAfter: input.isComparableBeforeAfter,
      linkingMethod: input.linkingMethod ?? null,
      notes: input.notes ?? null,
    });
  }

  async transitionIssue(id: string, input: IssueTransitionInput) {
    return this.writer.transaction(async (transaction) => {
      const issue = await DataIssueModel.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
      if (!issue) throw new NotFoundError('data_issue', id);
      if (!ISSUE_TRANSITIONS[issue.status]?.includes(input.targetStatus)) {
        throw new BusinessRuleError('Invalid data issue state transition', {
          currentStatus: issue.status,
          targetStatus: input.targetStatus,
        });
      }
      const closed = ['RESOLVED', 'VERIFIED', 'CLOSED', 'DISMISSED'].includes(input.targetStatus);
      await issue.update(
        {
          status: input.targetStatus,
          resolutionNotes: input.resolutionNotes ?? issue.resolutionNotes,
          resolvedAt: closed ? new Date() : null,
        },
        { transaction },
      );
      return issue;
    });
  }

  async listIssues(input: IssueListInput) {
    const replacements = {
      status: input.status ?? null,
      severity: input.severity ?? null,
      limit: input.pageSize,
      offset: (input.page - 1) * input.pageSize,
    };
    const rows = await this.reader.query<Record<string, unknown>>(
      `SELECT issue.*, COUNT(*) OVER() AS total_count
       FROM quality_lineage.data_issue issue
       WHERE (:status::text IS NULL OR issue.status = :status)
         AND (:severity::text IS NULL OR issue.severity = :severity)
       ORDER BY issue.detected_at DESC
       LIMIT :limit OFFSET :offset`,
      { replacements, type: QueryTypes.SELECT },
    );
    const total = Number(rows[0]?.total_count ?? 0);
    return {
      data: rows,
      pagination: {
        page: input.page,
        pageSize: input.pageSize,
        total,
        totalPages: Math.ceil(total / input.pageSize),
      },
    };
  }
}
