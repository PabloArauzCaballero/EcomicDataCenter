/** Outcome of one submitted item, mirroring how the pipeline handled it. */
export type SubmissionOutcome =
  | 'PUBLISHED'
  | 'PENDING_REVIEW'
  | 'QUARANTINED'
  | 'DUPLICATE'
  | 'REJECTED';

export interface SubmissionItemResult {
  readonly index: number;
  readonly outcome: SubmissionOutcome;
  // Absent for a REJECTED item: its savepoint rolls back before any raw row is
  // persisted, so there is no identifier to report rather than a fake sentinel.
  readonly rawObservationId?: string;
  readonly factClaimId?: string;
  readonly reviewTaskId?: string;
  readonly contradictionIds?: readonly string[];
  readonly unresolvedMentions?: readonly string[];
  readonly duplicateOfClusterId?: string;
  readonly clusterMemberCount?: number;
  readonly explanation?: string;
}

export interface SubmissionResult {
  readonly agentRunId: string;
  readonly submissionCode: string;
  readonly receivedCount: number;
  readonly publishedCount: number;
  readonly pendingReviewCount: number;
  readonly quarantinedCount: number;
  readonly duplicateCount: number;
  readonly rejectedCount: number;
  readonly items: readonly SubmissionItemResult[];
}

export interface DailyAnalysisResult {
  readonly agentRunId: string;
  readonly agentCode: string;
  readonly correlationId: string;
  readonly submission: SubmissionResult;
  readonly completion: { readonly status: string };
}

export interface AgentRunStatus {
  readonly agentRunId: string;
  readonly agentCode: string;
  readonly status: string;
  readonly startedAt: Date;
  readonly completedAt: Date | null;
  readonly recordsReceived: string;
  readonly recordsAccepted: string;
  readonly recordsRejected: string;
  readonly recordsQuarantined: string;
  readonly correlationId: string;
}

/** One item that exhausted its reprocessing attempts and awaits an operator. */
export interface DeadLetterItem {
  readonly rawObservationId: string;
  readonly agentRunId: string;
  readonly payloadHash: string;
  readonly retryCount: number;
  readonly lastError: string | null;
  readonly deadLetteredAt: Date | null;
}

export interface ReprocessResult {
  readonly rawObservationId: string;
  readonly outcome: 'REQUEUED' | 'DEAD_LETTER';
  readonly retryCount: number;
  readonly nextAttemptDelaySeconds?: number;
  readonly explanation?: string;
}
