import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import { context as activeContext, trace } from '@opentelemetry/api';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { PinoLogger } from 'nestjs-pino';
import {
  ForeignKeyConstraintError,
  UniqueConstraintError,
  ValidationError as SequelizeValidationError,
} from 'sequelize';
import { ZodError } from 'zod';
import { recordSpanFailure } from '../observability/span-failure';
import { toSafeValidationIssues } from '../validation/zod-issue';
import { ApplicationError } from './application.error';
import { toSafeErrorLog } from './error-logging';

/** Reads the status a Fastify plugin attached to its error, when it set one. */
function readPluginStatus(exception: unknown): number | undefined {
  if (typeof exception !== 'object' || exception === null) return undefined;
  const status = (exception as { statusCode?: unknown }).statusCode;
  return typeof status === 'number' && status >= 400 && status <= 599 ? status : undefined;
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  constructor(private readonly logger: PinoLogger) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const response = context.getResponse<FastifyReply>();
    const request = context.getRequest<FastifyRequest>();
    const requestId = request.id;

    // Reached when a schema is parsed outside the validation pipe — a rule
    // configuration or a seed file, never a request body.
    if (exception instanceof ZodError) {
      this.send(
        response,
        HttpStatus.BAD_REQUEST,
        requestId,
        'VALIDATION_ERROR',
        'Invalid request',
        {
          issues: toSafeValidationIssues(exception),
        },
      );
      return;
    }
    if (exception instanceof ApplicationError) {
      this.recordServerFault(exception, exception.statusCode);
      this.send(
        response,
        exception.statusCode,
        requestId,
        exception.code,
        exception.message,
        exception.details,
      );
      return;
    }
    if (exception instanceof UniqueConstraintError) {
      this.send(response, HttpStatus.CONFLICT, requestId, 'CONFLICT', 'Resource already exists');
      return;
    }
    if (exception instanceof ForeignKeyConstraintError) {
      this.send(
        response,
        HttpStatus.CONFLICT,
        requestId,
        'CONFLICT',
        'Referenced resource does not exist or is still in use',
      );
      return;
    }
    if (exception instanceof SequelizeValidationError) {
      this.send(
        response,
        HttpStatus.UNPROCESSABLE_ENTITY,
        requestId,
        'VALIDATION_ERROR',
        'Invalid data',
      );
      return;
    }
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      this.recordServerFault(exception, status);
      this.send(
        response,
        status,
        requestId,
        this.httpErrorCode(status),
        this.httpMessage(exception),
      );
      return;
    }

    // Fastify plugins signal their own outcome with a numeric statusCode rather
    // than a Nest exception. Rate limiting is the common case: without this the
    // client receives 500 instead of 429, cannot tell "slow down" from "broken",
    // and every throttled request is logged as an unhandled error.
    const pluginStatus = readPluginStatus(exception);
    if (pluginStatus) {
      // A 4xx from a plugin is an expected client outcome, but a 5xx is a
      // server fault that would otherwise be answered and forgotten: without
      // this the only trace of a failing plugin is the status code the client
      // saw, which never reaches the operator.
      if (pluginStatus >= Number(HttpStatus.INTERNAL_SERVER_ERROR)) {
        this.logFailure(exception, requestId, request, 'Plugin request error');
      }
      this.send(
        response,
        pluginStatus,
        requestId,
        this.httpErrorCode(pluginStatus),
        pluginStatus === Number(HttpStatus.TOO_MANY_REQUESTS)
          ? 'Rate limit exceeded'
          : 'Request could not be processed',
      );
      return;
    }

    this.logFailure(exception, requestId, request, 'Unhandled request error');
    this.send(
      response,
      HttpStatus.INTERNAL_SERVER_ERROR,
      requestId,
      'INTERNAL_ERROR',
      'Unexpected server error',
    );
  }

  /**
   * Publishes the failure to the active span.
   *
   * The HTTP instrumentation sets the span status from the response code, but
   * it never sees the exception because this filter turns it into a response.
   * Recording it here is what makes a trace say *why* a request failed, and it
   * happens exactly once, only for faults the operator has to act on: a 400 is
   * an expected client outcome, not a server failure.
   */
  private recordOnSpan(exception: unknown): void {
    const span = trace.getSpan(activeContext.active());
    if (span) recordSpanFailure(span, exception);
  }

  /** Records only server-side faults; a 4xx is an expected client outcome. */
  private recordServerFault(exception: unknown, status: number): void {
    if (status >= Number(HttpStatus.INTERNAL_SERVER_ERROR)) this.recordOnSpan(exception);
  }

  private logFailure(
    exception: unknown,
    requestId: string,
    request: FastifyRequest,
    message: string,
  ): void {
    this.recordOnSpan(exception);
    this.logger.error(
      // Log the path only, never the query string: a sensitive filter value
      // passed as a query parameter must not land in logs verbatim.
      {
        error: toSafeErrorLog(exception),
        requestId,
        path: request.url.split('?')[0] ?? request.url,
      },
      message,
    );
  }

  private httpErrorCode(status: number): string {
    const codes: Readonly<Record<number, string>> = {
      400: 'VALIDATION_ERROR',
      401: 'UNAUTHORIZED',
      403: 'FORBIDDEN',
      404: 'NOT_FOUND',
      409: 'CONFLICT',
      413: 'PAYLOAD_TOO_LARGE',
      429: 'RATE_LIMITED',
      503: 'SERVICE_UNAVAILABLE',
    };
    return codes[status] ?? 'HTTP_ERROR';
  }

  private httpMessage(exception: HttpException): string {
    const body = exception.getResponse();
    if (typeof body === 'string') return body;
    if (typeof body === 'object' && body && 'message' in body) {
      const message = body.message;
      return Array.isArray(message) ? message.join('; ') : String(message);
    }
    return exception.message;
  }

  private send(
    response: FastifyReply,
    status: number,
    requestId: string,
    code: string,
    message: string,
    details?: Readonly<Record<string, unknown>>,
  ): void {
    void response.status(status).send({
      error: { code, message, ...(details ? { details } : {}) },
      requestId,
    });
  }
}
