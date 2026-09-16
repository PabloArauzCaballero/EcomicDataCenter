import { createHash, randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { Actor } from '../../common/auth/actor';
import { SEED_PACKAGES } from '../../database/seeds/manifest';
import {
  planOrder,
  resolveAllPackages,
  resolvePackage,
} from '../../database/seeds/manifest-resolution';
import { DeploymentIdentity } from './deployment-identity';
import { SeedContextProvider } from './seed-context.provider';
import { SeedDifferenceRepository } from './seed-difference.repository';
import { SeedLedgerRepository } from './seed-ledger.repository';
import { SeedRunRepository } from './seed-run.repository';
import { compareLedger, refuseSeed } from './seed-policy';

/**
 * Reads what this build carries and what this database already has.
 *
 * It is separated from the service that applies packages for a reason an
 * operator can feel: everything here is safe to run at any time against any
 * environment, and nothing here can write a domain row. A validation that could
 * accidentally mutate would be useless as the step before deciding to mutate.
 */
@Injectable()
export class SeedInspectionService {
  constructor(
    private readonly identity: DeploymentIdentity,
    private readonly context: SeedContextProvider,
    private readonly ledger: SeedLedgerRepository,
    private readonly runs: SeedRunRepository,
    private readonly differences: SeedDifferenceRepository,
  ) {}

  async listPackages(): Promise<unknown[]> {
    const [manifests, entries, schemaVersion] = await Promise.all([
      resolveAllPackages(),
      this.ledger.readLedger(this.identity.databaseIdentity),
      this.context.appliedSchemaVersion(),
    ]);
    const { problems } = planOrder(SEED_PACKAGES);
    const policy = this.context.policyFor(schemaVersion);
    return manifests.map((manifest) => {
      const applied = entries.filter((entry) => entry.packageCode === manifest.code);
      const refusal = refuseSeed(manifest, policy, problems);
      return {
        code: manifest.code,
        label: manifest.label,
        kind: manifest.kind,
        version: manifest.version,
        checksum: manifest.checksum,
        ownership: manifest.ownership,
        dependsOn: manifest.dependsOn,
        requiredFor: manifest.requiredFor,
        fileCount: manifest.files.length,
        ledgerState: compareLedger(manifest, applied),
        appliedVersions: applied.map((entry) => ({
          version: entry.packageVersion,
          checksum: entry.checksum,
          appliedAt: entry.appliedAt.toISOString(),
          appliedCommit: entry.appliedCommit,
        })),
        refusal,
        applicable: refusal === null,
      };
    });
  }

  /**
   * Checks a package end to end and records that somebody checked.
   *
   * The difference is only computed when the package is applicable at all:
   * comparing a catalogue this deployment is not allowed to load would produce
   * a list of «missing» rows that are missing on purpose.
   */
  async validate(packageCode: string, actor: Actor): Promise<unknown> {
    const manifest = await resolvePackage(packageCode);
    const { problems } = planOrder(SEED_PACKAGES);
    const schemaVersion = await this.context.appliedSchemaVersion();
    const refusal = refuseSeed(manifest, this.context.policyFor(schemaVersion), problems);
    const entries = await this.ledger.readLedger(this.identity.databaseIdentity);
    const applied = entries.filter((entry) => entry.packageCode === manifest.code);
    const difference = refusal ? null : await this.differences.describe(packageCode);

    const opened = await this.runs.openRun({
      seedRunId: randomUUID(),
      packageCode: manifest.code,
      packageVersion: manifest.version,
      operation: 'VALIDATION',
      actorSubject: actor.subject,
      environmentId: this.identity.environmentId,
      databaseIdentity: this.identity.databaseIdentity,
      requestFingerprint: createHash('sha256')
        .update(
          [
            this.identity.databaseIdentity,
            manifest.code,
            manifest.checksum,
            'VALIDATION',
            randomUUID(),
          ].join('|'),
        )
        .digest('hex'),
    });
    const run = opened.run;
    await this.runs.updateRun(run.seedRunId, {
      status: refusal ? 'FAILED' : 'SUCCEEDED',
      completed: true,
      errorSummary: refusal?.message ?? null,
      counters: { catalogues: difference?.catalogues.length ?? 0 },
    });

    return {
      seedRunId: run.seedRunId,
      code: manifest.code,
      label: manifest.label,
      version: manifest.version,
      checksum: manifest.checksum,
      kind: manifest.kind,
      ownership: manifest.ownership,
      schemaVersion,
      ledgerState: compareLedger(manifest, applied),
      refusal,
      difference,
    };
  }
}
