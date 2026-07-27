import { UnauthorizedException } from '@nestjs/common';
import { z } from 'zod';
import type { Environment } from '../../config/environment';
import { ACTOR_ROLES, ORGANIZATION_SCOPED_ROLES, type Actor, type ActorRole } from './actor';

const baseClaimsSchema = z.object({ sub: z.string().min(1) }).passthrough();
const organizationIdSchema = z.string().uuid();
const allowedRoles = new Set<string>(Object.values(ACTOR_ROLES));
const scopedRoles = new Set<ActorRole>(ORGANIZATION_SCOPED_ROLES);

/** Converts verified JWT claims into the small actor contract used by the domain. */
export function parseActorClaims(
  claims: unknown,
  environment: Pick<Environment, 'AUTH_ROLE_CLAIM' | 'AUTH_ORGANIZATION_CLAIM'>,
): Actor {
  const parsed = baseClaimsSchema.safeParse(claims);
  if (!parsed.success) throw new UnauthorizedException('Token claims are invalid');

  const roles = parseRoles(parsed.data[environment.AUTH_ROLE_CLAIM]);
  const rawOrganization = parsed.data[environment.AUTH_ORGANIZATION_CLAIM];
  const organization =
    rawOrganization === undefined ? undefined : organizationIdSchema.safeParse(rawOrganization);
  if (organization && !organization.success) {
    throw new UnauthorizedException('Organization claim is invalid');
  }
  if (roles.some((role) => scopedRoles.has(role)) && !organization?.success) {
    throw new UnauthorizedException('This role requires an organization claim');
  }
  // Separation of duties: a collector must never be able to approve, publish or
  // govern the data it produced, so the two identity families cannot be mixed
  // in one token even if the identity provider is misconfigured.
  if (roles.includes(ACTOR_ROLES.INGESTION_AGENT) && roles.length > 1) {
    throw new UnauthorizedException('An ingestion agent cannot hold additional roles');
  }
  return {
    subject: parsed.data.sub,
    roles,
    ...(organization?.success ? { organizationId: organization.data } : {}),
  };
}

function parseRoles(value: unknown): ActorRole[] {
  const candidates = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(/[ ,]+/u)
      : [];
  return [...new Set(candidates)].filter(
    (role): role is ActorRole => typeof role === 'string' && allowedRoles.has(role),
  );
}
