import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ACTOR_ROLES } from '../actor';
import {
  createHostedCollectorActor,
  HOSTED_COLLECTOR_ORGANIZATION_ID,
} from '../hosted-collector.actor';

const BOOTSTRAP_CATALOG = join(
  __dirname,
  '..',
  '..',
  '..',
  'database',
  'seeds',
  'boot',
  'agent-bootstrap.json',
);

describe('hosted collector actor', () => {
  it('grants the collector role and nothing else', () => {
    expect(createHostedCollectorActor().roles).toEqual([ACTOR_ROLES.INGESTION_AGENT]);
  });

  it('never grants a role that can approve or publish what it submits', () => {
    const { roles } = createHostedCollectorActor();
    expect(roles).not.toContain(ACTOR_ROLES.DATA_REVIEWER);
    expect(roles).not.toContain(ACTOR_ROLES.METHODOLOGY_STEWARD);
    expect(roles).not.toContain(ACTOR_ROLES.DATA_OFFICER);
  });

  it('carries the organization claim its scoped role requires', () => {
    expect(createHostedCollectorActor().organizationId).toBe(HOSTED_COLLECTOR_ORGANIZATION_ID);
  });

  it('writes for the organization the boot catalog seeds', () => {
    const catalog = JSON.parse(readFileSync(BOOTSTRAP_CATALOG, 'utf-8')) as {
      organization: { organizationId: string };
    };
    expect(catalog.organization.organizationId).toBe(HOSTED_COLLECTOR_ORGANIZATION_ID);
  });
});
