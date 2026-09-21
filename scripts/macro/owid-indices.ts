/**
 * The composite indices the observatory takes from Our World in Data.
 *
 * Kept apart from the collector so that adding a rating is adding an entry,
 * not editing a procedure. Every entry names the institution that builds the
 * index, because the redistributor is not its author, and the heading of the
 * column the value is read from, because the redistributor adds and removes
 * columns between releases and a figure read by position would be a real
 * number and the wrong measurement.
 */

export interface RequestedIndex {
  readonly indicatorCode: string;
  /** Slug of the redistributed dataset, which is also its citable address. */
  readonly slug: string;
  readonly name: string;
  /** Institution that constructs the index, not the one that redistributes it. */
  readonly publisher: string;
  readonly unit: 'INDEX' | 'SCORE';
  /** Heading of the value column, so the wrong column can never be read. */
  readonly column: string;
}

const VDEM = 'V-DEM INSTITUTE';

/**
 * The democracy indices, one per question the composite hides.
 *
 * The liberal democracy index is the headline, and on its own it says only
 * "less than before". What a reader asks next is *which part* — the vote, the
 * press, the courts, the assembly — and V-Dem publishes each as its own index
 * on the same 0–1 scale, so they can be read side by side. The rule of law and
 * human rights indices were already here; these are the rest of the family.
 */
const democracy: readonly RequestedIndex[] = [
  {
    indicatorCode: 'VDEM_LIBERAL_DEMOCRACY_INDEX',
    slug: 'liberal-democracy-index',
    name: 'Indice de democracia liberal',
    publisher: VDEM,
    unit: 'INDEX',
    column: 'Liberal democracy index',
  },
  {
    indicatorCode: 'VDEM_ELECTORAL_DEMOCRACY_INDEX',
    slug: 'electoral-democracy-index',
    name: 'Indice de democracia electoral',
    publisher: VDEM,
    unit: 'INDEX',
    column: 'Electoral democracy index',
  },
  {
    indicatorCode: 'VDEM_FREEDOM_OF_EXPRESSION_INDEX',
    slug: 'freedom-of-expression-index',
    name: 'Indice de libertad de expresion',
    publisher: VDEM,
    unit: 'INDEX',
    column: 'Freedom of expression index',
  },
  {
    indicatorCode: 'VDEM_FREEDOM_OF_ASSOCIATION_INDEX',
    slug: 'freedom-of-association-index',
    name: 'Indice de libertad de asociacion',
    publisher: VDEM,
    unit: 'INDEX',
    column: 'Freedom of Association Index',
  },
  {
    indicatorCode: 'VDEM_JUDICIAL_CONSTRAINTS_INDEX',
    slug: 'judicial-constraints-on-the-executive-index',
    name: 'Indice de control judicial del Ejecutivo',
    publisher: VDEM,
    unit: 'INDEX',
    column: 'Judicial Checks on Government Index',
  },
  {
    indicatorCode: 'VDEM_LEGISLATIVE_CONSTRAINTS_INDEX',
    slug: 'legislative-constraints-on-the-executive-index',
    name: 'Indice de control legislativo del Ejecutivo',
    publisher: VDEM,
    unit: 'INDEX',
    column: 'Legislative constraints on the executive index',
  },
  {
    indicatorCode: 'VDEM_POLITICAL_CORRUPTION_INDEX',
    slug: 'political-corruption-index',
    name: 'Indice de corrupcion politica',
    publisher: VDEM,
    unit: 'INDEX',
    column: 'Political Corruption Index',
  },
];

export const REQUESTED_INDICES: readonly RequestedIndex[] = [
  {
    indicatorCode: 'HUMAN_DEVELOPMENT_INDEX',
    slug: 'human-development-index',
    name: 'Indice de Desarrollo Humano',
    publisher: 'PROGRAMA DE LAS NACIONES UNIDAS PARA EL DESARROLLO',
    unit: 'INDEX',
    column: 'Human Development Index',
  },
  {
    indicatorCode: 'CORRUPTION_PERCEPTIONS_INDEX',
    slug: 'corruption-perception-index',
    name: 'Indice de Percepcion de la Corrupcion',
    publisher: 'TRANSPARENCY INTERNATIONAL',
    unit: 'INDEX',
    column: 'Corruption Perceptions Index',
  },
  {
    indicatorCode: 'VDEM_RULE_OF_LAW_INDEX',
    slug: 'rule-of-law-index',
    name: 'Indice de estado de derecho',
    publisher: VDEM,
    unit: 'INDEX',
    column: 'Rule of Law index',
  },
  {
    indicatorCode: 'VDEM_HUMAN_RIGHTS_INDEX',
    slug: 'human-rights-index-vdem',
    name: 'Indice de derechos humanos',
    publisher: VDEM,
    unit: 'INDEX',
    column: 'Human Rights Index',
  },
  {
    indicatorCode: 'POLITICAL_REGIME_CLASSIFICATION',
    slug: 'political-regime',
    name: 'Clasificacion del regimen politico',
    publisher: VDEM,
    unit: 'SCORE',
    column: 'Political regime',
  },
  {
    indicatorCode: 'STATE_CAPACITY_INDEX',
    slug: 'state-capacity-index',
    name: 'Indice de capacidad estatal',
    publisher: 'HANSON Y SIGMAN',
    unit: 'SCORE',
    column: 'State Capacity Index',
  },
  ...democracy,
];
