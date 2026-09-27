import {
  dropLocatedPlaceViews,
  locatedPlaceFamilyView,
  locatedPlaceGrants,
  locatedPlaceView,
} from '../migration-sql/0084-locate-the-places-by-municipality.view';
import {
  dropNationalPlaceModels,
  nationalPlaceFamilyView,
  nationalPlaceGrants,
  nationalPlaceIndexes,
  nationalPlaceSnapshot,
} from '../migration-sql/0085-store-the-national-places.view';
import type { MigrationContext } from '../migration.types';

/**
 * Stores the national places instead of recomputing them on every read.
 *
 * Migration 0084 gave half the national corpus a municipality, and the price
 * was paid on every visit: each read re-ran a `DISTINCT ON` over the
 * municipality observations and filtered on a `COALESCE` no index serves. On
 * test, measured 2026-09-24, the family catalogue took 31 s and came back 503,
 * and Santa Cruz without a family crossed the 30 s statement ceiling. The same
 * shape 0072 gave the four expensive read models fixes it: the model keeps its
 * name, its columns and its meaning, and becomes a stored copy with the indexes
 * its readers filter by.
 *
 * Created `WITH NO DATA`, for the reason 0072 gives: the `api` service waits on
 * `migrate`, and building here would put the whole join between a deploy and a
 * core that can start — under the migrator's statement ceiling, which a build
 * as slow as test's reads could exceed. The API fills it right after it starts listening
 * (`snapshot-refresh.ts`, first in its order), and every load of the national
 * places refreshes it (`run-boot-seeds.ts`, `seed-catalogue-map.ts`). Until the
 * first fill, reading it raises 55000 and the report says it could not read the
 * places, which is true, instead of waiting thirty seconds to say the same.
 *
 * It also unifies «Nuestra Señora de La Paz» into «La Paz» in `locality`; the
 * view text explains why and what is kept.
 */
export async function up({ context }: MigrationContext): Promise<void> {
  await context.sequelize.query(dropNationalPlaceModels);
  await context.sequelize.query(nationalPlaceSnapshot);
  await context.sequelize.query(nationalPlaceIndexes);
  await context.sequelize.query(nationalPlaceFamilyView);
  await context.sequelize.query(nationalPlaceGrants);
}

export async function down({ context }: MigrationContext): Promise<void> {
  await context.sequelize.query(dropNationalPlaceModels);
  await context.sequelize.query(dropLocatedPlaceViews);
  await context.sequelize.query(locatedPlaceView);
  await context.sequelize.query(locatedPlaceFamilyView);
  await context.sequelize.query(locatedPlaceGrants);
}
