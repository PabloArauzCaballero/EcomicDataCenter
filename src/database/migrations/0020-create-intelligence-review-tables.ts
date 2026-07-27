import type { MigrationContext } from '../migration.types';

/**
 * Lets conflicting information coexist until a person resolves it.
 *
 * Contradictions are recorded rather than silently overwritten, and the
 * polymorphic reference follows the convention already used by
 * `quality_lineage.data_issue` so both can target any versioned record.
 */
export async function up({ context }: MigrationContext): Promise<void> {
  await context.sequelize.query(`
CREATE TABLE intelligence.data_contradiction (
  data_contradiction_id uuid NOT NULL PRIMARY KEY,
  resolved_by_review_task_id uuid,
  subject_type varchar(40) NOT NULL,
  primary_reference varchar(80) NOT NULL,
  contradicting_reference varchar(80) NOT NULL,
  detection_method varchar(40) NOT NULL,
  divergence_ratio numeric(12,6),
  probable_cause text,
  status varchar(30) NOT NULL,
  detected_at timestamptz NOT NULL,
  resolved_at timestamptz,
  selected_reference varchar(80),
  resolution_rationale text,
  CONSTRAINT uq_data_contradiction_references UNIQUE (subject_type, primary_reference, contradicting_reference),
  CONSTRAINT ck_data_contradiction_subject_type CHECK (subject_type IN ('OBSERVATION_REVISION','FACT_CLAIM')),
  CONSTRAINT ck_data_contradiction_status CHECK (status IN ('OPEN','UNDER_REVIEW','RESOLVED','ACCEPTED_DIVERGENCE','DISMISSED')),
  CONSTRAINT ck_data_contradiction_detection_method CHECK (detection_method IN ('NUMERIC_DIVERGENCE','CONFLICTING_ASSERTION','MANUAL')),
  CONSTRAINT ck_data_contradiction_distinct_references CHECK (primary_reference <> contradicting_reference),
  CONSTRAINT ck_data_contradiction_resolution_after_detection CHECK (resolved_at IS NULL OR resolved_at >= detected_at),
  CONSTRAINT ck_data_contradiction_resolution_completeness CHECK (status NOT IN ('RESOLVED','ACCEPTED_DIVERGENCE') OR (resolved_at IS NOT NULL AND resolution_rationale IS NOT NULL))
);

CREATE TABLE intelligence.review_task (
  review_task_id uuid NOT NULL PRIMARY KEY,
  target_type varchar(40) NOT NULL,
  target_reference varchar(80) NOT NULL,
  reason varchar(40) NOT NULL,
  priority varchar(20) NOT NULL,
  status varchar(30) NOT NULL,
  assigned_to varchar(120),
  decided_by varchar(120),
  decision_rationale text,
  created_at timestamptz NOT NULL,
  resolved_at timestamptz,
  CONSTRAINT ck_review_task_target_type CHECK (target_type IN ('FACT_CLAIM','OBSERVATION_REVISION','DATA_CONTRADICTION')),
  CONSTRAINT ck_review_task_reason CHECK (reason IN ('CRITICAL_CLAIM','CONTRADICTION','LOW_CONFIDENCE','QUALITY_FAILURE','AI_INFERENCE','MANUAL_REQUEST')),
  CONSTRAINT ck_review_task_priority CHECK (priority IN ('URGENT','HIGH','NORMAL','LOW')),
  CONSTRAINT ck_review_task_status CHECK (status IN ('PENDING','IN_REVIEW','APPROVED','REJECTED','ESCALATED')),
  CONSTRAINT ck_review_task_resolution_after_creation CHECK (resolved_at IS NULL OR resolved_at >= created_at),
  CONSTRAINT ck_review_task_decision_completeness CHECK (status NOT IN ('APPROVED','REJECTED') OR (decided_by IS NOT NULL AND decision_rationale IS NOT NULL AND resolved_at IS NOT NULL))
);
  `);
}

export async function down({ context }: MigrationContext): Promise<void> {
  await context.sequelize.query(`
DROP TABLE IF EXISTS intelligence.review_task CASCADE;
DROP TABLE IF EXISTS intelligence.data_contradiction CASCADE;
  `);
}
