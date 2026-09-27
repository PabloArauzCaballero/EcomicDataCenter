import { Injectable } from '@nestjs/common';
import { shareOrNull, type EvidenceState } from './admin.envelope';
import { AnalyticsViewRepository } from './analytics-view.repository';
import { HealthViewRepository } from './health-view.repository';
import { IngestionStatusService } from './ingestion-status.service';
import { OverviewRepository } from './overview.repository';
import { QualityViewRepository } from './quality-view.repository';
import { SeedInspectionService } from './seed-inspection.service';

const WINDOW_HOURS = 24;

interface SeedSummaryShape {
  readonly kind: string;
  readonly ledgerState: string;
  readonly applicable: boolean;
}

/**
 * The summary, and the rule that every card on it must be reachable.
 *
 * Each figure here is a count the corresponding listing can reproduce with the
 * same filters, and each carries its own evidence state. That is the whole
 * design: a card that cannot be opened is a number nobody can check, and a
 * number nobody can check is the reason this portal exists.
 *
 * Nothing is defaulted to a reassuring value. A register with no telemetry
 * reports `unknown`, never zero — «no visits recorded» and «nobody visited»
 * are different sentences and only one of them is true.
 */
@Injectable()
export class AdminOverviewService {
  constructor(
    private readonly overview: OverviewRepository,
    private readonly ingestion: IngestionStatusService,
    private readonly seeds: SeedInspectionService,
    private readonly quality: QualityViewRepository,
    private readonly health: HealthViewRepository,
    private readonly analytics: AnalyticsViewRepository,
  ) {}

  async describe(now: Date = new Date()): Promise<{
    data: Record<string, unknown>;
    observedAt: Date | null;
    evidenceState: EvidenceState;
  }> {
    const [counts, sources, packages, issues, probes, coverage, publications] = await Promise.all([
      this.overview.counts(WINDOW_HOURS),
      this.ingestion.listSources(now),
      this.seeds.listPackages() as Promise<SeedSummaryShape[]>,
      this.quality.openIssues(),
      this.health.probeSummary(WINDOW_HOURS),
      this.analytics.trafficCoverage(),
      this.health.publications(),
    ]);

    const siteProbe = probes.find((probe) => probe.target === 'public-site');
    const criticalIssues = issues
      .filter((issue) => issue.severity === 'CRITICAL')
      .reduce((total, issue) => total + Number(issue.issues), 0);
    const requiredMissing = packages.filter(
      (entry) =>
        entry.applicable && entry.kind === 'REQUIRED_METADATA' && entry.ledgerState !== 'applied',
    ).length;
    const divergedPackages = packages.filter((entry) => entry.ledgerState === 'conflict').length;
    const trafficMeasured = Number(coverage.total_events) > 0;

    return {
      data: {
        window: { hours: WINDOW_HOURS, cutoffAt: now.toISOString() },
        site: {
          /*
           * Absent telemetry is `unknown`, and that is not a formality. A
           * monitor that has never run and a site that has never failed produce
           * the same zero in a failure counter, and only one of them is good
           * news.
           */
          status: siteProbe?.last_outcome ?? 'UNKNOWN',
          observedAt: siteProbeInstant(siteProbe?.last_observed_at ?? null),
          checks: Number(siteProbe?.checks ?? '0'),
          failedChecks: Number(siteProbe?.down_checks ?? '0'),
          openIncidents: Number(counts.open_incidents),
          evidenceState: siteProbe ? 'known' : 'unknown',
        },
        sources: {
          total: sources.items.length,
          late: sources.late,
          withoutSchedule: sources.unknown,
          lastSuccessAt: sources.observedAt,
          evidenceState: sources.items.length ? 'known' : 'unknown',
        },
        ingestion: {
          failedRuns: Number(counts.failed_runs),
          partialRuns: Number(counts.partial_runs),
          runningRuns: Number(counts.running_runs),
          deadLetters: Number(counts.dead_letters),
          pendingReviews: Number(counts.pending_reviews),
          openContradictions: Number(counts.open_contradictions),
          lastRunStartedAt: counts.last_run_started_at
            ? counts.last_run_started_at.toISOString()
            : null,
          evidenceState: counts.last_run_started_at ? 'known' : 'unknown',
        },
        publication: {
          pending: Number(counts.pending_publications),
          datasets: publications.length,
          evidenceState: publications.length ? 'known' : 'unknown',
        },
        quality: {
          criticalIssues,
          openIssues: issues.reduce((total, issue) => total + Number(issue.issues), 0),
          evidenceState: issues.length ? 'known' : 'unknown',
        },
        seeds: {
          packages: packages.length,
          requiredMissing,
          conflicts: divergedPackages,
          evidenceState: 'known',
        },
        exports: {
          generated: Number(counts.generated_exports),
          failed: Number(counts.failed_exports),
          evidenceState: 'known',
        },
        traffic: {
          measured: trafficMeasured,
          events: trafficMeasured ? Number(coverage.total_events) : null,
          robotShare: shareOrNull(Number(coverage.robot_events), Number(coverage.total_events)),
          firstEventAt: coverage.first_event_at ? coverage.first_event_at.toISOString() : null,
          lastEventAt: coverage.last_event_at ? coverage.last_event_at.toISOString() : null,
          evidenceState: trafficMeasured ? 'known' : 'unknown',
        },
      },
      observedAt: now,
      evidenceState: siteProbe && sources.items.length ? 'known' : 'unknown',
    };
  }
}

function siteProbeInstant(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}
