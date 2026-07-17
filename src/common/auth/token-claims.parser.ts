import { UnauthorizedException } from '@nestjs/common';
import { z } from 'zod';
import type { Environment } from '../../config/environment';
import { ACTOR_ROLES, type Actor, type ActorRole } from './actor';

const baseClaimsSchema = z.object({ sub: z.string().min(1) }).passthrough();
const organizationIdSchema = z.string().uuid();
const allowedRoles = new Set<string>(Object.values(ACTOR_ROLES));

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
  if (roles.includes(ACTOR_ROLES.DATA_OFFICER) && !organization?.success) {
    throw new UnauthorizedException('Data officers require an organization claim');
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
