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
