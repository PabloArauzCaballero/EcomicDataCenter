/**
 * The annual series this observatory asks the multilateral compiler for.
 *
 * Kept apart from the collector because it is the part that gets argued over:
 * adding a series is a decision about what the observatory answers, while
 * fetching one is machinery that never changes. Split by the question each file
 * answers rather than by the compiler's own family codes — a reader asking what
 * credit costs and a reader asking whether the banks are solvent are not the
 * same reader, and the loader reconciles one file at a time.
 */

export type Unit =
  | 'PERCENT'
  | 'PERCENT_OF_GDP'
  | 'USD'
  | 'INDEX'
  | 'MONTHS'
  | 'PEOPLE'
  | 'YEARS'
  | 'RATE_PER_1000'
  | 'RATE_PER_100K'
  | 'SCORE';

export interface Requested {
  readonly indicatorCode: string;
  readonly worldBankCode: string;
  readonly name: string;
  readonly unit: Unit;
  /**
   * Collection the series belongs to at the compiler, when it is not the
   * default one. Governance, for instance, is a separate collection with its
   * own identifiers and is unreachable without naming it.
   */
  readonly source?: number;
}

/** One entry per seed file the collector writes. */
export const MANIFEST: ReadonlyArray<{
  readonly file: string;
  readonly series: readonly Requested[];
}> = [
  {
    file: 'macro-annual-rates.json',
    series: [
      {
        indicatorCode: 'RISK_PREMIUM_ON_LENDING_PCT',
        worldBankCode: 'FR.INR.RISK',
        name: 'Prima de riesgo sobre creditos',
        unit: 'PERCENT',
      },
      {
        indicatorCode: 'BANK_LENDING_DEPOSIT_SPREAD_PCT',
        worldBankCode: 'GFDD.EI.02',
        name: 'Diferencial bancario entre tasa activa y pasiva',
        unit: 'PERCENT',
      },
      {
        indicatorCode: 'BANK_NET_INTEREST_MARGIN_PCT',
        worldBankCode: 'GFDD.EI.01',
        name: 'Margen financiero neto de la banca',
        unit: 'PERCENT',
      },
      {
        indicatorCode: 'CREDIT_TO_GOVERNMENT_PCT_GDP',
        worldBankCode: 'GFDD.EI.08',
        name: 'Credito al gobierno y empresas publicas',
        unit: 'PERCENT_OF_GDP',
      },
    ],
  },
  {
    file: 'macro-annual-financial.json',
    series: [
      {
        indicatorCode: 'BANK_REGULATORY_CAPITAL_PCT_RWA',
        worldBankCode: 'GFDD.SI.05',
        name: 'Capital regulatorio sobre activos ponderados por riesgo',
        unit: 'PERCENT',
      },
      {
        indicatorCode: 'PROVISIONS_TO_NONPERFORMING_LOANS_PCT',
        worldBankCode: 'GFDD.SI.07',
        name: 'Cobertura de previsiones sobre cartera en mora',
        unit: 'PERCENT',
      },
      {
        indicatorCode: 'BANK_NONPERFORMING_LOANS_GFDD_PCT',
        worldBankCode: 'GFDD.SI.02',
        name: 'Cartera en mora sobre cartera bruta',
        unit: 'PERCENT',
      },
      {
        indicatorCode: 'BANK_CAPITAL_TO_TOTAL_ASSETS_PCT',
        worldBankCode: 'GFDD.SI.03',
        name: 'Capital bancario sobre activos totales',
        unit: 'PERCENT',
      },
      {
        indicatorCode: 'BANK_Z_SCORE',
        worldBankCode: 'GFDD.SI.01',
        name: 'Z-score bancario',
        unit: 'INDEX',
      },
      {
        indicatorCode: 'BANK_CREDIT_TO_DEPOSITS_PCT',
        worldBankCode: 'GFDD.SI.04',
        name: 'Credito bancario sobre depositos',
        unit: 'PERCENT',
      },
      {
        indicatorCode: 'LIQUID_ASSETS_TO_DEPOSITS_PCT',
        worldBankCode: 'GFDD.SI.06',
        name: 'Activos liquidos sobre depositos y fondeo de corto plazo',
        unit: 'PERCENT',
      },
      {
        indicatorCode: 'BANK_RETURN_ON_ASSETS_PCT',
        worldBankCode: 'GFDD.EI.05',
        name: 'Rentabilidad bancaria sobre activos',
        unit: 'PERCENT',
      },
      {
        indicatorCode: 'BANK_RETURN_ON_EQUITY_PCT',
        worldBankCode: 'GFDD.EI.10',
        name: 'Rentabilidad bancaria sobre patrimonio',
        unit: 'PERCENT',
      },
      {
        indicatorCode: 'BANK_COST_TO_INCOME_PCT',
        worldBankCode: 'GFDD.EI.07',
        name: 'Costos sobre ingresos de la banca',
        unit: 'PERCENT',
      },
      {
        indicatorCode: 'BANK_CONCENTRATION_PCT',
        worldBankCode: 'GFDD.OI.01',
        name: 'Concentracion bancaria',
        unit: 'PERCENT',
      },
      {
        indicatorCode: 'BANK_DEPOSITS_PCT_GDP',
        worldBankCode: 'GFDD.OI.02',
        name: 'Depositos bancarios sobre el PIB',
        unit: 'PERCENT_OF_GDP',
      },
      {
        indicatorCode: 'DEPOSIT_MONEY_BANK_ASSETS_PCT_GDP',
        worldBankCode: 'GFDD.DI.02',
        name: 'Activos de la banca de deposito sobre el PIB',
        unit: 'PERCENT_OF_GDP',
      },
      {
        indicatorCode: 'LIQUID_LIABILITIES_PCT_GDP',
        worldBankCode: 'GFDD.DI.05',
        name: 'Pasivos liquidos sobre el PIB',
        unit: 'PERCENT_OF_GDP',
      },
      {
        indicatorCode: 'CENTRAL_BANK_ASSETS_PCT_GDP',
        worldBankCode: 'GFDD.DI.06',
        name: 'Activos del banco central sobre el PIB',
        unit: 'PERCENT_OF_GDP',
      },
      {
        indicatorCode: 'FINANCIAL_SYSTEM_DEPOSITS_PCT_GDP',
        worldBankCode: 'GFDD.DI.08',
        name: 'Depositos del sistema financiero sobre el PIB',
        unit: 'PERCENT_OF_GDP',
      },
      {
        indicatorCode: 'PRIVATE_CREDIT_BANKS_AND_OFI_PCT_GDP',
        worldBankCode: 'GFDD.DI.12',
        name: 'Credito privado de bancos y otras entidades financieras',
        unit: 'PERCENT_OF_GDP',
      },
      {
        indicatorCode: 'NONBANK_FINANCIAL_ASSETS_PCT_GDP',
        worldBankCode: 'GFDD.DI.03',
        name: 'Activos de entidades financieras no bancarias sobre el PIB',
        unit: 'PERCENT_OF_GDP',
      },
      {
        indicatorCode: 'PRIVATE_CREDIT_BY_BANKS_PCT_GDP',
        worldBankCode: 'FD.AST.PRVT.GD.ZS',
        name: 'Credito bancario al sector privado',
        unit: 'PERCENT_OF_GDP',
      },
      {
        indicatorCode: 'DOMESTIC_CREDIT_FINANCIAL_SECTOR_PCT_GDP',
        worldBankCode: 'FS.AST.DOMS.GD.ZS',
        name: 'Credito interno provisto por el sector financiero',
        unit: 'PERCENT_OF_GDP',
      },
      {
        indicatorCode: 'COMMERCIAL_BANK_BRANCHES_PER_100K',
        worldBankCode: 'FB.CBK.BRCH.P5',
        name: 'Sucursales de banca comercial por cada cien mil adultos',
        unit: 'INDEX',
      },
      {
        indicatorCode: 'ATMS_PER_100K_ADULTS',
        worldBankCode: 'FB.ATM.TOTL.P5',
        name: 'Cajeros automaticos por cada cien mil adultos',
        unit: 'INDEX',
      },
    ],
  },
];
