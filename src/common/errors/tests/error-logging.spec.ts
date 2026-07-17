import { toSafeErrorLog } from '../error-logging';

describe('toSafeErrorLog', () => {
  it('does not include a potentially sensitive error message', () => {
    const result = toSafeErrorLog(new Error('password=do-not-log'));
    expect(JSON.stringify(result)).not.toContain('do-not-log');
  });

  it('retains a stable infrastructure error code', () => {
    const error = Object.assign(new Error('database detail'), { code: 'ECONNREFUSED' });
    expect(toSafeErrorLog(error).errorCode).toBe('ECONNREFUSED');
  });
});
