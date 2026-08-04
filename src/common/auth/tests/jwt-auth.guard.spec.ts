import type { ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import type { Environment } from '../../../config/environment';
import { ACTOR_ROLES, type Actor } from '../actor';
import {
  HOSTED_COLLECTOR_ORGANIZATION_ID,
  HOSTED_COLLECTOR_SUBJECT,
} from '../hosted-collector.actor';
import { JwtAuthGuard } from '../jwt-auth.guard';

const COLLECTOR_KEY = 'BiHDBaxsivqe4nT1UmWmL4qJgTArzPZAr6iN7WWs';

interface GuardedRequest {
  headers: Record<string, string | undefined>;
  actor?: Actor;
}

const reflector = {
  getAllAndOverride: (): undefined => undefined,
} as unknown as Reflector;

function createContext(request: GuardedRequest): ExecutionContext {
  return {
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

function createGuard(mode: Environment['AUTH_MODE'], key?: string): JwtAuthGuard {
  return new JwtAuthGuard(reflector, {
    AUTH_MODE: mode,
    AGENT_INGESTION_KEY: key,
  } as unknown as Environment);
}

function requestWith(authorization?: string): GuardedRequest {
  return { headers: authorization === undefined ? {} : { authorization } };
}

describe('JwtAuthGuard', () => {
  describe('shared-key collector mode', () => {
    it('admits the collector that presents the configured key', async () => {
      const request = requestWith(`Bearer ${COLLECTOR_KEY}`);

      await expect(
        createGuard('agent_key', COLLECTOR_KEY).canActivate(createContext(request)),
      ).resolves.toBe(true);

      expect(request.actor).toEqual({
        subject: HOSTED_COLLECTOR_SUBJECT,
        roles: [ACTOR_ROLES.INGESTION_AGENT],
        organizationId: HOSTED_COLLECTOR_ORGANIZATION_ID,
      });
    });

    it('rejects a caller that sends no credential at all', async () => {
      await expect(
        createGuard('agent_key', COLLECTOR_KEY).canActivate(createContext(requestWith())),
      ).rejects.toThrow('A valid collector key is required');
    });

    it('rejects a wrong key of the very same length', async () => {
      const forged = `Bearer ${'x'.repeat(COLLECTOR_KEY.length)}`;

      await expect(
        createGuard('agent_key', COLLECTOR_KEY).canActivate(createContext(requestWith(forged))),
      ).rejects.toThrow('A valid collector key is required');
    });

    it('rejects a key sent outside the bearer scheme', async () => {
      await expect(
        createGuard('agent_key', COLLECTOR_KEY).canActivate(
          createContext(requestWith(COLLECTOR_KEY)),
        ),
      ).rejects.toThrow('A valid collector key is required');
    });

    it('refuses every caller when no key is configured', async () => {
      const request = requestWith(`Bearer ${COLLECTOR_KEY}`);

      await expect(createGuard('agent_key').canActivate(createContext(request))).rejects.toThrow(
        'A valid collector key is required',
      );
    });
  });

  it('still impersonates every role only in the local development mode', async () => {
    const request = requestWith();

    await createGuard('disabled').canActivate(createContext(request));

    expect(request.actor?.roles).toEqual(Object.values(ACTOR_ROLES));
  });

  it('rejects an anonymous caller when a real identity provider is configured', async () => {
    await expect(createGuard('jwks').canActivate(createContext(requestWith()))).rejects.toThrow(
      'A valid bearer token is required',
    );
  });
});
