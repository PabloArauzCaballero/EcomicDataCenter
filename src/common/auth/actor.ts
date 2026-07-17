export const ACTOR_ROLES = {
  DATA_OFFICER: 'DATA_OFFICER',
  ANALYST: 'ANALYST',
  METHODOLOGY_STEWARD: 'METHODOLOGY_STEWARD',
} as const;

export type ActorRole = (typeof ACTOR_ROLES)[keyof typeof ACTOR_ROLES];

export interface Actor {
  subject: string;
  roles: readonly ActorRole[];
  organizationId?: string;
}
