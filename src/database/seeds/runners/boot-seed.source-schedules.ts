import { QueryTypes, type Transaction } from 'sequelize';
import { SourceModel } from '../../models';
import { sourceScheduleSeedSchema } from '../schemas/source-schedules.schema';
import { readSeed } from './seed.utils';

/**
 * Loads the calendar each source declares, by the code that names it.
 *
 * A calendar for a source this deployment does not carry is skipped, not
 * failed: the catalogue describes promises and the deployment decides which
 * sources it collects, so the two lists do not have to be the same length.
 *
 * Written as SQL rather than through a model because `operations` is an
 * operational register: it is reconciled here the same way every other
 * catalogue is — upsert by natural key, no delete, safe to run twice.
 */
export async function reconcileSourceSchedules(transaction: Transaction): Promise<number> {
  const entries = await readSeed('boot/source-schedules.json', sourceScheduleSeedSchema);
  // Taken from a registered model rather than opened here: the connection the
  // caller is already inside is the one the transaction belongs to.
  const database = SourceModel.sequelize;
  if (!database) throw new Error('Los modelos no están registrados en ninguna conexión');
  let applied = 0;
  for (const entry of entries) {
    const [result] = await database.query<{ source_expectation_id: string }>(
      `INSERT INTO operations.source_expectation (
         source_expectation_id, source_id, cadence, expected_interval_hours,
         tolerance_hours, time_zone, is_active
       )
       SELECT
         :sourceExpectationId, source.source_id, :cadence, :expectedIntervalHours,
         :toleranceHours, :timeZone, :isActive
       FROM provenance.source source
       WHERE source.code = :sourceCode
       ON CONFLICT (source_id) DO UPDATE
         SET cadence = EXCLUDED.cadence,
             expected_interval_hours = EXCLUDED.expected_interval_hours,
             tolerance_hours = EXCLUDED.tolerance_hours,
             time_zone = EXCLUDED.time_zone,
             is_active = EXCLUDED.is_active
       RETURNING source_expectation_id`,
      {
        type: QueryTypes.SELECT,
        transaction,
        replacements: {
          sourceExpectationId: entry.sourceExpectationId,
          sourceCode: entry.sourceCode,
          cadence: entry.cadence,
          expectedIntervalHours: entry.expectedIntervalHours,
          toleranceHours: entry.toleranceHours,
          timeZone: entry.timeZone,
          isActive: entry.isActive,
        },
      },
    );
    if (result) applied += 1;
  }
  return applied;
}
