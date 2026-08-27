import type { Requested } from './worldbank-series';

/**
 * The social and institutional series the observatory asks the compiler for.
 *
 * Kept apart from the financial manifest because they answer a different
 * question and because one of them is not served the same way: the Worldwide
 * Governance Indicators live in their own collection at the compiler, under
 * their own identifiers and reachable only by naming that source, so the entry
 * carries the source alongside the code rather than pretending the address is
 * uniform.
 *
 * The governance block is the closest thing to «libertad económica» that can
 * actually be collected. It is not the Heritage or Fraser index — those sit
 * behind bot protection and a licence — but it measures the things those
 * indices are read for: whether contracts are enforced, whether regulation is
 * predictable, whether public office is bought. Which of the two a report
 * should cite is a judgement; that the observatory can only hold one of them is
 * a fact, and it is stated rather than papered over with a substitute.
 */

/** The compiler's collection id for the Worldwide Governance Indicators. */
const GOVERNANCE_SOURCE = 3;

const social: readonly Requested[] = [
  {
    indicatorCode: 'INFANT_MORTALITY_PER_1000',
    worldBankCode: 'SP.DYN.IMRT.IN',
    name: 'Mortalidad infantil por mil nacidos vivos',
    unit: 'RATE_PER_1000',
  },
  {
    indicatorCode: 'UNDER_FIVE_MORTALITY_PER_1000',
    worldBankCode: 'SH.DYN.MORT',
    name: 'Mortalidad de menores de cinco anios por mil nacidos vivos',
    unit: 'RATE_PER_1000',
  },
  {
    indicatorCode: 'MATERNAL_MORTALITY_PER_100K',
    worldBankCode: 'SH.STA.MMRT',
    name: 'Razon de mortalidad materna por cien mil nacidos vivos',
    unit: 'RATE_PER_100K',
  },
  {
    indicatorCode: 'ADULT_LITERACY_PCT',
    worldBankCode: 'SE.ADT.LITR.ZS',
    name: 'Tasa de alfabetizacion adulta',
    unit: 'PERCENT',
  },
  {
    indicatorCode: 'PRIMARY_ENROLMENT_PCT',
    worldBankCode: 'SE.PRM.ENRR',
    name: 'Matriculacion primaria bruta',
    unit: 'PERCENT',
  },
  {
    indicatorCode: 'SECONDARY_ENROLMENT_PCT',
    worldBankCode: 'SE.SEC.ENRR',
    name: 'Matriculacion secundaria bruta',
    unit: 'PERCENT',
  },
  {
    indicatorCode: 'BASIC_WATER_ACCESS_PCT',
    worldBankCode: 'SH.H2O.BASW.ZS',
    name: 'Acceso a agua potable basica',
    unit: 'PERCENT',
  },
  {
    indicatorCode: 'BASIC_SANITATION_ACCESS_PCT',
    worldBankCode: 'SH.STA.BASS.ZS',
    name: 'Acceso a saneamiento basico',
    unit: 'PERCENT',
  },
  {
    indicatorCode: 'ELECTRICITY_ACCESS_PCT',
    worldBankCode: 'EG.ELC.ACCS.ZS',
    name: 'Acceso a electricidad',
    unit: 'PERCENT',
  },
  {
    indicatorCode: 'POVERTY_GAP_PCT',
    worldBankCode: 'SI.POV.GAPS',
    name: 'Brecha de pobreza',
    unit: 'PERCENT',
  },
  {
    indicatorCode: 'INCOME_SHARE_LOWEST_20_PCT',
    worldBankCode: 'SI.DST.FRST.20',
    name: 'Participacion en el ingreso del quintil mas pobre',
    unit: 'PERCENT',
  },
  {
    indicatorCode: 'INCOME_SHARE_HIGHEST_10_PCT',
    worldBankCode: 'SI.DST.10TH.10',
    name: 'Participacion en el ingreso del decil mas rico',
    unit: 'PERCENT',
  },
  {
    indicatorCode: 'INTENTIONAL_HOMICIDES_PER_100K',
    worldBankCode: 'VC.IHR.PSRC.P5',
    name: 'Homicidios intencionales por cien mil habitantes',
    unit: 'RATE_PER_100K',
  },
  {
    indicatorCode: 'VULNERABLE_EMPLOYMENT_PCT',
    worldBankCode: 'SL.EMP.VULN.ZS',
    name: 'Empleo vulnerable sobre el empleo total',
    unit: 'PERCENT',
  },
  {
    indicatorCode: 'YOUTH_NEET_PCT',
    worldBankCode: 'SL.UEM.NEET.ZS',
    name: 'Jovenes que no estudian ni trabajan',
    unit: 'PERCENT',
  },
  {
    indicatorCode: 'INTERNET_USERS_PCT',
    worldBankCode: 'IT.NET.USER.ZS',
    name: 'Personas que usan internet',
    unit: 'PERCENT',
  },
  {
    indicatorCode: 'FERTILITY_RATE_BIRTHS',
    worldBankCode: 'SP.DYN.TFRT.IN',
    name: 'Tasa de fecundidad, nacimientos por mujer',
    unit: 'INDEX',
  },
  {
    indicatorCode: 'CHILD_STUNTING_PCT',
    worldBankCode: 'SH.STA.STNT.ZS',
    name: 'Desnutricion cronica en menores de cinco anios',
    unit: 'PERCENT',
  },
];

/**
 * Governance estimates run from about −2.5 to +2.5, centred on the world mean.
 *
 * They are scores, not percentages: a reader who sees −1.27 must not be able to
 * mistake it for «menos uno coma veintisiete por ciento», so the unit says
 * `SCORE` and the chart axis has to be told what it is looking at.
 */
const governance: readonly Requested[] = [
  {
    indicatorCode: 'RULE_OF_LAW_SCORE',
    worldBankCode: 'GOV_WGI_RL.EST',
    name: 'Estado de derecho',
    unit: 'SCORE',
    source: GOVERNANCE_SOURCE,
  },
  {
    indicatorCode: 'REGULATORY_QUALITY_SCORE',
    worldBankCode: 'GOV_WGI_RQ.EST',
    name: 'Calidad regulatoria',
    unit: 'SCORE',
    source: GOVERNANCE_SOURCE,
  },
  {
    indicatorCode: 'CONTROL_OF_CORRUPTION_SCORE',
    worldBankCode: 'GOV_WGI_CC.EST',
    name: 'Control de la corrupcion',
    unit: 'SCORE',
    source: GOVERNANCE_SOURCE,
  },
  {
    indicatorCode: 'GOVERNMENT_EFFECTIVENESS_SCORE',
    worldBankCode: 'GOV_WGI_GE.EST',
    name: 'Efectividad gubernamental',
    unit: 'SCORE',
    source: GOVERNANCE_SOURCE,
  },
  {
    indicatorCode: 'POLITICAL_STABILITY_SCORE',
    worldBankCode: 'GOV_WGI_PV.EST',
    name: 'Estabilidad politica y ausencia de violencia',
    unit: 'SCORE',
    source: GOVERNANCE_SOURCE,
  },
  {
    indicatorCode: 'VOICE_AND_ACCOUNTABILITY_SCORE',
    worldBankCode: 'GOV_WGI_VA.EST',
    name: 'Voz y rendicion de cuentas',
    unit: 'SCORE',
    source: GOVERNANCE_SOURCE,
  },
  {
    indicatorCode: 'CPIA_PUBLIC_SECTOR_SCORE',
    worldBankCode: 'IQ.CPA.PUBS.XQ',
    name: 'Gestion del sector publico e instituciones',
    unit: 'SCORE',
  },
];

export const SOCIAL_MANIFEST: ReadonlyArray<{
  readonly file: string;
  readonly series: readonly Requested[];
}> = [
  { file: 'macro-annual-social.json', series: social },
  { file: 'macro-annual-governance.json', series: governance },
];
