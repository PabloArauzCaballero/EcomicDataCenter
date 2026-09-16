import { Inject, Injectable } from '@nestjs/common';
import type { Sequelize } from 'sequelize';
import { WRITER_DATABASE } from '../../database/database.tokens';
import { COLLECTION_RULES, type CollectionRule } from './collection-rules';
import {
  QualityEvaluationRepository,
  type EvaluationStatus,
  type RuleTally,
} from './quality-evaluation.repository';

export interface EvaluationOutcome {
  readonly ruleCode: string;
  readonly ruleVersion: string;
  readonly scope: string;
  readonly severity: string;
  readonly status: EvaluationStatus;
  readonly numerator: number;
  readonly denominator: number;
  readonly notEvaluated: number;
  /** Null when there is no population. Never 0 and never 100 by default. */
  readonly share: number | null;
}

/**
 * The threshold at which a check stops being a warning and becomes a failure.
 *
 * One number, applied to every rule, because a per-rule threshold invites the
 * quiet edit that turns a red row green. A rule that needs a different bar
 * should say so as a different rule with a different name.
 */
const FAILURE_THRESHOLD = 0.95;

/**
 * Decides the verdict without ever inventing a population.
 *
 * With no denominator the answer is `NOT_EVALUATED`, and that is the single
 * most important line in this file. Zero of zero is not a hundred per cent; a
 * rule that looked at nothing has not passed, and a summary that shows it as
 * green is a summary that hides exactly the datasets nobody is collecting.
 */
export function judge(tally: RuleTally, severity: string): EvaluationStatus {
  if (tally.denominator === 0) return 'NOT_EVALUATED';
  const share = tally.numerator / tally.denominator;
  if (share >= 1) return 'PASS';
  if (share >= FAILURE_THRESHOLD) return 'WARNING';
  return severity === 'ERROR' || severity === 'CRITICAL' ? 'FAIL' : 'WARNING';
}

/**
 * Evaluates the declared rules against the corpus at one cutoff.
 *
 * Every rule runs inside the same transaction and against the same instant, so
 * the results of one run describe one state of the database. Running them
 * independently would let two rules disagree about how many claims exist, which
 * is the kind of inconsistency that makes an operator stop trusting the screen.
 */
@Injectable()
export class QualityEvaluationService {
  constructor(
    @Inject(WRITER_DATABASE) private readonly writer: Sequelize,
    private readonly repository: QualityEvaluationRepository,
  ) {}

  async evaluateAll(cutoffAt: Date = new Date()): Promise<EvaluationOutcome[]> {
    return this.writer.transaction(async (transaction) => {
      const outcomes: EvaluationOutcome[] = [];
      for (const rule of COLLECTION_RULES) {
        outcomes.push(await this.evaluate(rule, cutoffAt, transaction));
      }
      return outcomes;
    });
  }

  private async evaluate(
    rule: CollectionRule,
    cutoffAt: Date,
    transaction: Parameters<QualityEvaluationRepository['tally']>[1],
  ): Promise<EvaluationOutcome> {
    const qualityRuleId = await this.repository.reconcileRule(rule, transaction);
    const tally = await this.repository.tally(rule, transaction);
    const status = judge(tally, rule.severity);
    await this.repository.record(
      {
        qualityRuleId,
        rule,
        tally,
        status,
        cutoffAt,
        evidence: {
          scope: rule.scope,
          numerator: tally.numerator,
          denominator: tally.denominator,
          notEvaluated: tally.notEvaluated,
          threshold: FAILURE_THRESHOLD,
        },
      },
      transaction,
    );
    return {
      ruleCode: rule.code,
      ruleVersion: rule.version,
      scope: rule.scope,
      severity: rule.severity,
      status,
      numerator: tally.numerator,
      denominator: tally.denominator,
      notEvaluated: tally.notEvaluated,
      share:
        tally.denominator === 0
          ? null
          : Math.round((tally.numerator / tally.denominator) * 10_000) / 100,
    };
  }
}
