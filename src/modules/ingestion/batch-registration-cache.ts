import type { QualityRuleModel } from '../../database/models';
import type { StructureSnapshot } from './structure.repository';

/**
 * Batch-constant reference data loaded once and reused across a batch's records.
 *
 * The published structure and the active rule set are identical for every record
 * in one import, so re-reading them per record is pure redundant work. The cache
 * is filled lazily: when empty, every consumer loads and behaves exactly as it
 * did before, which keeps per-record error semantics (an unpublished dataset
 * still fails at the first record instead of failing the whole request).
 */
export interface BatchRegistrationCache {
  structure?: StructureSnapshot;
  rules?: readonly QualityRuleModel[];
}
