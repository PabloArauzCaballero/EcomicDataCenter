import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';

/**
 * The correlation identifier Fastify assigned to this request.
 *
 * It is already on the response header and in every log line for the request;
 * exposing it to a handler lets the body carry the same value, so an operator
 * reading a figure on screen can find the exact query that produced it without
 * having to open developer tools first.
 */
export const RequestId = createParamDecorator((_data: unknown, context: ExecutionContext): string =>
  String(context.switchToHttp().getRequest<FastifyRequest>().id),
);
