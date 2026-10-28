import type { MigrationContext } from '../migration.types';

/**
 * Hardens the subscriber register: sign-in lock, session versions, team
 * members and the ledger of notices already sent.
 *
 * Invariants the API depends on:
 *
 * 1. `failed_login_count` counts consecutive failed sign-ins. The tenth sets
 *    `locked_until` fifteen minutes ahead and resets the count, in the same
 *    UPDATE, so concurrent attempts cannot lose a failure or skip the lock.
 * 2. `session_version` starts at 1 and only grows. The site stamps it in its
 *    cookie; raising it (a new password, a spent token, a revocation) turns
 *    every cookie issued before into a stale one.
 * 3. A member belongs to one account. Its e-mail is unique among members, and
 *    the API refuses one that already names an owner — both checks run under
 *    an advisory lock on the e-mail, because no single constraint spans the two
 *    tables. A removed member keeps its row (status REMOVED): the writer has no
 *    DELETE here either.
 * 4. A token may name a member. Without one it is the owner's.
 * 5. `subscriber_notice` has one row per account, kind and period. The site
 *    claims a row before sending a notice, and the unique key — not a read
 *    first — decides who sends it, so a notice goes out once. When the send
 *    fails the site releases the claim so the next run retries: this is the
 *    only table here on which the writer may DELETE, because a claim is a
 *    lease, not a record of anything that happened.
 *
 * The SQL is written here rather than in a `migration-sql` module because the
 * physical-model gate parses the migration files themselves; each added column
 * is its own ALTER TABLE because that is the form the gate reads.
 */
export async function up({ context }: MigrationContext): Promise<void> {
  await context.sequelize.query(`
ALTER TABLE operations.subscriber_account ADD COLUMN failed_login_count integer NOT NULL DEFAULT 0;
ALTER TABLE operations.subscriber_account ADD COLUMN locked_until timestamptz;
ALTER TABLE operations.subscriber_account ADD COLUMN session_version integer NOT NULL DEFAULT 1;
ALTER TABLE operations.subscriber_account
  ADD CONSTRAINT ck_subscriber_account_failed_login_count CHECK (failed_login_count >= 0);
ALTER TABLE operations.subscriber_account
  ADD CONSTRAINT ck_subscriber_account_session_version CHECK (session_version >= 1);

CREATE TABLE operations.subscriber_member (
  subscriber_member_id uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  subscriber_account_id uuid NOT NULL REFERENCES operations.subscriber_account (subscriber_account_id),
  email text NOT NULL UNIQUE,
  full_name text NOT NULL,
  password_hash text,
  status text NOT NULL DEFAULT 'ACTIVE',
  session_version integer NOT NULL DEFAULT 1,
  failed_login_count integer NOT NULL DEFAULT 0,
  locked_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_subscriber_member_status CHECK (status IN ('ACTIVE', 'REMOVED')),
  CONSTRAINT ck_subscriber_member_session_version CHECK (session_version >= 1),
  CONSTRAINT ck_subscriber_member_failed_login_count CHECK (failed_login_count >= 0)
);

CREATE TABLE operations.subscriber_notice (
  subscriber_notice_id uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  subscriber_account_id uuid NOT NULL REFERENCES operations.subscriber_account (subscriber_account_id),
  kind text NOT NULL,
  period_key text NOT NULL,
  claimed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_subscriber_notice_period UNIQUE (subscriber_account_id, kind, period_key),
  CONSTRAINT ck_subscriber_notice_kind CHECK (kind IN ('USAGE_80', 'EXPIRY_5D', 'GRACE')),
  CONSTRAINT ck_subscriber_notice_period_key CHECK (char_length(period_key) BETWEEN 1 AND 40)
);

ALTER TABLE operations.subscriber_token ADD COLUMN subscriber_member_id uuid REFERENCES operations.subscriber_member (subscriber_member_id);
  `);

  await context.sequelize.query(`
CREATE INDEX ix_subscriber_member_subscriber_account_id
  ON operations.subscriber_member (subscriber_account_id, created_at);
CREATE INDEX ix_subscriber_token_subscriber_member_id
  ON operations.subscriber_token (subscriber_member_id);
  `);

  await context.sequelize.query(`
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'backend_writer') THEN
    GRANT SELECT, INSERT, UPDATE ON operations.subscriber_member TO backend_writer;
    GRANT SELECT, INSERT, DELETE ON operations.subscriber_notice TO backend_writer;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'backup_operator') THEN
    GRANT SELECT ON operations.subscriber_member, operations.subscriber_notice TO backup_operator;
  END IF;
END
$$;
  `);
}

export async function down({ context }: MigrationContext): Promise<void> {
  await context.sequelize.query(`
DROP INDEX IF EXISTS operations.ix_subscriber_token_subscriber_member_id;
ALTER TABLE operations.subscriber_token DROP COLUMN IF EXISTS subscriber_member_id;
DROP TABLE IF EXISTS operations.subscriber_notice;
DROP TABLE IF EXISTS operations.subscriber_member;
ALTER TABLE operations.subscriber_account DROP CONSTRAINT IF EXISTS ck_subscriber_account_session_version;
ALTER TABLE operations.subscriber_account DROP CONSTRAINT IF EXISTS ck_subscriber_account_failed_login_count;
ALTER TABLE operations.subscriber_account DROP COLUMN IF EXISTS session_version;
ALTER TABLE operations.subscriber_account DROP COLUMN IF EXISTS locked_until;
ALTER TABLE operations.subscriber_account DROP COLUMN IF EXISTS failed_login_count;
  `);
}
