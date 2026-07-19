import { createParamDecorator, SetMetadata, type ExecutionContext } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import type { Actor, ActorRole } from './actor';

export const PUBLIC_ROUTE = 'public-route';
export const REQUIRED_ROLES = 'required-roles';

export const Public = () => SetMetadata(PUBLIC_ROUTE, true);
export const Roles = (...roles: ActorRole[]) => SetMetadata(REQUIRED_ROLES, roles);

export const CurrentActor = createParamDecorator(
  (_data: unknown, context: ExecutionContext): Actor => {
    const request = context.switchToHttp().getRequest<FastifyRequest & { actor: Actor }>();
    return request.actor;
  },
);
