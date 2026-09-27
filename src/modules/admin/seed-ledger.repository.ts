import { Inject, Injectable } from '@nestjs/common';
import { QueryTypes, type Sequelize, type Transaction } from 'sequelize';
import { WRITER_DATABASE } from '../../database/database.tokens';

export interface SeedApplicationRecord {
  readonly packageCode: string;
  readonly packageVersion: string;
  readonly checksum: string;
  readonly appliedAt: Date;
  readonly appliedCommit: string | null;
  readonly summary: Readonly<Record<string, unknown>>;
}

interface LedgerRow {
  package_code: string;
  package_version: string;
  checksum: string;
  applied_at: Date;
  applied_commit: string | null;
  summary_json: Record<string, unknown>;
}

/**
 * The durable record of which packages this database actually carries.
 *
 * It writes through the writer pool because these are commands, and it takes a
 * transaction from the caller because the entry has to commit together with the
 * rows it describes. That coupling is the point: a ledger entry written in its
 * own transaction can survive a reconciliation that rolled back, and then the
 * database claims to carry a catalogue it does not have.
 */
@Injectable()
export class SeedLedgerRepository {
  constructor(@Inject(WRITER_DATABASE) private readonly writer: Sequelize) {}

  async readLedger(databaseIdentity: string): Promise<SeedApplicationRecord[]> {
    const rows = await this.writer.query<LedgerRow>(
      `SELECT package_code, package_version, checksum, applied_at, applied_commit, summary_json
         FROM operations.seed_application
        WHERE database_identity = :databaseIdentity
        ORDER BY package_code, package_version`,
      { type: QueryTypes.SELECT, replacements: { databaseIdentity } },
    );
    return rows.map((row) => ({
      packageCode: row.package_code,
      packageVersion: row.package_version,
      checksum: row.checksum,
      appliedAt: row.applied_at,
      appliedCommit: row.applied_commit,
      summary: row.summary_json,
    }));
  }

  /**
   * Records that a package reached this database, inside the caller's transaction.
   *
   * The conflict clause rewrites the timestamp and the summary of an entry that
   * already matches, so re-applying an unchanged package is a no-op that still
   * records that somebody checked. It does not rewrite the checksum: a second
   * application of the same version with different content must fail the unique
   * constraint's contract rather than overwrite the record of what was applied
   * the first time. The caller compares checksums before it gets here.
   */
  async recordApplication(
    databaseIdentity: string,
    environmentId: string,
    record: SeedApplicationRecord,
    transaction: Transaction,
  ): Promise<void> {
    await this.writer.query(
      `INSERT INTO operations.seed_application (
         seed_application_id, database_identity, environment_id, package_code,
         package_version, checksum, applied_commit, applied_at, summary_json
       ) VALUES (
         gen_random_uuid(), :databaseIdentity, :environmentId, :packageCode,
         :packageVersion, :checksum, :appliedCommit, :appliedAt, CAST(:summary AS jsonb)
       )
       ON CONFLICT ON CONSTRAINT uq_seed_application_target DO UPDATE
         SET applied_at = EXCLUDED.applied_at,
             applied_commit = EXCLUDED.applied_commit,
             summary_json = EXCLUDED.summary_json
       WHERE operations.seed_application.checksum = EXCLUDED.checksum`,
      {
        type: QueryTypes.INSERT,
        transaction,
        replacements: {
          databaseIdentity,
          environmentId,
          packageCode: record.packageCode,
          packageVersion: record.packageVersion,
          checksum: record.checksum,
          appliedCommit: record.appliedCommit,
          appliedAt: record.appliedAt,
          summary: JSON.stringify(record.summary),
        },
      },
    );
  }
}
