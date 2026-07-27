import { backoffSeconds, decideRetry, isRetryable, MAX_RETRY_ATTEMPTS } from '../retry.policy';

describe('decideRetry', () => {
  it('allows a first attempt for an item that never failed before', () => {
    expect(decideRetry(0)).toEqual({ action: 'RETRY', attempt: 1, delaySeconds: 30 });
  });

  it('keeps allowing retries up to the ceiling', () => {
    for (let count = 0; count < MAX_RETRY_ATTEMPTS; count += 1) {
      expect(decideRetry(count).action).toBe('RETRY');
    }
  });

  it('dead-letters an item that exhausted its attempts', () => {
    const decision = decideRetry(MAX_RETRY_ATTEMPTS);
    expect(decision.action).toBe('DEAD_LETTER');
    if (decision.action === 'DEAD_LETTER') {
      expect(decision.reason).toContain(String(MAX_RETRY_ATTEMPTS));
    }
  });

  it('never returns to RETRY once the ceiling is passed', () => {
    expect(decideRetry(MAX_RETRY_ATTEMPTS + 10).action).toBe('DEAD_LETTER');
  });
});

describe('backoffSeconds', () => {
  it('grows exponentially so a failing source is not hammered', () => {
    expect(backoffSeconds(1)).toBe(30);
    expect(backoffSeconds(2)).toBe(60);
    expect(backoffSeconds(3)).toBe(120);
  });

  it('caps the delay so an item never waits longer than an hour', () => {
    expect(backoffSeconds(50)).toBe(3600);
  });

  it('is monotonic', () => {
    const delays = [1, 2, 3, 4, 5].map(backoffSeconds);
    expect([...delays].sort((left, right) => left - right)).toEqual(delays);
  });
});

describe('isRetryable', () => {
  it.each(['REJECTED', 'QUARANTINED'])('allows an operator to reprocess %s', (status) => {
    expect(isRetryable(status)).toBe(true);
  });

  it.each(['RECEIVED', 'NORMALIZED', 'DEAD_LETTER'])('refuses to reprocess %s', (status) => {
    expect(isRetryable(status)).toBe(false);
  });
});
