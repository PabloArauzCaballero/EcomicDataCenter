import { Injectable } from '@nestjs/common';
import { QueryTypes } from 'sequelize';
import type { Actor } from '../../common/auth/actor';
import { ReadQueryExecutor } from '../../common/persistence/read-query.executor';
import { decodeCursor } from './admin-cursor';
import type { AuditQuery } from './admin.schemas';

export interface AuditRow {
  audit_log_id: string;
  actor_subject: string;
  actor_roles: string;
  actor_organization_id: string | null;
  action: string;
  entity_type: string;
  entity_reference: string | null;
  outcome: string;
  correlation_id: string;
  details_json: Record<string, unknown>;
  occurred_at: Date;
}

/**
 * Reads the audit trail, scoped to what the reader is allowed to see.
 *
 * An actor bound to an organisation sees that organisation's entries and the
 * unscoped ones; an unscoped custodian sees everything. The filter is applied
 * in the query and not after it, because paging a list and then removing rows
 * from the page produces short pages whose count leaks how many entries were
 * removed — a conteo can filtrar información, and that includes this one.
 */
@Injectable()
export class AuditViewRepository {
  constructor(private readonly executor: ReadQueryExecutor) {}

  async list(query: AuditQuery, actor: Actor): Promise<AuditRow[]> {
    const cursor = query.cursor ? decodeCursor(query.cursor) : null;
    return this.executor.run('operations.audit_events', ({ database, transaction }) =>
      database.query<AuditRow>(
        `
SELECT
  audit_log_id::text AS audit_log_id, actor_subject, actor_roles, actor_organization_id,
  action, entity_type, entity_reference, outcome, correlation_id, details_json, occurred_at
FROM audit.audit_log
WHERE (:organizationId::uuid IS NULL OR actor_organization_id = :organizationId::uuid
       OR actor_organization_id IS NULL)
  AND (:entityType::varchar IS NULL OR entity_type = :entityType)
  AND (:outcome::varchar IS NULL OR outcome = :outcome)
  AND (:actorSubject::varchar IS NULL OR actor_subject = :actorSubject)
  AND (:since::timestamptz IS NULL OR occurred_at >= :since)
  AND (:until::timestamptz IS NULL OR occurred_at < :until)
  AND (
    :cursorAt::timestamptz IS NULL
    OR (occurred_at, audit_log_id) < (:cursorAt::timestamptz, :cursorId::bigint)
  )
ORDER BY occurred_at DESC, audit_log_id DESC
LIMIT :limit
        `,
        {
          type: QueryTypes.SELECT,
          transaction,
          replacements: {
            organizationId: actor.organizationId ?? null,
            entityType: query.entityType ?? null,
            outcome: query.outcome ?? null,
            actorSubject: query.actorSubject ?? null,
            since: query.since ?? null,
            until: query.until ?? null,
            cursorAt: cursor?.occurredAt ?? null,
            cursorId: cursor?.identifier ?? null,
            limit: query.pageSize + 1,
          },
        },
      ),
    );
  }
}
