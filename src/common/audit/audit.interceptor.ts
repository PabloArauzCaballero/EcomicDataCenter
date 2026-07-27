import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { Observable, tap } from 'rxjs';
import type { Actor } from '../auth/actor';
import { createAuditState, runWithAuditState } from './audit-context';
import { AuditService } from './audit.service';
import { describeActor, extractReference, summarizeBody, type AuditEntry } from './audit-entry';

const READ_ONLY_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const UUID_SEGMENT = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const NUMERIC_SEGMENT = /^\d+$/u;

/**
 * Audits every state-changing request without per-handler annotation.
 *
 * Auditing by default rather than by opt-in means a new endpoint is covered the
 * day it is merged; forgetting a decorator cannot silently create an
 * unauditable write path.
 *
 * Handlers that record the action inside their own transaction win: this
 * interceptor then only observes the outcome, because an entry that commits
 * with the change it describes cannot drift from it.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private readonly audit: AuditService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<FastifyRequest & { actor?: Actor }>();
    if (READ_ONLY_METHODS.has(request.method)) return next.handle();

    const base = {
      ...describeActor(request.actor),
      action: `${request.method} ${normalizeRoute(request.url)}`,
      entityType: resolveEntityType(request.url),
      correlationId: String(request.id),
      clientContext: request.ip ?? null,
      details: summarizeBody(request.body),
    };

    // The state object is held directly rather than read back through async
    // context: `storage.run` returns as soon as the observable is built, so the
    // tap callback executes after the context has already been exited and a
    // lookup there would always miss.
    const state = createAuditState({
      actor: request.actor,
      correlationId: base.correlationId,
      clientContext: base.clientContext,
    });

    return runWithAuditState(state, () =>
      next.handle().pipe(
        tap({
          next: (result: unknown) => {
            if (state.transactional) return;
            void this.audit.recordBestEffort({
              ...base,
              outcome: 'SUCCESS',
              entityReference: extractReference(result),
            } satisfies AuditEntry);
          },
          error: (error: unknown) => {
            void this.audit.recordBestEffort({
              ...base,
              outcome: 'FAILURE',
              entityReference: null,
              details: { ...base.details, rejection: describeRejection(error) },
            } satisfies AuditEntry);
          },
        }),
      ),
    );
  }
}

/** Replaces identifiers with placeholders so the action stays low cardinality. */
function normalizeRoute(url: string): string {
  const [pathname] = url.split('?');
  return (pathname ?? '/')
    .split('/')
    .map((segment) =>
      UUID_SEGMENT.test(segment) || NUMERIC_SEGMENT.test(segment) ? '{id}' : segment,
    )
    .join('/');
}

/** Uses the first resource segment after the API version as the entity family. */
function resolveEntityType(url: string): string {
  const segments = normalizeRoute(url).split('/').filter(Boolean);
  const versionIndex = segments.findIndex((segment) => /^v\d+$/u.test(segment));
  return segments[versionIndex + 1] ?? segments[0] ?? 'unknown';
}

/** Records why a request failed without copying a message that may echo input. */
function describeRejection(error: unknown): string {
  if (typeof error === 'object' && error && 'status' in error) {
    return `status:${String((error as { status: unknown }).status)}`;
  }
  return error instanceof Error ? `error:${error.name}` : 'error:Unknown';
}
