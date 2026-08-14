import { Injectable, type PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';
import { RequestValidationError } from '../errors/application.error';
import { toSafeValidationIssues } from './zod-issue';

@Injectable()
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      // A framework exception would reach the filter as a generic HTTP error and
      // its body would be flattened to the message alone, so the caller would
      // never learn which field failed. The application error keeps the issues
      // in `details`, where the error contract already allows them.
      throw new RequestValidationError({ issues: toSafeValidationIssues(result.error) });
    }
    return result.data;
  }
}
