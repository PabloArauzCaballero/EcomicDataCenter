export const ACTOR_ROLES = {
  DATA_OFFICER: 'DATA_OFFICER',
  ANALYST: 'ANALYST',
  METHODOLOGY_STEWARD: 'METHODOLOGY_STEWARD',
  /** Machine identity used by autonomous collectors. Never granted to people. */
  INGESTION_AGENT: 'INGESTION_AGENT',
  /** Human who approves or rejects claims that automation may not publish alone. */
  DATA_REVIEWER: 'DATA_REVIEWER',
} as const;

/**
 * Roles that must carry an organization claim.
 *
 * Both write on behalf of an institution, so an unscoped token would let one
 * organization submit or approve data attributed to another.
 */
export const ORGANIZATION_SCOPED_ROLES = [
  'DATA_OFFICER',
  'INGESTION_AGENT',
] as const satisfies readonly ActorRole[];

export type ActorRole = (typeof ACTOR_ROLES)[keyof typeof ACTOR_ROLES];

export interface Actor {
  subject: string;
  roles: readonly ActorRole[];
  organizationId?: string;
}
