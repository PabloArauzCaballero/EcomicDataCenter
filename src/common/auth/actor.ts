export const ACTOR_ROLES = {
  DATA_OFFICER: 'DATA_OFFICER',
  ANALYST: 'ANALYST',
  METHODOLOGY_STEWARD: 'METHODOLOGY_STEWARD',
  /** Machine identity used by autonomous collectors. Never granted to people. */
  INGESTION_AGENT: 'INGESTION_AGENT',
  /** Human who approves or rejects claims that automation may not publish alone. */
  DATA_REVIEWER: 'DATA_REVIEWER',
  /**
   * Operator allowed to validate and reconcile seed packages.
   *
   * It is deliberately narrow and deliberately separate from the roles that
   * govern metadata: reconciling a package rewrites catalogue rows in bulk
   * under a manifest's authority, which is an operational act, not an editorial
   * one. No role implies it, and nothing else it can do follows from holding
   * it — the alternative, widening `METHODOLOGY_STEWARD` until it could deploy
   * catalogues, would have made the steward an administrator by accident.
   */
  SEED_OPERATOR: 'SEED_OPERATOR',
  /**
   * Machine identity of the public site, allowed only to report on itself.
   *
   * It exists so that measuring traffic and exports costs nothing else. The
   * obvious alternative — letting the dashboard present `INGESTION_AGENT` —
   * would mean a compromised web tier could submit economic observations, and
   * the observatory would have traded its separation of duties for a page-view
   * counter.
   */
  SITE_TELEMETRY: 'SITE_TELEMETRY',
  /**
   * Machine identity of the public site, allowed only to submit service inquiries.
   *
   * It is separate from `SITE_TELEMETRY` because the two write different kinds
   * of rows: a page-view counter holds no personal data, an inquiry holds a
   * name, an e-mail and free text. A token minted for counting visits must not
   * be able to fill the operators' inbox, and the form's token must not be able
   * to read that inbox back — it can submit and nothing else.
   */
  SITE_INQUIRY: 'SITE_INQUIRY',
  /**
   * Human operator who manages customers and the inquiries they send.
   *
   * It reads and updates the inquiry register and nothing else in the console
   * follows from it: following up with a prospective customer is a commercial
   * act, and widening an editorial or operational role to cover it would hand
   * catalogue or methodology rights to whoever answers the sales inbox.
   */
  SUBSCRIPTION_ADMIN: 'SUBSCRIPTION_ADMIN',
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
