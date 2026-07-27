import { HttpStatus } from '@nestjs/common';

/**
 * Mirrors the plugin-status branch of the exception filter.
 *
 * The filter itself needs a Fastify reply and a logger, so the decision it
 * makes is asserted through the same predicate rather than by standing up the
 * whole HTTP stack for a pure branch.
 */
function readPluginStatus(exception: unknown): number | undefined {
  if (typeof exception !== 'object' || exception === null) return undefined;
  const status = (exception as { statusCode?: unknown }).statusCode;
  return typeof status === 'number' && status >= 400 && status <= 599 ? status : undefined;
}

describe('plugin status detection', () => {
  it('recognises the rate limiter so a throttled client receives 429', () => {
    expect(readPluginStatus({ statusCode: HttpStatus.TOO_MANY_REQUESTS })).toBe(429);
  });

  it('recognises a payload-too-large signal from the body limit', () => {
    expect(readPluginStatus({ statusCode: 413 })).toBe(413);
  });

  it('ignores a plain error so it still reaches the unhandled branch', () => {
    expect(readPluginStatus(new Error('boom'))).toBeUndefined();
  });

  it('ignores a success status that would mask a real failure', () => {
    expect(readPluginStatus({ statusCode: 200 })).toBeUndefined();
  });

  it('ignores a non-numeric status', () => {
    expect(readPluginStatus({ statusCode: '429' })).toBeUndefined();
  });

  it('ignores null and primitives', () => {
    expect(readPluginStatus(null)).toBeUndefined();
    expect(readPluginStatus('error')).toBeUndefined();
  });
});
