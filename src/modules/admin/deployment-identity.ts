import { Inject, Injectable } from '@nestjs/common';
import { ENVIRONMENT } from '../../config/configuration.module';
import type { Environment } from '../../config/environment';

/**
 * Which deployment, and which database, an administrative answer is about.
 *
 * Both come from the server's own configuration. A console that accepted an
 * environment name from the request would let a form field aim a reconciliation
 * at production, so the request never gets a say: an operator administers the
 * deployment they are connected to, and a multi-target console would need
 * configured destinations and a permission per destination before it existed.
 *
 * The database identity is written into the seed ledger, so it must be stable
 * and must not carry a credential. Host, port and database name identify the
 * target without saying who connects to it.
 */
@Injectable()
export class DeploymentIdentity {
  readonly environmentId: string;
  readonly databaseIdentity: string;
  readonly buildCommit: string | null;
  readonly seedProfile: Environment['SEED_PROFILE'];
  readonly demoSeedsEnabled: boolean;
  readonly isProduction: boolean;

  constructor(@Inject(ENVIRONMENT) private readonly environment: Environment) {
    this.environmentId = this.environment.ADMIN_ENVIRONMENT_ID;
    this.databaseIdentity = describeDatabase(this.environment.DATABASE_WRITER_URL);
    this.buildCommit = this.environment.BUILD_COMMIT ?? null;
    this.seedProfile = this.environment.SEED_PROFILE;
    this.demoSeedsEnabled = this.environment.SEED_DEMO_ENABLED;
    this.isProduction = this.environment.NODE_ENV === 'production';
  }
}

/**
 * Reduces a connection string to the target it names, and nothing else.
 *
 * A string that cannot be parsed yields a constant rather than the original:
 * the ledger would otherwise store a malformed URL that may still contain the
 * password that made it unparseable.
 */
export function describeDatabase(connectionString: string): string {
  try {
    const url = new URL(connectionString);
    const database = decodeURIComponent(url.pathname.replace(/^\//u, '')) || 'unknown';
    const port = url.port || '5432';
    return `${url.hostname}:${port}/${database}`;
  } catch {
    return 'unparseable-connection-string';
  }
}
