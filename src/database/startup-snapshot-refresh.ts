import type { Sequelize } from 'sequelize';
import { refreshSnapshots, withPinnedSession } from './snapshot-refresh';

/** The three levels the process log offers, and all this needs of it. */
export interface BootLog {
  log(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

/**
 * Fills the stored copies a migration left empty, once the API is listening.
 *
 * Migration 0072 creates them `WITH NO DATA` so a deploy is never held behind
 * minutes of sorting, and until 2026-09-09 filling them was a command somebody
 * ran by hand inside the container. That night it went the way hand-run steps
 * go: the copies stayed empty for hours after the migration landed, the rebuild
 * that was finally started got killed halfway when the collector's scheduled
 * deploy replaced the container it ran in, and every visit to the report paid
 * the full price of the four expensive views meanwhile.
 *
 * So the process does it itself, in the background, after `listen` — never
 * before it, because a replica that could serve the daily series must not be
 * kept from serving them by a register that can wait. Only copies that have
 * never been built are touched: this runs three times a day behind the
 * collector's deploy, and rebuilding the whole register each time would be a
 * load the server was measured not to carry. The normal case costs one catalog
 * query and an advisory lock, and does nothing.
 *
 * If a deploy kills this halfway, the next container picks it up where the
 * catalog says it stopped: that is what `relispopulated` is for.
 *
 * Nothing here can take the process down. A rebuild that fails is a section
 * the report will show as unread, which is exactly what it showed before.
 */
export async function refreshSnapshotsAfterBoot(
  database: Sequelize,
  log: BootLog,
): Promise<void> {
  const report = {
    line: (text: string) => log.log(`[copias] ${text}`),
    problem: (text: string) => log.warn(`[copias] ${text}`),
  };
  try {
    const outcome = await withPinnedSession(database, (session) =>
      refreshSnapshots(session, report, { onlyUnbuilt: true }),
    );
    if (outcome === null) {
      log.log('[copias] otra reconstruccion tiene el candado; esta se retira');
    } else if (outcome.built.length === 0 && outcome.failed.length === 0) {
      log.log('[copias] todas las copias estan construidas; nada que hacer');
    } else {
      log.log(
        `[copias] construidas: ${outcome.built.join(', ') || 'ninguna'}` +
          (outcome.failed.length ? ` | fallidas: ${outcome.failed.join(', ')}` : ''),
      );
    }
  } catch (error) {
    // A pool already closing at shutdown lands here too; neither is fatal.
    log.error(`[copias] ${error instanceof Error ? error.message : 'fallo no clasificado'}`);
  }
}
