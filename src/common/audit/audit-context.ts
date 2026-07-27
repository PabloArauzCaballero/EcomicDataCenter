import { AsyncLocalStorage } from 'node:async_hooks';
import type { Actor } from '../auth/actor';

/** Per-request audit state shared between the interceptor and the services. */
export interface AuditRequestState {
  /** True once a service persisted an audit row inside its own transaction. */
  transactional: boolean;
  readonly actor: Actor | undefined;
  readonly correlationId: string;
  readonly clientContext: string | null;
}

const storage = new AsyncLocalStorage<AuditRequestState>();

/** Builds the mutable state the interceptor keeps a direct reference to. */
export function createAuditState(
  seed: Omit<AuditRequestState, 'transactional'>,
): AuditRequestState {
  return { ...seed, transactional: false };
}

/**
 * Carries audit state across the request without making services request-scoped.
 *
 * The interceptor cannot join a transaction it does not own, and making every
 * service request-scoped would multiply instantiation on a write path that
 * already runs under a serializable retry. Async context is the mechanism
 * designed for this hand-off, and it also spares every service signature from
 * carrying an actor and a correlation identifier.
 */
export function runWithAuditState<T>(state: AuditRequestState, callback: () => T): T {
  return storage.run(state, callback);
}

/** Marks the current request as already audited inside a database transaction. */
export function markAuditedTransactionally(): void {
  const state = storage.getStore();
  if (state) state.transactional = true;
}

/** Returns the ambient request identity, or undefined outside an HTTP request. */
export function currentAuditState(): AuditRequestState | undefined {
  return storage.getStore();
}
