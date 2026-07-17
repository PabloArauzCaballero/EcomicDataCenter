import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { FastifyRequest } from 'fastify';
import jwt, { type JwtHeader, type SigningKeyCallback } from 'jsonwebtoken';
import jwksClient, { type JwksClient } from 'jwks-rsa';
import type { Environment } from '../../config/environment';
import { ENVIRONMENT } from '../../config/configuration.module';
import { ACTOR_ROLES, type Actor } from './actor';
import { PUBLIC_ROUTE } from './auth.decorators';
import { parseActorClaims } from './token-claims.parser';

interface TokenClaims extends jwt.JwtPayload {
  sub: string;
  [key: string]: unknown;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly jwks?: JwksClient;

  constructor(
    private readonly reflector: Reflector,
    @Inject(ENVIRONMENT) private readonly environment: Environment,
  ) {
    if (environment.AUTH_MODE === 'jwks' && environment.AUTH_JWKS_URI) {
      this.jwks = jwksClient({
        jwksUri: environment.AUTH_JWKS_URI,
        cache: true,
        cacheMaxEntries: 10,
        cacheMaxAge: 600_000,
        rateLimit: true,
        jwksRequestsPerMinute: 10,
        timeout: 5_000,
      });
    }
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (this.reflector.getAllAndOverride<boolean>(PUBLIC_ROUTE, [context.getHandler(), context.getClass()])) {
      return true;
    }
    const request = context.switchToHttp().getRequest<FastifyRequest & { actor?: Actor }>();
    if (this.environment.AUTH_MODE === 'disabled') {
      request.actor = {
        subject: 'local-development',
        roles: Object.values(ACTOR_ROLES),
      };
      return true;
    }
    const token = this.extractBearerToken(request.headers.authorization);
    request.actor = await this.verifyToken(token);
    return true;
  }

  private extractBearerToken(authorization: string | undefined): string {
    const [scheme, token] = authorization?.split(' ') ?? [];
    if (scheme !== 'Bearer' || !token) {
      throw new UnauthorizedException('A valid bearer token is required');
    }
    return token;
  }

  private async verifyToken(token: string): Promise<Actor> {
    if (!this.jwks) {
      throw new UnauthorizedException('Authentication provider is not configured');
    }
    const claims = await new Promise<TokenClaims>((resolve, reject) => {
      jwt.verify(
        token,
        this.resolveSigningKey.bind(this),
        {
          algorithms: ['RS256'],
          issuer: this.environment.AUTH_ISSUER,
          audience: this.environment.AUTH_AUDIENCE,
        },
        (error, decoded) => {
          if (error || typeof decoded !== 'object' || typeof decoded.sub !== 'string') {
            reject(new UnauthorizedException('Token is invalid or expired'));
            return;
          }
          resolve(decoded as TokenClaims);
        },
      );
    });
    return parseActorClaims(claims, this.environment);
  }

  private resolveSigningKey(header: JwtHeader, callback: SigningKeyCallback): void {
    if (!header.kid || !this.jwks) {
      callback(new Error('Token key id is missing'));
      return;
    }
    this.jwks.getSigningKey(header.kid, (error, key) => {
      callback(error, key?.getPublicKey());
    });
  }

}
