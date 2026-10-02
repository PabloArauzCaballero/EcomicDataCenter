import { readPressNotesOn } from '../../press-readings';
import { refreshOneSnapshot } from '../../snapshot-refresh';
import { TRADE_COPIES, tradeCopiesAreCurrentIn } from '../../trade-copies-currency';
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
  'business-registry',
  'business-rankings',
  'business-wealth',
];

/**
 * Runs one group of rebuilds and keeps going if it fails.
 *
 * Until 2026-10-01 the rebuilds ran in a straight line, so the first one to hit
 * the statement ceiling ended the whole step: on Contabo the press copies
 * (the slowest, first in line) were cancelled after an hour and the three trade
 * copies behind them were never rebuilt. The blocks of the INE customs base were
 * already committed, so every later boot found «nothing new» and skipped the
 * rebuild for good, while the report kept reading an empty copy and said the
 * base was not loaded. Each group now stands alone, and the failures are
 * reported together at the end so the load still ends red.
 */
async function attempt(
  label: string,
  failures: string[],
  rebuild: () => Promise<void>,
): Promise<void> {
  try {
    await rebuild();
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'fallo desconocido';
    failures.push(label);
    process.stderr.write(`copia ${label}: ${detail}
`);
  }
}

export async function refreshAfterLoad(
  database: Database,
  wanted: (name: Catalogue) => boolean,
  outcomes: ReadonlyMap<Catalogue, unknown>,
): Promise<void> {
  const failures: string[] = [];
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

  /*
   * Stored copies since 0087: the flows, the products and the codes they cite.
   *
   * Rebuilt when a block came in, and also when the database says the copies no
   * longer match the blocks it holds (0092). The first rule alone left a copy
   * empty for good once its rebuild died after the blocks were committed: the
   * next load found nothing new. A million rows are still not rebuilt on every
   * deploy for nothing — the probe costs milliseconds and answers «current».
   *
   * First in line, ahead of the press copies: those are the slowest and, when
   * one is cancelled, anything queued behind it is lost.
   */
  if (wanted('ine-trade')) {
    await attempt('trade', failures, async () => {
      const rebuild =
        outcomes.get('ine-trade') === true || !(await tradeCopiesAreCurrentIn(database));
      if (!rebuild) return;
      for (const name of TRADE_COPIES) await refreshOneSnapshot(database, name, true);
    });
  }
  if (wanted('press-coverage') || wanted('press-archive')) {
    await attempt('press', failures, async () => {
      // Each note is read once and stored (0093); this pays only for the new ones.
      await readPressNotesOn(database);
      await refreshOneSnapshot(database, 'press_article_snapshot', true);
      await refreshOneSnapshot(database, 'press_term_mention_snapshot', true);
    });
  }
  if (wanted('social-readings')) {
    await attempt('social', failures, () =>
      refreshOneSnapshot(database, 'social_reading_snapshot', true),
    );
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
    await attempt('annual', failures, async () => {
      await refreshOneSnapshot(database, 'macro_indicator_annual_snapshot', true);
      await refreshOneSnapshot(database, 'indicator_source_note_snapshot', true);
    });
  }

  // A stored copy since 0085: a load of places or municipalities leaves it
  // stale until this runs, and it reads only what was committed.
  if (wanted('bolivia-national-poi')) {
    await attempt('places', failures, () => refreshOneSnapshot(database, 'national_place', true));
  }

  if (failures.length > 0) {
    throw new Error(`copias que no se reconstruyeron: ${failures.join(', ')}`);
  }
}
