import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { FastifyRequest } from 'fastify';
import type { Actor, ActorRole } from './actor';
import { REQUIRED_ROLES } from './auth.decorators';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<ActorRole[]>(REQUIRED_ROLES, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required?.length) return true;
    const request = context.switchToHttp().getRequest<FastifyRequest & { actor?: Actor }>();
    if (!request.actor || !required.some((role) => request.actor?.roles.includes(role))) {
      throw new ForbiddenException('The authenticated actor lacks the required role');
    }
    return true;
  }
}
