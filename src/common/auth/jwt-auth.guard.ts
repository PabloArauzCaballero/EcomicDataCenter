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
import { ENVIRONMENT } from '../../config/configuration.module';
import type { Environment } from '../../config/environment';
import { ACTOR_ROLES, type Actor } from './actor';
import { PUBLIC_ROUTE } from './auth.decorators';
import { matchesBearerToken } from './bearer-token';
import { createHostedCollectorActor } from './hosted-collector.actor';
import { parseActorClaims } from './token-claims.parser';

/** Seconds of clock skew tolerated between this host and the issuer. */
const CLOCK_TOLERANCE_SECONDS = 5;

interface TokenClaims extends jwt.JwtPayload {
  sub: string;
  exp: number;
  [key: string]: unknown;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly jwks?: JwksClient;

  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
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
    if (
      this.reflector.getAllAndOverride<boolean>(PUBLIC_ROUTE, [
        context.getHandler(),
        context.getClass(),
      ])
    ) {
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
    // Shared-key collector mode. Unlike `disabled`, which impersonates every
    // role for local work, a caller that presents the key receives one narrow
    // machine identity, so the endpoints that approve or publish data remain
    // unreachable even with the key in hand.
    if (this.environment.AUTH_MODE === 'agent_key') {
      request.actor = this.verifyCollectorKey(request.headers.authorization);
      return true;
    }
    const token = this.extractBearerToken(request.headers.authorization);
    request.actor = await this.verifyToken(token);
    return true;
  }

  /**
   * Authenticates the single shared collector credential.
   *
   * The rejection message never distinguishes a missing key from a wrong one,
   * so a caller probing the endpoint learns nothing about whether a key it
   * guessed was closer than the last.
   */
  private verifyCollectorKey(authorization: string | undefined): Actor {
    const expected = this.environment.AGENT_INGESTION_KEY;
    if (!expected || !matchesBearerToken(authorization, expected)) {
      throw new UnauthorizedException('A valid collector key is required');
    }
    return createHostedCollectorActor();
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
          // Absorbs skew between this host and the issuer without widening the
          // window enough to make a revoked short-lived token usable.
          clockTolerance: CLOCK_TOLERANCE_SECONDS,
        },
        (error, decoded) => {
          // `jsonwebtoken` only checks `exp` when the claim is present, so a
          // token minted without one verifies forever. Requiring it here means a
          // misconfigured issuer costs a rejected request instead of granting a
          // credential that no rotation or revocation window ever reaches.
          if (
            error ||
            typeof decoded !== 'object' ||
            typeof decoded.sub !== 'string' ||
            typeof decoded.exp !== 'number'
          ) {
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
