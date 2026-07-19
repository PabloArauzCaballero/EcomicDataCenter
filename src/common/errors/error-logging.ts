const MAX_STACK_LENGTH = 8000;

export interface SafeErrorLog {
  readonly errorName: string;
  readonly errorCode?: string;
  readonly stackFrames?: string;
}

function stringProperty(value: object, property: string): string | undefined {
  if (!(property in value)) return undefined;
  const candidate = (value as Record<string, unknown>)[property];
  return typeof candidate === 'string' ? candidate : undefined;
}

/**
 * Produces diagnostic metadata without serializing raw error messages, SQL or bind values.
 * The first stack line is removed because it repeats the potentially sensitive message.
 */
export function toSafeErrorLog(error: unknown): SafeErrorLog {
  if (!(error instanceof Error)) return { errorName: 'UnknownError' };

  const rawFrames = error.stack?.split('\n').slice(1).join('\n').trim();
  const stackFrames = rawFrames ? rawFrames.slice(0, MAX_STACK_LENGTH) : undefined;
  const errorCode = stringProperty(error, 'code');
  return {
    errorName: error.name || 'Error',
    ...(errorCode ? { errorCode } : {}),
    ...(stackFrames ? { stackFrames } : {}),
  };
}
