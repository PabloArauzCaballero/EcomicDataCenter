import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  agentBootstrapSeedSchema,
  geographicUnitSeedSchema,
  statisticalDomainSeedSchema,
} from '../schemas/seed.schemas';
import { AGENT_BOOTSTRAP_IDS } from '../seed-identifiers';

const BOOT_DIRECTORY = join(__dirname, '..', 'boot');

function readCatalog(filename: string): unknown {
  return JSON.parse(readFileSync(join(BOOT_DIRECTORY, filename), 'utf-8'));
}

describe('boot/geographic-units.json', () => {
  const units = geographicUnitSeedSchema.parse(readCatalog('geographic-units.json'));

  it('declares Bolivia and its nine departments', () => {
    expect(units.filter((unit) => unit.geographicLevel === 'COUNTRY')).toHaveLength(1);
    expect(units.filter((unit) => unit.geographicLevel === 'DEPARTMENT')).toHaveLength(9);
  });

  it('roots every department in the country', () => {
    const country = units.find((unit) => unit.geographicLevel === 'COUNTRY');
    const departments = units.filter((unit) => unit.geographicLevel === 'DEPARTMENT');
    expect(country).toBeDefined();
    for (const department of departments) {
      expect(department.parentGeographicUnitId).toBe(country?.geographicUnitId);
    }
  });

  it('uses unique identifiers and official codes', () => {
    expect(new Set(units.map((unit) => unit.geographicUnitId)).size).toBe(units.length);
    expect(new Set(units.map((unit) => unit.officialCode)).size).toBe(units.length);
  });

  it('lists every parent before its children so ordered upserts satisfy the foreign key', () => {
    const seen = new Set<string>();
    for (const unit of units) {
      if (unit.parentGeographicUnitId) expect(seen.has(unit.parentGeographicUnitId)).toBe(true);
      seen.add(unit.geographicUnitId);
    }
  });
});

describe('boot/statistical-domains.json', () => {
  const domains = statisticalDomainSeedSchema.parse(readCatalog('statistical-domains.json'));

  it('uses unique identifiers, codes and sort order', () => {
    expect(new Set(domains.map((domain) => domain.statisticalDomainId)).size).toBe(domains.length);
    expect(new Set(domains.map((domain) => domain.code)).size).toBe(domains.length);
    expect(new Set(domains.map((domain) => domain.sortOrder)).size).toBe(domains.length);
  });

  it('resolves every parent reference inside the catalog', () => {
    const identifiers = new Set(domains.map((domain) => domain.statisticalDomainId));
    for (const domain of domains) {
      if (domain.parentDomainId) expect(identifiers.has(domain.parentDomainId)).toBe(true);
    }
  });

  it('lists every parent before its children so ordered upserts satisfy the foreign key', () => {
    const seen = new Set<string>();
    for (const domain of domains) {
      if (domain.parentDomainId) expect(seen.has(domain.parentDomainId)).toBe(true);
      seen.add(domain.statisticalDomainId);
    }
  });

  it('covers the domains the institutional brief requires agents to report on', () => {
    const codes = new Set(domains.map((domain) => domain.code));
    for (const required of [
      'EXCHANGE_RATE',
      'SOVEREIGN_DEBT',
      'SECURITIES_MARKET',
      'BANKING',
      'HYDROCARBONS',
      'MINING',
      'AGRICULTURE',
      'POVERTY',
      'CONFIDENCE',
      'UNCERTAINTY',
      'COUNTRY_RISK',
      'REGULATION',
    ]) {
      expect(codes.has(required)).toBe(true);
    }
  });

  it('keeps every seeded domain active', () => {
    expect(domains.every((domain) => domain.isActive)).toBe(true);
  });
});

describe('boot/agent-bootstrap.json', () => {
  const bootstrap = agentBootstrapSeedSchema.parse(readCatalog('agent-bootstrap.json'));

  it('declares the identities the runtime resolves by their stable identifier', () => {
    expect(bootstrap.organization.organizationId).toBe(AGENT_BOOTSTRAP_IDS.organization);
    expect(bootstrap.source.sourceId).toBe(AGENT_BOOTSTRAP_IDS.source);
    expect(bootstrap.agent.aiAgentId).toBe(AGENT_BOOTSTRAP_IDS.agent);
  });

  it('registers the collector the daily-analysis contract names', () => {
    expect(bootstrap.agent.code).toBe('CHATGPT_DAILY_MACRO');
  });

  it('keeps the observatory out of the official statistics producers', () => {
    expect(bootstrap.organization.officialStatisticsProducer).toBe(false);
  });
});
