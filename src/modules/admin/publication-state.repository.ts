import { Inject, Injectable } from '@nestjs/common';
import { QueryTypes, type Sequelize } from 'sequelize';
import { WRITER_DATABASE } from '../../database/database.tokens';

export type PublicationStatus = 'PUBLISHED' | 'PENDING' | 'FAILED' | 'UNKNOWN';

export interface PublicationUpdate {
  readonly datasetCode: string;
  readonly status: PublicationStatus;
  readonly sourceCutoffAt: Date | null;
  readonly lastError: string | null;
  readonly succeeded: boolean;
}

/**
 * Records whether what was written has actually reached a reader.
 *
 * A load that commits and a stored copy that never rebuilds is not a
 * successful load, and for two weeks it looked like one: the pipeline went
 * green on the commit and nothing measured the second half. Keeping the
 * attempt and the success as separate instants is what makes «applied» and
 * «published» able to disagree out loud.
 */
@Injectable()
export class PublicationStateRepository {
  constructor(@Inject(WRITER_DATABASE) private readonly writer: Sequelize) {}

  async record(update: PublicationUpdate): Promise<void> {
    await this.writer.query(
      `INSERT INTO operations.read_model_publication (
         read_model_publication_id, dataset_code, status, source_cutoff_at,
         last_attempt_at, last_success_at, last_error
       ) VALUES (
         gen_random_uuid(), :datasetCode, :status, :sourceCutoffAt,
         now(), CASE WHEN :succeeded THEN now() ELSE NULL END, CAST(:lastError AS varchar(500))
       )
       ON CONFLICT (dataset_code) DO UPDATE
         SET status = EXCLUDED.status,
             source_cutoff_at = COALESCE(EXCLUDED.source_cutoff_at, operations.read_model_publication.source_cutoff_at),
             last_attempt_at = EXCLUDED.last_attempt_at,
             last_success_at = COALESCE(EXCLUDED.last_success_at, operations.read_model_publication.last_success_at),
             last_error = EXCLUDED.last_error`,
      {
        type: QueryTypes.INSERT,
        replacements: {
          datasetCode: update.datasetCode,
          status: update.status,
          sourceCutoffAt: update.sourceCutoffAt,
          succeeded: update.succeeded,
          lastError: update.lastError,
        },
      },
    );
  }
}
