import type { MigrationContext } from '../migration.types';

/**
 * Opens a register for the people who ask the observatory for a service.
 *
 * The public site gains a «contact our services» form, and what it sends is an
 * operational fact — somebody asked for a plan, an operator followed up — not a
 * fact about Bolivia. It lives in `operations` beside the traffic and export
 * registers for the same reason they do: a retention or deletion policy over
 * these rows must never be able to touch economic history.
 *
 * Two invariants the API depends on:
 *
 * 1. `request_id` is unique. The site generates it once per submission and
 *    retries with the same value when it is unsure the first delivery landed,
 *    so a retry returns the row that already exists instead of a second lead.
 * 2. `status` and `plan_code` are closed lists checked here as well as in the
 *    API, so a row written by any other path still means the same thing.
 *
 * Unlike the rest of the schema, these rows carry personal data (name, e-mail,
 * phone, free text). The writer gets no DELETE: removing a person's inquiry is
 * a deliberate act for the migrator credential, not something a compromised
 * runtime can do quietly.
 *
 * The SQL is written here rather than in a `migration-sql` module because the
 * physical-model gate parses the migration files themselves.
 */
export async function up({ context }: MigrationContext): Promise<void> {
  await context.sequelize.query(`
CREATE TABLE operations.service_inquiry (
  service_inquiry_id uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL UNIQUE,
  full_name text NOT NULL,
  email text NOT NULL,
  organization text,
  phone text,
  plan_code text NOT NULL,
  message text NOT NULL,
  source_route text NOT NULL,
  status text NOT NULL DEFAULT 'NEW',
  operator_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz,
  updated_by text,
  CONSTRAINT ck_service_inquiry_plan_code CHECK (plan_code IN ('analista', 'profesional', 'institucional', 'a-medida')),
  CONSTRAINT ck_service_inquiry_status CHECK (status IN ('NEW', 'CONTACTED', 'WON', 'LOST'))
);
  `);

  await context.sequelize.query(`
CREATE INDEX ix_service_inquiry_status_created_at
  ON operations.service_inquiry (status, created_at DESC, service_inquiry_id DESC);
CREATE INDEX ix_service_inquiry_created_at
  ON operations.service_inquiry (created_at DESC, service_inquiry_id DESC);
  `);

  await context.sequelize.query(`
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'backend_writer') THEN
    GRANT SELECT, INSERT, UPDATE ON operations.service_inquiry TO backend_writer;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'backend_reader') THEN
    GRANT SELECT ON operations.service_inquiry TO backend_reader;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'backup_operator') THEN
    GRANT SELECT ON operations.service_inquiry TO backup_operator;
  END IF;
END
$$;
  `);
}

export async function down({ context }: MigrationContext): Promise<void> {
  await context.sequelize.query(`
DROP TABLE IF EXISTS operations.service_inquiry;
  `);
}
