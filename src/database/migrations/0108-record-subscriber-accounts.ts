import type { MigrationContext } from '../migration.types';

/**
 * Opens the register of paying subscribers, their API keys, usage and payments.
 *
 * Plans are billed by hand in bolivianos: the customer pays by QR, the operator
 * records the payment in the console and the account's `paid_until` moves
 * forward. Like the inquiries that precede them, these rows are an operational
 * fact, not a fact about Bolivia, so they live in `operations`.
 *
 * Invariants the API depends on:
 *
 * 1. `email` is unique and stored lowercased by the API, so «Ana@x.org» and
 *    «ana@x.org» cannot become two accounts.
 * 2. Secrets are never stored. A password is kept as an scrypt hash, an API key
 *    and a one-time token as the SHA-256 of the value handed out once.
 * 3. `subscriber_usage` has one row per account, month and kind, and the API
 *    increments it with a single upsert, so two concurrent calls cannot lose a
 *    count.
 * 4. `subscriber_payment` is a ledger: the writer may insert and read it, never
 *    update or delete it.
 *
 * The writer gets no DELETE on any of these tables: they hold personal data and
 * money, and removing either is a deliberate act for the migrator credential.
 * The reader gets nothing: `subscriber_account` carries password hashes, and
 * the API reads these rows through the writer it already needs.
 *
 * The SQL is written here rather than in a `migration-sql` module because the
 * physical-model gate parses the migration files themselves.
 */
export async function up({ context }: MigrationContext): Promise<void> {
  await context.sequelize.query(`
CREATE TABLE operations.subscriber_account (
  subscriber_account_id uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  full_name text NOT NULL,
  organization text,
  legal_name text,
  tax_id text,
  plan_code text NOT NULL,
  billing_period text NOT NULL,
  status text NOT NULL DEFAULT 'PENDING',
  paid_until timestamptz,
  password_hash text,
  terms_version text,
  terms_accepted_at timestamptz,
  service_inquiry_id uuid REFERENCES operations.service_inquiry (service_inquiry_id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_subscriber_account_plan_code CHECK (plan_code IN ('analista', 'profesional', 'institucional')),
  CONSTRAINT ck_subscriber_account_billing_period CHECK (billing_period IN ('MONTHLY', 'ANNUAL')),
  CONSTRAINT ck_subscriber_account_status CHECK (status IN ('PENDING', 'TRIAL', 'ACTIVE', 'SUSPENDED', 'CANCELLED'))
);

CREATE TABLE operations.subscriber_api_key (
  subscriber_api_key_id uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  subscriber_account_id uuid NOT NULL REFERENCES operations.subscriber_account (subscriber_account_id),
  key_prefix text NOT NULL,
  key_hash text NOT NULL UNIQUE,
  label text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  revoked_at timestamptz,
  CONSTRAINT ck_subscriber_api_key_hash_format CHECK (key_hash ~ '^[0-9a-f]{64}$')
);

CREATE TABLE operations.subscriber_usage (
  subscriber_account_id uuid NOT NULL REFERENCES operations.subscriber_account (subscriber_account_id),
  period_month date NOT NULL,
  usage_kind text NOT NULL,
  used integer NOT NULL DEFAULT 0,
  PRIMARY KEY (subscriber_account_id, period_month, usage_kind),
  CONSTRAINT ck_subscriber_usage_kind CHECK (usage_kind IN ('API', 'DOWNLOAD', 'CHAT', 'MAP')),
  CONSTRAINT ck_subscriber_usage_month_start CHECK (EXTRACT(DAY FROM period_month) = 1)
);

CREATE TABLE operations.subscriber_payment (
  subscriber_payment_id uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  subscriber_account_id uuid NOT NULL REFERENCES operations.subscriber_account (subscriber_account_id),
  amount_bob numeric(12,2) NOT NULL,
  covers_until date NOT NULL,
  reference text,
  recorded_by text NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_subscriber_payment_amount CHECK (amount_bob > 0)
);

CREATE TABLE operations.subscriber_token (
  token_hash text NOT NULL PRIMARY KEY,
  subscriber_account_id uuid NOT NULL REFERENCES operations.subscriber_account (subscriber_account_id),
  purpose text NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  CONSTRAINT ck_subscriber_token_purpose CHECK (purpose IN ('ACTIVATE', 'RESET')),
  CONSTRAINT ck_subscriber_token_hash_format CHECK (token_hash ~ '^[0-9a-f]{64}$')
);
  `);

  await context.sequelize.query(`
CREATE INDEX ix_subscriber_account_service_inquiry_id
  ON operations.subscriber_account (service_inquiry_id);
CREATE INDEX ix_subscriber_account_status_created_at
  ON operations.subscriber_account (status, created_at DESC, subscriber_account_id DESC);
CREATE INDEX ix_subscriber_account_created_at
  ON operations.subscriber_account (created_at DESC, subscriber_account_id DESC);
CREATE INDEX ix_subscriber_api_key_subscriber_account_id
  ON operations.subscriber_api_key (subscriber_account_id, created_at);
CREATE INDEX ix_subscriber_payment_subscriber_account_id
  ON operations.subscriber_payment (subscriber_account_id, recorded_at DESC);
CREATE INDEX ix_subscriber_token_subscriber_account_id
  ON operations.subscriber_token (subscriber_account_id);
  `);

  await context.sequelize.query(`
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'backend_writer') THEN
    GRANT SELECT, INSERT, UPDATE ON
      operations.subscriber_account,
      operations.subscriber_api_key,
      operations.subscriber_usage,
      operations.subscriber_token
    TO backend_writer;
    GRANT SELECT, INSERT ON operations.subscriber_payment TO backend_writer;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'backup_operator') THEN
    GRANT SELECT ON
      operations.subscriber_account,
      operations.subscriber_api_key,
      operations.subscriber_usage,
      operations.subscriber_payment,
      operations.subscriber_token
    TO backup_operator;
  END IF;
END
$$;
  `);
}

export async function down({ context }: MigrationContext): Promise<void> {
  await context.sequelize.query(`
DROP TABLE IF EXISTS operations.subscriber_token;
DROP TABLE IF EXISTS operations.subscriber_payment;
DROP TABLE IF EXISTS operations.subscriber_usage;
DROP TABLE IF EXISTS operations.subscriber_api_key;
DROP TABLE IF EXISTS operations.subscriber_account;
  `);
}
