import { randomUUID } from 'node:crypto';
import { QueryTypes, type Sequelize } from 'sequelize';
import { resolvePackage } from '../manifest-resolution';

/**
 * Records, in the same register the portal reads, what provisioning applied.
 *
 * Without this the ledger only knew about packages an operator applied through
 * the console, so a deployment that had been provisioned correctly at boot
 * showed every catalogue as «no aplicado» — a false alarm that would have
 * taught everyone to ignore the column within a week.
 *
 * It is best effort on purpose. A ledger entry that fails to write leaves the
 * package reading as absent, which is the conservative direction: it
 * under-claims rather than claiming a catalogue that is not there. The load
 * itself is never failed for it.
 */
export async function recordBootApplication(
  database: Sequelize,
  environmentId: string,
  databaseIdentity: string,
  packageCode: string,
): Promise<void> {
  try {
    const manifest = await resolvePackage(packageCode);
    await database.query(
      `INSERT INTO operations.seed_application (
         seed_application_id, database_identity, environment_id, package_code,
         package_version, checksum, applied_commit, applied_at, summary_json
       ) VALUES (
         :id, :databaseIdentity, :environmentId, :packageCode,
         :version, :checksum, :commit, now(), CAST(:summary AS jsonb)
       )
       ON CONFLICT ON CONSTRAINT uq_seed_application_target DO UPDATE
         SET applied_at = EXCLUDED.applied_at,
             applied_commit = EXCLUDED.applied_commit,
             summary_json = EXCLUDED.summary_json
       WHERE operations.seed_application.checksum = EXCLUDED.checksum`,
      {
        type: QueryTypes.INSERT,
        replacements: {
          id: randomUUID(),
          databaseIdentity,
          environmentId,
          packageCode: manifest.code,
          version: manifest.version,
          checksum: manifest.checksum,
          commit: process.env['BUILD_COMMIT'] ?? null,
          summary: JSON.stringify({ appliedBy: 'startup-provisioning' }),
        },
      },
    );
  } catch (error) {
    process.stderr.write(
      `registro de siembra no anotado para ${packageCode}: ` +
        `${error instanceof Error ? error.message : 'fallo no clasificado'}\n`,
    );
  }
}

/** Host, port and database name — never the credential that reached them. */
export function describeSeedTarget(connectionString: string): string {
  try {
    const url = new URL(connectionString);
    const name = decodeURIComponent(url.pathname.replace(/^\//u, '')) || 'unknown';
    return `${url.hostname}:${url.port || '5432'}/${name}`;
  } catch {
    return 'unparseable-connection-string';
  }
}
