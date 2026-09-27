/**
 * Which database the migrations must be applied to.
 *
 * The migrator has its own URL because it has its own role: DDL privileges the
 * writer is not granted. What it must not have is its own *database*. A
 * migration applied anywhere other than where the API writes is a no-op for the
 * application, and the worst kind — it succeeds. `migrate` finishes green, the
 * API starts behind it, and the schema the readers query is untouched.
 *
 * That is not hypothetical here. On 2026-09-07 the deployment applied 0070 and
 * 0071 while the database serving the report stayed at 0069, and a workflow was
 * written to reapply them by hand with the migrator pointed at the writer's
 * database — a repair that has to be remembered after every deploy, and whose
 * own comment says the real fix is making the two URLs agree.
 *
 * So the database name is taken from the writer and the rest of the URL from
 * the migrator. The role stays the migrator's, the address becomes the writer's,
 * and there is nothing left to remember.
 */

/** What was done to the migrator's URL, so the caller can say it out loud. */
export interface MigrationTarget {
  /** The URL to connect with: the migrator's, addressed at the writer's database. */
  readonly url: string;
  /** The database the migrations will reach. */
  readonly database: string;
  /** The database the migrator's own URL named, when it named a different one. */
  readonly redirectedFrom?: string;
}

/** The database at the end of a connection URL, or null if it names none. */
function databaseOf(url: URL): string | null {
  const name = decodeURIComponent(url.pathname.replace(/^\//, ''));
  return name === '' ? null : name;
}

/**
 * Resolves the target, leaving anything it cannot understand alone.
 *
 * A URL that does not parse, or a writer URL that names no database, is passed
 * through untouched: failing where the operator can see it beats being rewritten
 * here on a guess. Only one case is corrected, and it is unambiguous — both URLs
 * parse, both name a database, and the two names differ.
 *
 * The host is deliberately not compared. A migrator that reaches the same
 * database through a different address — a direct endpoint instead of a pooled
 * one, which is exactly how this deployment is configured — is correct, and
 * treating that as a mismatch would break the setup it is meant to protect.
 */
export function resolveMigrationTarget(migratorUrl: string, writerUrl: string): MigrationTarget {
  let migrator: URL;
  let writer: URL;
  try {
    migrator = new URL(migratorUrl);
    writer = new URL(writerUrl);
  } catch {
    return { url: migratorUrl, database: '' };
  }

  const intended = databaseOf(writer);
  const declared = databaseOf(migrator);
  if (intended === null || declared === intended) {
    return { url: migratorUrl, database: declared ?? '' };
  }

  migrator.pathname = `/${encodeURIComponent(intended)}`;
  const target: MigrationTarget = { url: migrator.toString(), database: intended };
  return declared === null ? target : { ...target, redirectedFrom: declared };
}
