import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ACTOR_ROLES, type Actor, type ActorRole } from '../../../common/auth/actor';
import { REQUIRED_ROLES } from '../../../common/auth/auth.decorators';
import { RolesGuard } from '../../../common/auth/roles.guard';
import { AdminAnalyticsController } from '../admin-analytics.controller';
import { AdminIngestionController } from '../admin-ingestion.controller';
import { AdminQualityController } from '../admin-quality.controller';
import { AdminSeedsController } from '../admin-seeds.controller';
import { AdminController } from '../admin.controller';

type Handler = (...args: never[]) => unknown;

const CONTROLLERS = [
  AdminController,
  AdminIngestionController,
  AdminSeedsController,
  AdminQualityController,
  AdminAnalyticsController,
] as const;

function handlers(controller: (typeof CONTROLLERS)[number]): Array<[string, Handler]> {
  const prototype = controller.prototype as unknown as Record<string, unknown>;
  return Object.getOwnPropertyNames(prototype)
    .filter((name) => name !== 'constructor')
    .map((name) => [name, prototype[name] as Handler]);
}

function requiredRoles(handler: Handler): ActorRole[] | undefined {
  return Reflect.getMetadata(REQUIRED_ROLES, handler) as ActorRole[] | undefined;
}

function contextFor(handler: Handler, actor: Actor | undefined) {
  return {
    getHandler: () => handler,
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => ({ actor }) }),
  } as unknown as Parameters<RolesGuard['canActivate']>[0];
}

/**
 * Default-deny, checked handler by handler rather than asserted once.
 *
 * The failure this guards against is not a wrong role on a route somebody
 * thought about; it is a new route that nobody annotated, which the guard lets
 * through because there is nothing to compare against. Enumerating the
 * controllers means a handler added without `@Roles` fails here.
 */
describe('administrative authorization', () => {
  it('every administrative handler declares the roles it requires', () => {
    for (const controller of CONTROLLERS) {
      for (const [name, handler] of handlers(controller)) {
        expect(
          `${controller.name}.${name}: ${requiredRoles(handler)?.join() ?? 'sin roles'}`,
        ).toMatch(/: [A-Z_]/u);
      }
    }
  });

  it('reserves seed reconciliation for the operator role alone', () => {
    const roles = requiredRoles(
      (AdminSeedsController.prototype as unknown as Record<string, Handler>)['reconcile']!,
    );
    expect(roles).toEqual([ACTOR_ROLES.SEED_OPERATOR]);
  });

  it('reserves telemetry intake for the site identity alone', () => {
    const prototype = AdminAnalyticsController.prototype as unknown as Record<string, Handler>;
    expect(requiredRoles(prototype['recordTraffic']!)).toEqual([ACTOR_ROLES.SITE_TELEMETRY]);
    expect(requiredRoles(prototype['recordExport']!)).toEqual([ACTOR_ROLES.SITE_TELEMETRY]);
  });

  it('does not grant a reading role the right to reconcile', () => {
    const prototype = AdminSeedsController.prototype as unknown as Record<string, Handler>;
    const reconcile = requiredRoles(prototype['reconcile']!) ?? [];
    expect(reconcile).not.toContain(ACTOR_ROLES.ANALYST);
    expect(reconcile).not.toContain(ACTOR_ROLES.METHODOLOGY_STEWARD);
    // The operator can of course read the packages they are about to apply;
    // what they must not inherit is anybody else's right to apply them.
    expect(requiredRoles(prototype['listPackages']!)).toContain(ACTOR_ROLES.ANALYST);
  });

  describe('the guard itself', () => {
    const guard = new RolesGuard(new Reflector());
    const reconcile = (AdminSeedsController.prototype as unknown as Record<string, Handler>)[
      'reconcile'
    ]!;

    it('rejects a reader who asks for a reconciliation', () => {
      const reader: Actor = { subject: 'analyst', roles: [ACTOR_ROLES.ANALYST] };
      expect(() => guard.canActivate(contextFor(reconcile, reader))).toThrow(ForbiddenException);
    });

    it('rejects a request with no actor at all', () => {
      expect(() => guard.canActivate(contextFor(reconcile, undefined))).toThrow(ForbiddenException);
    });

    it('admits the operator', () => {
      const operator: Actor = { subject: 'ops', roles: [ACTOR_ROLES.SEED_OPERATOR] };
      expect(guard.canActivate(contextFor(reconcile, operator))).toBe(true);
    });
  });
});
