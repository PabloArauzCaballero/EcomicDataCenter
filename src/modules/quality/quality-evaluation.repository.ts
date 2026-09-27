import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { QueryTypes, type Sequelize, type Transaction } from 'sequelize';
import { BusinessRuleError } from '../../common/errors/application.error';
import { WRITER_DATABASE } from '../../database/database.tokens';
import type { CollectionRule } from './collection-rules';

export interface RuleTally {
  readonly numerator: number;
  readonly denominator: number;
  readonly notEvaluated: number;
}

export type EvaluationStatus = 'PASS' | 'WARNING' | 'FAIL' | 'ERROR' | 'NOT_EVALUATED';

/**
 * Runs a rule's own statement and stores the count it produced.
 *
 * The statement is a constant declared in `collection-rules`, never anything a
 * request supplies, and the only values that travel as parameters are the
 * results going back in. The rule row itself is reconciled by code so a rule
 * added to the build appears in the register the first time it is evaluated,
 * instead of needing a migration and a seed to exist at all.
 */
@Injectable()
export class QualityEvaluationRepository {
  constructor(@Inject(WRITER_DATABASE) private readonly writer: Sequelize) {}

  /** Ensures the rule exists, returning its identifier. Never rewrites history. */
  async reconcileRule(rule: CollectionRule, transaction: Transaction): Promise<string> {
    const dimensions = await this.writer.query<{ quality_dimension_id: string }>(
      `SELECT quality_dimension_id FROM quality_lineage.quality_dimension WHERE code = :code`,
      { type: QueryTypes.SELECT, transaction, replacements: { code: rule.dimensionCode } },
    );
    const dimensionId = dimensions[0]?.quality_dimension_id;
    if (!dimensionId) {
      throw new BusinessRuleError(
        `La dimensión de calidad ${rule.dimensionCode} no está cargada; falta el catálogo obligatorio`,
        { dimension: rule.dimensionCode },
      );
    }
    const rows = await this.writer.query<{ quality_rule_id: string }>(
      `INSERT INTO quality_lineage.quality_rule (
         quality_rule_id, quality_dimension_id, code, name, rule_type, severity,
         target_entity_type, configuration_json, is_active
       ) VALUES (
         :qualityRuleId, :dimensionId, :code, :name, 'COLLECTION_TALLY', :severity,
         :targetEntityType, CAST(:configuration AS jsonb), true
       )
       ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, severity = EXCLUDED.severity
       RETURNING quality_rule_id`,
      {
        type: QueryTypes.SELECT,
        transaction,
        replacements: {
          qualityRuleId: randomUUID(),
          dimensionId,
          code: rule.code,
          name: rule.name,
          severity: rule.severity,
          targetEntityType: rule.targetEntityType,
          configuration: JSON.stringify({ version: rule.version, scope: rule.scope }),
        },
      },
    );
    const id = rows[0]?.quality_rule_id;
    if (!id) throw new BusinessRuleError('La regla de calidad no quedó registrada');
    return id;
  }

  async tally(rule: CollectionRule, transaction: Transaction): Promise<RuleTally> {
    const rows = await this.writer.query<{
      numerator: string;
      denominator: string;
      not_evaluated: string;
    }>(rule.sql, { type: QueryTypes.SELECT, transaction });
    const row = rows[0];
    return {
      numerator: Number(row?.numerator ?? 0),
      denominator: Number(row?.denominator ?? 0),
      notEvaluated: Number(row?.not_evaluated ?? 0),
    };
  }

  /**
   * Stores one evaluation, replacing the one taken at the same cutoff.
   *
   * Replacing rather than appending for an identical (rule, version, scope,
   * cutoff) is what makes a re-run idempotent; a different version or a
   * different cutoff is a different row, so the history of how a rule judged
   * the corpus survives every revision of the rule.
   */
  async record(
    input: {
      qualityRuleId: string;
      rule: CollectionRule;
      tally: RuleTally;
      status: EvaluationStatus;
      cutoffAt: Date;
      evidence: Readonly<Record<string, unknown>>;
    },
    transaction: Transaction,
  ): Promise<void> {
    await this.writer.query(
      `INSERT INTO quality_lineage.quality_assessment (
         quality_rule_id, target_entity_type, target_entity_id, status,
         measured_value, threshold_value, details, assessed_at,
         rule_version, evaluation_scope, numerator, denominator, not_evaluated, cutoff_at
       ) VALUES (
         :qualityRuleId, :targetEntityType, :scope, :status,
         :measured, NULL, CAST(:details AS jsonb), now(),
         :ruleVersion, :scope, :numerator, :denominator, :notEvaluated, :cutoffAt
       )
       ON CONFLICT (quality_rule_id, rule_version, evaluation_scope, cutoff_at)
       WHERE rule_version IS NOT NULL
       DO UPDATE SET
         status = EXCLUDED.status,
         measured_value = EXCLUDED.measured_value,
         details = EXCLUDED.details,
         assessed_at = EXCLUDED.assessed_at,
         numerator = EXCLUDED.numerator,
         denominator = EXCLUDED.denominator,
         not_evaluated = EXCLUDED.not_evaluated`,
      {
        type: QueryTypes.INSERT,
        transaction,
        replacements: {
          qualityRuleId: input.qualityRuleId,
          targetEntityType: input.rule.targetEntityType,
          scope: input.rule.scope,
          status: input.status,
          measured: `${input.tally.numerator}/${input.tally.denominator}`,
          details: JSON.stringify(input.evidence),
          ruleVersion: input.rule.version,
          numerator: input.tally.numerator,
          denominator: input.tally.denominator,
          notEvaluated: input.tally.notEvaluated,
          cutoffAt: input.cutoffAt,
        },
      },
    );
  }
}
