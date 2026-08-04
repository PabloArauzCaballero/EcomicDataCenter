import { DiagLogLevel, type DiagLogger } from '@opentelemetry/api';

const LEVELS: Readonly<Record<string, DiagLogLevel>> = {
  NONE: DiagLogLevel.NONE,
  ERROR: DiagLogLevel.ERROR,
  WARN: DiagLogLevel.WARN,
  INFO: DiagLogLevel.INFO,
  DEBUG: DiagLogLevel.DEBUG,
  VERBOSE: DiagLogLevel.VERBOSE,
  ALL: DiagLogLevel.ALL,
};

/** Translates the configured diagnostics level to the SDK enumeration. */
export function toDiagnosticsLevel(name: string): DiagLogLevel {
  return LEVELS[name] ?? DiagLogLevel.ERROR;
}

function write(level: string, message: string, parameters: readonly unknown[]): void {
  const detail = parameters.length ? ` ${parameters.map((item) => String(item)).join(' ')}` : '';
  process.stderr.write(`${JSON.stringify({ level, source: 'otel', message: message + detail })}\n`);
}

/**
 * Routes the SDK's internal diagnostics to stderr as JSON.
 *
 * The bundled console logger would break the structured-log contract of this
 * service, and silencing the SDK would hide instrumentation failures — the
 * exact class of problem that makes traces disappear without explanation.
 */
export function createDiagnosticsLogger(): DiagLogger {
  return {
    error: (message, ...parameters) => write('error', message, parameters),
    warn: (message, ...parameters) => write('warn', message, parameters),
    info: (message, ...parameters) => write('info', message, parameters),
    debug: (message, ...parameters) => write('debug', message, parameters),
    verbose: (message, ...parameters) => write('trace', message, parameters),
  };
}
