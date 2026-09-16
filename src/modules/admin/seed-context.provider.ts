import { Inject, Injectable } from '@nestjs/common';
import { QueryTypes, type Sequelize } from 'sequelize';
import { WRITER_DATABASE } from '../../database/database.tokens';
import { DeploymentIdentity } from './deployment-identity';
import type { PolicyContext } from './seed-policy';

/**
 * The facts a seed decision is taken against, read from the server and the database.
 *
 * Both halves matter and neither comes from the request. The profile and the
 * demo switch are this deployment's configuration; the schema version is what
 * the database itself reports having applied, because a package that needs a
 * table introduced by migration 0075 must be refused on a database that stopped
 * at 0074 — and asking the build what migrations exist would answer the wrong
 * question.
 */
@Injectable()
export class SeedContextProvider {
  constructor(
    @Inject(WRITER_DATABASE) private readonly writer: Sequelize,
    private readonly identity: DeploymentIdentity,
  ) {}

  /** The four-digit prefix of the newest migration this database has applied. */
  async appliedSchemaVersion(): Promise<string> {
    const rows = await this.writer.query<{ name: string }>(
      `SELECT name FROM infrastructure.migration_history ORDER BY name DESC LIMIT 1`,
      { type: QueryTypes.SELECT },
    );
    return rows[0]?.name.slice(0, 4) ?? '0000';
  }

  policyFor(appliedSchemaVersion: string): PolicyContext {
    return {
      isProduction: this.identity.isProduction,
      demoSeedsEnabled: this.identity.demoSeedsEnabled,
      seedProfile: this.identity.seedProfile,
      appliedSchemaVersion,
    };
  }
}
