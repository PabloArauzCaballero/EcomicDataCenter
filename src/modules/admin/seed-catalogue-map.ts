/**
 * Where each managed catalogue lives and how a seed row is identified in it.
 *
 * The difference report needs three things the loaders keep implicit: the table
 * a file reconciles into, the column that identifies a row, and — when the file
 * is an object rather than an array — which of its sections holds the rows.
 * Writing that down here is what lets the portal say «this row was changed by
 * hand» instead of only «the checksum no longer matches».
 *
 * This is deliberately not a second loader. Nothing here writes; it describes
 * what the existing reconcilers already write, and a package with no descriptor
 * is reported as not compared rather than as matching.
 */
export interface ManagedCatalogue {
  /** Label shown in the portal. */
  readonly label: string;
  /** Qualified table the rows land in. */
  readonly table: string;
  /** Column that identifies a row, and the JSON field that carries it. */
  readonly identityColumn: string;
  readonly identityField: string;
  /** Seed file, relative to `src/database/seeds`. */
  readonly file: string;
  /**
   * Path inside the file to the rows, when the file is not a bare array.
   *
   * A single object section is treated as a one-row array.
   */
  readonly section?: string;
  /** Fields the seed manages. Anything else on the row is left to the database. */
  readonly managedFields: readonly string[];
}

const ORGANIZATION_FIELDS = [
  'code',
  'legalName',
  'shortName',
  'organizationType',
  'countryCode',
] as const;

const AI_AGENT_FIELDS = [
  'code',
  'name',
  'agentType',
  'provider',
  'modelIdentifier',
  'specialty',
] as const;

export const MANAGED_CATALOGUES: Readonly<Record<string, readonly ManagedCatalogue[]>> = {
  'core-catalogues': [
    {
      label: 'Frecuencias',
      table: 'semantic.frequency',
      identityColumn: 'frequency_id',
      identityField: 'frequencyId',
      file: 'boot/frequencies.json',
      managedFields: ['code', 'name', 'periodsPerYear', 'isoDuration'],
    },
    {
      label: 'Dimensiones de calidad',
      table: 'quality_lineage.quality_dimension',
      identityColumn: 'quality_dimension_id',
      identityField: 'qualityDimensionId',
      file: 'boot/quality-dimensions.json',
      managedFields: ['code', 'name', 'description'],
    },
    {
      label: 'Unidades de medida',
      table: 'semantic.unit_measure',
      identityColumn: 'unit_measure_id',
      identityField: 'unitMeasureId',
      file: 'boot/units.json',
      managedFields: ['code', 'name', 'symbol', 'multiplierPower10', 'valueKind'],
    },
    {
      label: 'Monedas',
      table: 'semantic.unit_measure',
      identityColumn: 'unit_measure_id',
      identityField: 'unitMeasureId',
      file: 'boot/currencies.json',
      managedFields: ['code', 'name', 'symbol', 'multiplierPower10', 'valueKind'],
    },
    {
      label: 'Territorio de Bolivia',
      table: 'semantic.geographic_unit',
      identityColumn: 'geographic_unit_id',
      identityField: 'geographicUnitId',
      file: 'boot/geographic-units.json',
      managedFields: ['officialCode', 'name', 'geographicLevel', 'validFrom'],
    },
    {
      label: 'Países socios',
      table: 'semantic.geographic_unit',
      identityColumn: 'geographic_unit_id',
      identityField: 'geographicUnitId',
      file: 'boot/countries.json',
      managedFields: ['officialCode', 'name', 'geographicLevel', 'validFrom'],
    },
    {
      label: 'Dominios estadísticos',
      table: 'semantic.statistical_domain',
      identityColumn: 'statistical_domain_id',
      identityField: 'statisticalDomainId',
      file: 'boot/statistical-domains.json',
      managedFields: ['code', 'name', 'description', 'sortOrder', 'isActive'],
    },
    {
      label: 'Instituciones oficiales',
      table: 'provenance.organization',
      identityColumn: 'organization_id',
      identityField: 'organizationId',
      file: 'boot/economic-activities.json',
      section: 'organizations',
      managedFields: [...ORGANIZATION_FIELDS],
    },
    {
      label: 'Clasificación CAEB',
      table: 'semantic.classification',
      identityColumn: 'classification_id',
      identityField: 'classificationId',
      file: 'boot/economic-activities.json',
      section: 'classification',
      managedFields: ['code', 'name', 'classificationType'],
    },
    {
      label: 'Versión de la CAEB',
      table: 'semantic.classification_version',
      identityColumn: 'classification_version_id',
      identityField: 'classificationVersionId',
      file: 'boot/economic-activities.json',
      section: 'version',
      managedFields: ['versionCode', 'name', 'validFrom'],
    },
    {
      label: 'Secciones de la CAEB',
      table: 'semantic.classification_item',
      identityColumn: 'classification_item_id',
      identityField: 'classificationItemId',
      file: 'boot/economic-activities.json',
      section: 'items',
      managedFields: ['code', 'name'],
    },
  ],
  'collector-identities': [
    {
      label: 'Organización del observatorio',
      table: 'provenance.organization',
      identityColumn: 'organization_id',
      identityField: 'organizationId',
      file: 'boot/agent-bootstrap.json',
      section: 'organization',
      managedFields: [...ORGANIZATION_FIELDS],
    },
    {
      label: 'Fuente de recolección por agentes',
      table: 'provenance.source',
      identityColumn: 'source_id',
      identityField: 'sourceId',
      file: 'boot/agent-bootstrap.json',
      section: 'source',
      managedFields: ['code', 'name', 'sourceType', 'accessMethod', 'isActive'],
    },
    {
      label: 'Agente de recolección diaria',
      table: 'intelligence.ai_agent',
      identityColumn: 'ai_agent_id',
      identityField: 'aiAgentId',
      file: 'boot/agent-bootstrap.json',
      section: 'agent',
      managedFields: [...AI_AGENT_FIELDS],
    },
    {
      label: 'Agentes de carga histórica',
      table: 'intelligence.ai_agent',
      identityColumn: 'ai_agent_id',
      identityField: 'aiAgentId',
      file: 'boot/agent-bootstrap.json',
      section: 'backfillAgents',
      managedFields: [...AI_AGENT_FIELDS],
    },
  ],
  'source-schedules': [
    {
      label: 'Calendarios de fuentes',
      table: 'operations.source_expectation',
      identityColumn: 'source_expectation_id',
      identityField: 'sourceExpectationId',
      file: 'boot/source-schedules.json',
      managedFields: ['cadence', 'expectedIntervalHours', 'toleranceHours', 'timeZone', 'isActive'],
    },
  ],
};

/**
 * The stored copies each package can have changed, and nothing else.
 *
 * A reconciliation has to rebuild what it made stale, and rebuilding what it
 * did not is not free: the four expensive copies take minutes over the whole
 * corpus, and several of those at once is what put the server at load 95 on
 * 2026-09-09. A package that is absent from this map rebuilds only copies that
 * have never been built at all — which still repairs the state a migration
 * leaves behind, without paying for a rebuild nobody needed.
 *
 * This lives here and not in the manifest because it is an operational fact
 * about this deployment's read models, not a property of the files a package
 * carries.
 */
export const PACKAGE_SNAPSHOTS: Readonly<Record<string, readonly string[]>> = {
  'press-coverage': ['press_article_snapshot', 'press_term_mention_snapshot'],
  'press-archive': ['press_article_snapshot', 'press_term_mention_snapshot'],
  'social-readings': ['social_reading_snapshot'],
  'company-filings': ['company_filing_snapshot'],
  'company-filings-archive': ['company_filing_snapshot'],
  'company-filing-texts': ['company_filing_snapshot'],
  'macro-annual-history': ['macro_indicator_annual_snapshot', 'indicator_source_note_snapshot'],
  'composite-indices': ['macro_indicator_annual_snapshot', 'indicator_source_note_snapshot'],
  'worldbank-panel': ['world_panel_catalogue_snapshot'],
  'bolivia-national-poi': ['national_place'],
};

/** Converts a seed field name into the column the models map it to. */
export function toColumn(field: string): string {
  return field.replace(/([a-z0-9])([A-Z])/gu, '$1_$2').toLowerCase();
}
