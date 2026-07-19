import { createRequestId } from '../request-id';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

describe('createRequestId', () => {
  it('preserves a bounded safe identifier', () => {
    expect(createRequestId('client-123:retry.2')).toBe('client-123:retry.2');
  });

  it('replaces a value that could inject a log line', () => {
    expect(createRequestId('valid\nforged-log-line')).not.toContain('\n');
  });

  it('creates a UUID when no identifier is supplied', () => {
    expect(createRequestId(undefined)).toMatch(UUID_PATTERN);
  });
});
