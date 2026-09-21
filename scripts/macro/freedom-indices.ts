/**
 * The freedom indices, and where each one lives inside its publisher's workbook.
 *
 * Neither institution offers an API or a CSV. Freedom House publishes *Freedom
 * in the World* as two workbooks — the raw scores of the last dozen editions,
 * and the 1–7 ratings back to the first survey — and the Fraser Institute
 * publishes *Economic Freedom of the World* as one workbook on the site that
 * hosts its dataset. A workbook is still a citable file with a stable address
 * and a checksum, so the seed records it exactly as it records a CSV, and the
 * heading each figure was read under.
 *
 * What is taken is the composite and the areas it is built from, never the
 * underlying questions: a reader wants to know *which part* of freedom moved,
 * and the areas are the level at which the publishers themselves report that.
 */

export interface WorkbookSeries {
  readonly indicatorCode: string;
  readonly name: string;
  /** `INDEX` for a continuous scale, `SCORE` for a bounded integer one. */
  readonly unit: 'INDEX' | 'SCORE';
  /** Heading of the column the value is read from, as the workbook prints it. */
  readonly column: string;
}

export interface WorkbookSource {
  readonly publisher: string;
  readonly sourceUrl: string;
  readonly sheet: string;
  readonly series: readonly WorkbookSeries[];
}

const FREEDOM_HOUSE = 'FREEDOM HOUSE';
const FRASER = 'FRASER INSTITUTE';

/**
 * Freedom in the World, scored. Edition N rates the calendar year N − 1, and
 * the seed files each figure under the year it describes.
 *
 * The total is out of 100: political rights (A–C) out of 40, civil liberties
 * (D–G) out of 60. Each lettered block is a subcategory with its own ceiling,
 * stated in the name so that a 6 is never read as a 6 out of 100.
 */
export const FREEDOM_HOUSE_SCORES: WorkbookSource = {
  publisher: FREEDOM_HOUSE,
  sourceUrl: 'https://freedomhouse.org/sites/default/files/2024-02/All_data_FIW_2013-2024.xlsx',
  sheet: 'FIW13-24',
  series: [
    {
      indicatorCode: 'FH_TOTAL_SCORE',
      name: 'Libertad en el mundo, puntaje total (0-100)',
      unit: 'SCORE',
      column: 'Total',
    },
    {
      indicatorCode: 'FH_POLITICAL_RIGHTS_SCORE',
      name: 'Derechos politicos (0-40)',
      unit: 'SCORE',
      column: 'PR',
    },
    {
      indicatorCode: 'FH_CIVIL_LIBERTIES_SCORE',
      name: 'Libertades civiles (0-60)',
      unit: 'SCORE',
      column: 'CL',
    },
    {
      indicatorCode: 'FH_ELECTORAL_PROCESS_SCORE',
      name: 'Proceso electoral (0-12)',
      unit: 'SCORE',
      column: 'A',
    },
    {
      indicatorCode: 'FH_POLITICAL_PLURALISM_SCORE',
      name: 'Pluralismo y participacion politica (0-16)',
      unit: 'SCORE',
      column: 'B',
    },
    {
      indicatorCode: 'FH_GOVERNMENT_FUNCTIONING_SCORE',
      name: 'Funcionamiento del gobierno (0-12)',
      unit: 'SCORE',
      column: 'C',
    },
    {
      indicatorCode: 'FH_EXPRESSION_BELIEF_SCORE',
      name: 'Libertad de expresion y de creencia (0-16)',
      unit: 'SCORE',
      column: 'D',
    },
    {
      indicatorCode: 'FH_ASSOCIATION_RIGHTS_SCORE',
      name: 'Derechos de asociacion y organizacion (0-12)',
      unit: 'SCORE',
      column: 'E',
    },
    {
      indicatorCode: 'FH_RULE_OF_LAW_SCORE',
      name: 'Estado de derecho, Freedom House (0-16)',
      unit: 'SCORE',
      column: 'F',
    },
    {
      indicatorCode: 'FH_PERSONAL_AUTONOMY_SCORE',
      name: 'Autonomia personal y derechos individuales (0-16)',
      unit: 'SCORE',
      column: 'G',
    },
  ],
};

/**
 * Freedom in the World, rated. The 1–7 ratings are coarser than the scores
 * but run from the survey's first year, which is the only way to see the
 * country's whole democratic history on one axis. Here 1 is the freest.
 */
export const FREEDOM_HOUSE_RATINGS: WorkbookSource = {
  publisher: FREEDOM_HOUSE,
  sourceUrl:
    'https://freedomhouse.org/sites/default/files/2024-02/Country_and_Territory_Ratings_and_Statuses_FIW_1973-2024.xlsx',
  sheet: 'Country Ratings, Statuses ',
  series: [
    {
      indicatorCode: 'FH_POLITICAL_RIGHTS_RATING',
      name: 'Derechos politicos, calificacion 1-7 (1 es libre)',
      unit: 'SCORE',
      column: 'PR rating',
    },
    {
      indicatorCode: 'FH_CIVIL_LIBERTIES_RATING',
      name: 'Libertades civiles, calificacion 1-7 (1 es libre)',
      unit: 'SCORE',
      column: 'CL rating',
    },
  ],
};

/**
 * Economic Freedom of the World, on a 0–10 scale where 10 is the freest.
 *
 * The summary is the average of five areas, and the areas disagree with each
 * other more than the summary lets on: a country can score nine on sound money
 * and four on its legal system. That disagreement is the reading.
 */
export const FRASER_FREEDOM: WorkbookSource = {
  publisher: FRASER,
  sourceUrl:
    'https://efotw.org/sites/all/modules/custom/ftw_maps_pages/files/efotw-2025-master-index-data-for-researchers-iso.xlsx',
  sheet: 'EFW Panel Dataset',
  series: [
    {
      indicatorCode: 'EFW_SUMMARY_INDEX',
      name: 'Libertad economica en el mundo, indice resumen (0-10)',
      unit: 'INDEX',
      column: 'Summary',
    },
    {
      indicatorCode: 'EFW_SIZE_OF_GOVERNMENT',
      name: 'Tamano del gobierno (0-10)',
      unit: 'INDEX',
      column: 'Area 1',
    },
    {
      indicatorCode: 'EFW_LEGAL_SYSTEM_PROPERTY_RIGHTS',
      name: 'Sistema legal y derechos de propiedad (0-10)',
      unit: 'INDEX',
      column: 'Area 2',
    },
    {
      indicatorCode: 'EFW_SOUND_MONEY',
      name: 'Moneda sana (0-10)',
      unit: 'INDEX',
      column: 'Area 3',
    },
    {
      indicatorCode: 'EFW_FREEDOM_TO_TRADE',
      name: 'Libertad de comercio internacional (0-10)',
      unit: 'INDEX',
      column: 'Area 4',
    },
    { indicatorCode: 'EFW_REGULATION', name: 'Regulacion (0-10)', unit: 'INDEX', column: 'Area 5' },
  ],
};
