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

/**
 * The world and its regions, for the board that reads the world rather than
 * Bolivia against a list of neighbours.
 *
 * Aggregates the World Bank computes itself, on the same definitions as every
 * country figure. Income groups are left out on purpose: the register serves
 * them without an ISO3 code, and the seed schema — like every reader of the
 * panel — keys on one.
 */
export const WORLD_AGGREGATES: readonly string[] = [
  'WLD', // World
  'LCN', // Latin America & Caribbean
  'NAC', // North America
  'ECS', // Europe & Central Asia
  'EAS', // East Asia & Pacific
  'SAS', // South Asia
  'MEA', // Middle East, North Africa, Afghanistan & Pakistan
  'SSF', // Sub-Saharan Africa
];

/**
 * The indicators the world board reads, and only those.
 *
 * Twenty-six of the collection's fifteen hundred, each chosen because it has a
 * figure for the world as a whole. Central government debt, external debt and
 * the current account were candidates and have none, and a board that shows
 * Bolivia's figure without the world's is missing the one comparison it exists
 * to make.
 *
 * Aggregates are collected for these alone and never for the whole panel. The
 * panel's source address names its thirty economies, and that address is part
 * of every payload's digest: re-collecting the panel with eight more codes in
 * the URL would hand the loader 1,28 million payloads it has never seen, and it
 * would register every figure a second time.
 */
export const WORLD_BOARD_INDICATORS: readonly string[] = [
  // Growth and size.
  'NY.GDP.MKTP.KD.ZG',
  'NY.GDP.PCAP.KD.ZG',
  'NY.GDP.MKTP.CD',
  'NE.GDI.TOTL.ZS',
  // Prices and external finance.
  'FP.CPI.TOTL.ZG',
  'FI.RES.TOTL.MO',
  'BX.KLT.DINV.WD.GD.ZS',
  'NY.GNS.ICTR.ZS',
  // Trade.
  'NE.TRD.GNFS.ZS',
  'NE.EXP.GNFS.KD.ZG',
  'TX.VAL.FUEL.ZS.UN',
  // Work and population.
  'SL.UEM.TOTL.ZS',
  'SL.TLF.CACT.ZS',
  'SP.POP.TOTL',
  'SP.POP.GROW',
  'SP.URB.TOTL.IN.ZS',
  // What the economy is made of.
  'NV.AGR.TOTL.ZS',
  'NV.IND.TOTL.ZS',
  'NV.SRV.TOTL.ZS',
  // How people live.
  'SI.POV.DDAY',
  'SP.DYN.LE00.IN',
  'SE.XPD.TOTL.GD.ZS',
  'SH.XPD.CHEX.GD.ZS',
  'EG.ELC.ACCS.ZS',
  'IT.NET.USER.ZS',
  'EN.GHG.CO2.PC.CE.AR5',
];
