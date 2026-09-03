/**
 * The annual series this observatory asks the Fund for.
 *
 * Everything annual the observatory held came from one compiler. That is not a
 * second opinion, it is one opinion repeated: a single house's method, revision
 * calendar and blind spots carried across a hundred and fifty series. The Fund
 * publishes Bolivia under a different method, and where the two disagree the
 * disagreement is itself the information.
 *
 * The selection is deliberately not a mirror of what the observatory already
 * has. It is the block the other compiler does not publish at all — the fiscal
 * accounts. Revenue, spending, the overall and primary balance, gross and net
 * public debt: a reader asking whether the state is living within its means had
 * no series to read before this. The structural balance and the output gap
 * would belong here too and are absent on purpose — the Fund computes neither
 * for Bolivia, and a series it does not publish cannot be requested into
 * existence. Inflation, growth and unemployment are here too, and those *are*
 * duplicates on purpose, because a second measurement of the same year is the
 * only way to see how wide the uncertainty around it really is.
 *
 * Ratios only, no levels. The Fund reports levels in national currency or in
 * billions of dollars with a multiplier the seed schema has no field for, and a
 * figure whose scale depends on a column nobody carried is worse than a missing
 * figure.
 */

/** Unit as the seed schema names it, so a chart never has to guess a scale. */
export type Unit = 'PERCENT' | 'PERCENT_OF_GDP';

export interface Requested {
  readonly indicatorCode: string;
  /** Identifier at the Fund, carried through so the figure stays checkable. */
  readonly weoCode: string;
  readonly name: string;
  readonly unit: Unit;
}

/**
 * Codes are prefixed with the compiler rather than merged into the existing
 * ones.
 *
 * `GDP_GROWTH_ANNUAL_PCT` already means one house's estimate of a year. Writing
 * a second house's estimate under the same code would not add a source, it
 * would overwrite one with the other and leave a reader unable to tell which
 * they were looking at.
 */
export const WEO_MANIFEST: readonly Requested[] = [
  {
    indicatorCode: 'IMF_GOVERNMENT_REVENUE_PCT_GDP',
    weoCode: 'GGR_NGDP',
    name: 'Ingresos del gobierno general segun el FMI',
    unit: 'PERCENT_OF_GDP',
  },
  {
    indicatorCode: 'IMF_GOVERNMENT_EXPENDITURE_PCT_GDP',
    weoCode: 'GGX_NGDP',
    name: 'Gasto del gobierno general segun el FMI',
    unit: 'PERCENT_OF_GDP',
  },
  {
    indicatorCode: 'IMF_FISCAL_BALANCE_PCT_GDP',
    weoCode: 'GGXCNL_NGDP',
    name: 'Resultado fiscal del gobierno general segun el FMI',
    unit: 'PERCENT_OF_GDP',
  },
  {
    indicatorCode: 'IMF_PRIMARY_BALANCE_PCT_GDP',
    weoCode: 'GGXONLB_NGDP',
    name: 'Resultado primario del gobierno general segun el FMI',
    unit: 'PERCENT_OF_GDP',
  },
  {
    indicatorCode: 'IMF_GROSS_PUBLIC_DEBT_PCT_GDP',
    weoCode: 'GGXWDG_NGDP',
    name: 'Deuda bruta del gobierno general segun el FMI',
    unit: 'PERCENT_OF_GDP',
  },
  {
    indicatorCode: 'IMF_NET_PUBLIC_DEBT_PCT_GDP',
    weoCode: 'GGXWDN_NGDP',
    name: 'Deuda neta del gobierno general segun el FMI',
    unit: 'PERCENT_OF_GDP',
  },
  {
    indicatorCode: 'IMF_CURRENT_ACCOUNT_PCT_GDP',
    weoCode: 'BCA_NGDPD',
    name: 'Saldo en cuenta corriente segun el FMI',
    unit: 'PERCENT_OF_GDP',
  },
  {
    indicatorCode: 'IMF_GROSS_NATIONAL_SAVINGS_PCT_GDP',
    weoCode: 'NGSD_NGDP',
    name: 'Ahorro nacional bruto segun el FMI',
    unit: 'PERCENT_OF_GDP',
  },
  {
    indicatorCode: 'IMF_TOTAL_INVESTMENT_PCT_GDP',
    weoCode: 'NID_NGDP',
    name: 'Inversion total segun el FMI',
    unit: 'PERCENT_OF_GDP',
  },
  {
    indicatorCode: 'IMF_GDP_GROWTH_ANNUAL_PCT',
    weoCode: 'NGDP_RPCH',
    name: 'Crecimiento del PIB real segun el FMI',
    unit: 'PERCENT',
  },
  {
    indicatorCode: 'IMF_CPI_INFLATION_AVERAGE_PCT',
    weoCode: 'PCPIPCH',
    name: 'Inflacion promedio del periodo segun el FMI',
    unit: 'PERCENT',
  },
  {
    indicatorCode: 'IMF_CPI_INFLATION_END_OF_PERIOD_PCT',
    weoCode: 'PCPIEPCH',
    name: 'Inflacion a fin de periodo segun el FMI',
    unit: 'PERCENT',
  },
  {
    indicatorCode: 'IMF_UNEMPLOYMENT_PCT',
    weoCode: 'LUR',
    name: 'Tasa de desempleo segun el FMI',
    unit: 'PERCENT',
  },
  {
    indicatorCode: 'IMF_EXPORT_VOLUME_GROWTH_PCT',
    weoCode: 'TX_RPCH',
    name: 'Variacion del volumen exportado de bienes y servicios segun el FMI',
    unit: 'PERCENT',
  },
  {
    indicatorCode: 'IMF_IMPORT_VOLUME_GROWTH_PCT',
    weoCode: 'TM_RPCH',
    name: 'Variacion del volumen importado de bienes y servicios segun el FMI',
    unit: 'PERCENT',
  },
  {
    indicatorCode: 'IMF_WORLD_GDP_SHARE_PPP_PCT',
    weoCode: 'PPPSH',
    name: 'Participacion en el PIB mundial en paridad de poder adquisitivo segun el FMI',
    unit: 'PERCENT',
  },
];
