/**
 * The countries Bolivia is read against, and how the panel is cut up on disk.
 *
 * An observatory of one country still has to answer «compared with what». Every
 * figure the World Bank publishes for Bolivia is published on the same
 * definition for its neighbours, its trading partners and the region as a
 * whole, and a Bolivian ratio that looks alarming is often the regional norm —
 * or the reverse, which matters more.
 *
 * Thirty economies in three rings: South America, which is the comparison a
 * Bolivian reader makes first; Central America and the Caribbean, which share
 * the region's structure without sharing its geography; and the large partners
 * whose demand sets the price of what Bolivia sells.
 */
export const PANEL_COUNTRIES: readonly string[] = [
  // South America.
  'BOL',
  'PER',
  'CHL',
  'ARG',
  'BRA',
  'PRY',
  'URY',
  'COL',
  'ECU',
  'VEN',
  'GUY',
  'SUR',
  // Central America, Mexico and the Caribbean.
  'MEX',
  'CRI',
  'PAN',
  'GTM',
  'HND',
  'SLV',
  'NIC',
  'DOM',
  'CUB',
  'HTI',
  'JAM',
  'TTO',
  // The partners that buy what the region sells.
  'USA',
  'CHN',
  'ESP',
  'JPN',
  'IND',
  'DEU',
];

/**
 * How many indicators go in one seed file.
 *
 * The panel is a million observations and a single file for it would be a
 * hundred megabytes that no editor opens and no diff explains. Sliced by
 * indicator, each file is a few megabytes, and a corrected indicator rewrites
 * one slice instead of the whole corpus.
 */
export const INDICATORS_PER_FILE = 60;

/** Where the World Bank publishes the catalogue and the observations. */
export const WORLD_BANK_API = 'https://api.worldbank.org/v2';

/** The World Development Indicators, which is the collection this panel is. */
export const WDI_SOURCE = 2;

export const PUBLISHER = 'BANCO MUNDIAL';
export const PUBLISHER_DOMAIN = 'worldbank.org';
export const USER_AGENT = 'Mozilla/5.0 (compatible; ObservatorioEconomicoBO/1.0)';
