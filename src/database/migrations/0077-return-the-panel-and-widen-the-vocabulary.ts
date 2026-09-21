import { annualView as annualViewBefore } from '../migration-sql/0064-file-the-fiscal-accounts.view';
import {
  annualSnapshot,
  annualSnapshotIndexes,
  annualView,
  dropModels,
  grants,
} from '../migration-sql/0077-return-the-panel-and-widen-the-vocabulary.view';
import type { MigrationContext } from '../migration.types';

/**
 * Takes the world panel back out of Bolivia's annual series, and files what
 * is left into rubros that answer one question each.
 *
 * Two faults, and the second was hiding behind the first.
 *
 * **The panel was being averaged into the country.** Migration 0067 brought in
 * the World Development Indicators for Bolivia and the twenty-nine economies it
 * is read against, and said in its own comment that the corpus is kept apart
 * from `economic_indicator_reading` because every row carries a country. It is
 * kept apart in its own view. It was never kept apart here: the loader writes
 * `frequency: 'ANNUAL'` and a `measures` array, which is the whole of what
 * `economic_indicator_reading` asks of a row, so fifteen hundred panel series
 * arrived in this view and were collapsed by its `GROUP BY indicator_code,
 * period, unit` — with no country column to separate them.
 *
 * What the report has been publishing since is not a rounding error. Bolivia's
 * population for 2025 read 541.062.972 and its GDP 8,36 billones de dólares:
 * the mean of thirty economies and the World Bank's world aggregate, filed
 * under the panel that is supposed to be Bolivia. Nobody's figures, under a
 * heading that names a country. They are excluded here by the one thing that
 * tells them apart, `data_category`, so the view returns the hundred and
 * sixty-five series this observatory actually measures for Bolivia. The panel
 * loses nothing: it is read for what it is —per country, per year— from
 * `world_panel_reading`, where it always was.
 *
 * **The vocabulary was too narrow to file anything.** With the panel gone the
 * residual empties, and a residual that empties is the moment to ask whether
 * the twelve rubros left were ever enough. They were not. `SOCIAL` held
 * literacy, infant mortality, unemployment, population and the Gini index at
 * once — five questions and one heading — and a reader who opened it got a
 * list, not an answer. It splits into `EDUCACION`, `SALUD`, `TRABAJO`,
 * `POBLACION` and `POBREZA`, and `AMBIENTE`, `INFRAESTRUCTURA`, `EMPRESAS` and
 * `COOPERACION` join them for the series that had no heading of their own.
 * `SOCIAL` survives for what is genuinely composite —the human development
 * index is not health, education or income, it is the three at once.
 *
 * The same twenty-two rubros are what the dashboard files the panel's own
 * fifteen hundred series into, from the prefix of the World Bank's code. Two
 * corpora, one vocabulary, on purpose: a reader who filters «Salud» in one tab
 * and in the other has to be asking the same question.
 *
 * Nothing is re-measured. Every figure keeps its value, its unit, its source
 * and its digest; what changes is which rows this view admits and what each one
 * is called. The stored copy is dropped and rebuilt because migration 0072 put
 * it on top of this view, and it comes back `WITH NO DATA` for the reason 0072
 * gave — the refresh is a step that is allowed to fail without holding the API
 * down.
 */

export async function up({ context }: MigrationContext): Promise<void> {
  // Idempotente por si un intento anterior dejo la mitad: crear una vista que
  // ya existe aborta la migracion entera y bloquea el arranque de la API.
  await context.sequelize.query(dropModels);
  await context.sequelize.query(annualView);
  await context.sequelize.query(annualSnapshot);
  await context.sequelize.query(annualSnapshotIndexes);
  await context.sequelize.query(grants);
}

/**
 * Puts back exactly what was standing before: migration 0064's view, with the
 * stored copy migration 0072 built on top of it.
 *
 * Dropping and stopping would have been the shape the earlier redefinitions
 * used, but they ran before 0072 existed. Today that would take the snapshot
 * down with the view and leave a rollback to 0076 without a model the deploy
 * before it had.
 */
export async function down({ context }: MigrationContext): Promise<void> {
  await context.sequelize.query(dropModels);
  await context.sequelize.query(annualViewBefore);
  await context.sequelize.query(annualSnapshot);
  await context.sequelize.query(annualSnapshotIndexes);
  await context.sequelize.query(grants);
}
