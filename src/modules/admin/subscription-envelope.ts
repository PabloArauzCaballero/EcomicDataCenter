import type { FastifyReply } from 'fastify';
import { envelope, type AdminEnvelope } from './admin.envelope';
import type { DeploymentIdentity } from './deployment-identity';

/**
 * Wraps a subscription answer with the deployment and request it belongs to.
 *
 * A function rather than a controller method: every method on a controller is
 * checked by the authorization tests as a route that must declare its roles.
 */
export function answer<T>(
  identity: DeploymentIdentity,
  data: T,
  requestId: string,
  observedAt: Date | null = new Date(),
): AdminEnvelope<T> {
  return envelope(data, {
    environmentId: identity.environmentId,
    requestId,
    observedAt,
    evidenceState: 'known',
  });
}

/**
 * Sends an answer whose status depends on the outcome — 201 or 202, 201 or 200.
 *
 * Nest applies a route's fixed status after the handler returns, even over a
 * status set through a passthrough reply, so such a route takes the reply
 * itself and sends the envelope here.
 */
export function send<T>(reply: FastifyReply, status: number, body: AdminEnvelope<T>): void {
  void reply.status(status).send(body);
}
