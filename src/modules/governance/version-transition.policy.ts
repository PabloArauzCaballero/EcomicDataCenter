import { BusinessRuleError } from '../../common/errors/application.error';

const DATASET_TRANSITIONS: Readonly<Record<string, readonly string[]>> = {
  DRAFT: ['UNDER_REVIEW'],
  UNDER_REVIEW: ['DRAFT', 'APPROVED', 'REJECTED'],
  APPROVED: ['PUBLISHED'],
  PUBLISHED: ['SUPERSEDED', 'WITHDRAWN'],
  REJECTED: ['DRAFT'],
};

const METHODOLOGY_TRANSITIONS: Readonly<Record<string, readonly string[]>> = {
  DRAFT: ['TECHNICAL_REVIEW'],
  TECHNICAL_REVIEW: ['DRAFT', 'METHODOLOGICAL_REVIEW'],
  METHODOLOGICAL_REVIEW: ['DRAFT', 'APPROVED', 'REJECTED'],
  APPROVED: ['PUBLISHED'],
  PUBLISHED: ['SUPERSEDED', 'WITHDRAWN'],
  REJECTED: ['DRAFT'],
};

/** Asserts a transition against the explicit dataset-version state machine. */
export function assertDatasetVersionTransition(current: string, target: string): void {
  assertTransition(DATASET_TRANSITIONS, 'dataset version', current, target);
}

/** Asserts a transition against the explicit methodology-version state machine. */
export function assertMethodologyVersionTransition(current: string, target: string): void {
  assertTransition(METHODOLOGY_TRANSITIONS, 'methodology version', current, target);
}

function assertTransition(
  transitions: Readonly<Record<string, readonly string[]>>,
  entity: string,
  current: string,
  target: string,
): void {
  if (!transitions[current]?.includes(target)) {
    throw new BusinessRuleError(`Invalid ${entity} state transition`, {
      currentStatus: current,
      targetStatus: target,
    });
  }
}
