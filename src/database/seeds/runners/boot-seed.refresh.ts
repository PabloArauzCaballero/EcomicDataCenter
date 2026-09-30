import { refreshOneSnapshot } from '../../snapshot-refresh';
import type { Catalogue } from './run-boot-seeds';

/**
 * The stored copies a boot load leaves stale, rebuilt once it has committed.
 *
 * Moved out of `run-boot-seeds.ts` as it stood, when the runner reached the
 * size the quality gate allows: each new stored copy adds its own rebuild here,
 * and the runner should not grow with every one of them.
 */

type Database = Parameters<typeof refreshOneSnapshot>[0];

/**
 * The catalogues whose rows the annual panel and its source notes are built from.
 *
 * `foreign-trade` belonged here from the day it was written and was missing:
 * its readings are `frequency: 'ANNUAL'` and land in the same view as the rest,
 * so `--only=foreign-trade` loaded them into the database and left the stored
 * copy — which is what every panel reads — without them. On a full run the
 * refresh happened anyway because every catalogue is wanted, which is why the
 * gap stayed invisible. `mineral-trade` has the same shape and would have
 * inherited the same silence.
 */
const ANNUAL_CATALOGUES: readonly Catalogue[] = [
  'macro-annual-history',
  'composite-indices',
  'ufv-history',
  'bbv-yields',
  'foreign-trade',
  'mineral-trade',
  'foreign-trade-detail',
  'annual-registers',
  'annual-activities',
];

export async function refreshAfterLoad(
  database: Database,
  wanted: (name: Catalogue) => boolean,
  outcomes: ReadonlyMap<Catalogue, unknown>,
): Promise<void> {
  /*
   * Outside the transaction, because a materialised view cannot be refreshed
   * concurrently inside one — and because until it is refreshed the report
   * serves the corpus as it stood before this load.
   */
  /*
   * Through the routine that is allowed to refresh, not the raw statement.
   *
   * `REFRESH MATERIALIZED VIEW` requires ownership of the view; no grant
   * substitutes for it. The raw statement here worked in production only
   * because that writer owns more than the design supposes, and failed on
   * every database whose privileges match it — which is why continuous
   * integration reported `permission denied for schema read_models` after
   * loading all sixteen catalogues correctly.
   */
  if (wanted('press-coverage') || wanted('press-archive')) {
    await refreshOneSnapshot(database, 'press_article_snapshot', true);
    await refreshOneSnapshot(database, 'press_term_mention_snapshot', true);
  }
  if (wanted('social-readings')) {
    await refreshOneSnapshot(database, 'social_reading_snapshot', true);
  }
  /*
   * The annual panel is a stored copy too, and until 2026-09-21 nothing here
   * rebuilt it. The API refreshes only the copies that were never built, and
   * it starts beside this loader rather than after it, so a catalogue that
   * arrived with new series - twenty-five freedom indices, that day - was in
   * the database and absent from every panel until somebody refreshed by
   * hand. This copy is a few thousand rows; rebuilding it costs seconds.
   */
  if (ANNUAL_CATALOGUES.some((name) => wanted(name))) {
    await refreshOneSnapshot(database, 'macro_indicator_annual_snapshot', true);
    await refreshOneSnapshot(database, 'indicator_source_note_snapshot', true);
  }

  // A stored copy since 0085: a load of places or municipalities leaves it
  // stale until this runs, and it reads only what was committed.
  if (wanted('bolivia-national-poi')) {
    await refreshOneSnapshot(database, 'national_place', true);
  }

  // Stored copies since 0087: the flows, the products and the codes they cite.
  // Rebuilt only when a block came in — a million rows are not rebuilt on every
  // deploy for nothing; the API fills them after a migration leaves them empty.
  if (outcomes.get('ine-trade') === true) {
    for (const name of ['trade_flow', 'trade_product', 'trade_code']) {
      await refreshOneSnapshot(database, name, true);
    }
  }
}
