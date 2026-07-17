import {
  assertDatasetVersionTransition,
  assertMethodologyVersionTransition,
} from '../version-transition.policy';

describe('version transition policies', () => {
  it('allows the dataset publication path', () => {
    expect(() => assertDatasetVersionTransition('DRAFT', 'UNDER_REVIEW')).not.toThrow();
    expect(() => assertDatasetVersionTransition('UNDER_REVIEW', 'APPROVED')).not.toThrow();
    expect(() => assertDatasetVersionTransition('APPROVED', 'PUBLISHED')).not.toThrow();
  });

  it('rejects dataset transition shortcuts', () => {
    expect(() => assertDatasetVersionTransition('DRAFT', 'PUBLISHED')).toThrow(
      'Invalid dataset version state transition',
    );
  });

  it('allows the methodology review path', () => {
    expect(() =>
      assertMethodologyVersionTransition('TECHNICAL_REVIEW', 'METHODOLOGICAL_REVIEW'),
    ).not.toThrow();
  });

  it('allows reopening a rejected methodology version', () => {
    expect(() => assertMethodologyVersionTransition('REJECTED', 'DRAFT')).not.toThrow();
  });
});
