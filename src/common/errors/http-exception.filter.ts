import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { PinoLogger } from 'nestjs-pino';
import {
  ForeignKeyConstraintError,
  UniqueConstraintError,
  ValidationError as SequelizeValidationError,
} from 'sequelize';
import { ZodError } from 'zod';
import { ApplicationError } from './application.error';
import { toSafeErrorLog } from './error-logging';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  constructor(private readonly logger: PinoLogger) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const response = context.getResponse<FastifyReply>();
    const request = context.getRequest<FastifyRequest>();
    const requestId = request.id;

    if (exception instanceof ZodError) {
      const issues = exception.issues.map((issue) => ({
        code: issue.code,
        path: issue.path.map(String),
        message: issue.message,
      }));
      this.send(
        response,
        HttpStatus.BAD_REQUEST,
        requestId,
        'VALIDATION_ERROR',
        'Invalid request',
        {
          issues,
        },
      );
      return;
    }
    if (exception instanceof ApplicationError) {
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
      this.send(
        response,
        status,
        requestId,
        this.httpErrorCode(status),
        this.httpMessage(exception),
      );
      return;
    }

    this.logger.error(
      { error: toSafeErrorLog(exception), requestId, path: request.url },
      'Unhandled request error',
    );
    this.send(
      response,
      HttpStatus.INTERNAL_SERVER_ERROR,
      requestId,
      'INTERNAL_ERROR',
      'Unexpected server error',
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
