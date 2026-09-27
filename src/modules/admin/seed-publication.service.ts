import { Inject, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import type { Sequelize } from 'sequelize';
import { WRITER_DATABASE } from '../../database/database.tokens';
import { refreshSnapshots, withPinnedSession } from '../../database/snapshot-refresh';
import { ENVIRONMENT } from '../../config/configuration.module';
import type { Environment } from '../../config/environment';
import { PublicationStateRepository } from './publication-state.repository';
import { PACKAGE_SNAPSHOTS } from './seed-catalogue-map';
import { SeedRunRepository, type SeedRunRecord } from './seed-run.repository';

/**
 * Rebuilds what a load changed, and records whether the reader ever saw it.
 *
 * This is the half that used to be invisible. A catalogue committed and a
 * stored copy that never rebuilt looked exactly like a successful load from
 * every angle the pipeline could see, and the report kept serving the corpus as
 * it stood before. So the rebuild is measured: each copy that was rebuilt and
 * each that failed is written down, and a run whose data landed but whose
 * publication did not ends `PARTIAL` — never `SUCCEEDED`.
 *
 * A failure here never undoes the load. The rows are in the database; what is
 * missing is their visibility, and saying so is more useful than a rollback
 * that would throw away work which is not wrong.
 */
@Injectable()
export class SeedPublicationService {
  constructor(
    @Inject(WRITER_DATABASE) private readonly writer: Sequelize,
    @Inject(ENVIRONMENT) private readonly environment: Environment,
    private readonly publications: PublicationStateRepository,
    private readonly runs: SeedRunRepository,
    private readonly logger: PinoLogger,
  ) {}

  async publishAfterSeed(run: SeedRunRecord, completed: readonly string[]): Promise<void> {
    const counters = { units: completed.length };
    try {
      if (this.environment.SEED_FAULT_INJECTION === 'before-publish') {
        throw new Error('Fallo inyectado antes de la publicación');
      }
      const outcome = await withPinnedSession(this.writer, (session) =>
        refreshSnapshots(
          session,
          {
            line: (text: string) => this.logger.info({ snapshot: text }, 'Seed publication'),
            problem: (text: string) => this.logger.warn({ snapshot: text }, 'Seed publication'),
          },
          {
            onlyUnbuilt: false,
            // Only what this package can have made stale; an unbuilt copy is
            // rebuilt regardless, because an unbuilt copy cannot be read at all.
            only: PACKAGE_SNAPSHOTS[run.packageCode] ?? [],
          },
        ),
      );
      if (outcome === null) {
        await this.runs.updateRun(run.seedRunId, {
          status: 'PARTIAL',
          completed: true,
          counters,
          errorSummary: 'Datos aplicados; otra reconstrucción tenía el candado de las copias',
        });
        return;
      }
      for (const dataset of outcome.built) {
        await this.publications.record({
          datasetCode: dataset,
          status: 'PUBLISHED',
          sourceCutoffAt: new Date(),
          lastError: null,
          succeeded: true,
        });
      }
      for (const dataset of outcome.failed) {
        await this.publications.record({
          datasetCode: dataset,
          status: 'FAILED',
          sourceCutoffAt: null,
          lastError: 'La reconstrucción de la copia guardada falló',
          succeeded: false,
        });
      }
      await this.runs.updateRun(run.seedRunId, {
        status: outcome.failed.length ? 'PARTIAL' : 'SUCCEEDED',
        completed: true,
        counters,
        ...(outcome.failed.length
          ? { errorSummary: `Publicación pendiente: ${outcome.failed.join(', ')}` }
          : {}),
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message.slice(0, 300) : 'fallo no clasificado';
      await this.publications.record({
        datasetCode: `seed:${run.packageCode}`,
        status: 'PENDING',
        sourceCutoffAt: null,
        lastError: detail,
        succeeded: false,
      });
      await this.runs.updateRun(run.seedRunId, {
        status: 'PARTIAL',
        completed: true,
        counters,
        errorSummary: `Datos aplicados; la publicación quedó pendiente: ${detail}`,
      });
    }
  }
}
