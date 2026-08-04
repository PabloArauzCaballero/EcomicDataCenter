import { z } from 'zod';
import { ApplicationError } from '../../errors/application.error';
import { ZodValidationPipe } from '../zod-validation.pipe';

const schema = z.object({ code: z.string().min(3), amount: z.number() }).strict();

describe('ZodValidationPipe', () => {
  it('returns the parsed value when the payload is valid', () => {
    const pipe = new ZodValidationPipe(schema);
    expect(pipe.transform({ code: 'abc', amount: 1 })).toEqual({ code: 'abc', amount: 1 });
  });

  it('reports which field failed instead of a bare message', () => {
    const pipe = new ZodValidationPipe(schema);
    let caught: unknown;
    try {
      pipe.transform({ code: 'a', amount: 'not-a-number' });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(ApplicationError);
    const failure = caught as ApplicationError;
    expect(failure.statusCode).toBe(400);
    expect(failure.code).toBe('VALIDATION_ERROR');
    const issues = failure.details?.issues as readonly { path: string[] }[];
    expect(issues.map((issue) => issue.path.join('.')).sort()).toEqual(['amount', 'code']);
  });

  it('never echoes the rejected value back to the caller', () => {
    const pipe = new ZodValidationPipe(schema);
    let caught: unknown;
    try {
      pipe.transform({ code: 'abc', amount: 1, apiKey: 'super-secret-value' });
    } catch (error) {
      caught = error;
    }

    const failure = caught as ApplicationError;
    expect(JSON.stringify(failure.details)).not.toContain('super-secret-value');
    const issues = failure.details?.issues as readonly { code: string }[];
    expect(issues).toHaveLength(1);
    expect(issues[0]?.code).toBe('unrecognized_keys');
  });
});
