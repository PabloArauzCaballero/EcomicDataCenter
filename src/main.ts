// Must stay the first import: OpenTelemetry patches modules as they are
// required, so Fastify, Nest, pg and pino have to be loaded after it. The
// bootstrap loads `dotenv/config` itself before reading the environment.
import './common/observability/telemetry.bootstrap';
import 'reflect-metadata';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { RequestMethod } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { createHash } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { createRequestId } from './common/http/request-id';
import { fastifyTracingPlugin } from './common/observability/fastify-tracing.plugin';
import { getEnvironment } from './config/environment';
import { provisionDatabase } from './database/startup-provisioning';

/**
 * Derives a stable per-caller key without verifying the token.
 *
 * Rate limiting runs before authentication, so the subject cannot be trusted
 * here; hashing the credential yields a per-credential bucket that an attacker
 * cannot forge into someone else's quota, and unauthenticated traffic still
 * falls back to the address.
 */
function rateLimitKey(authorization: string | undefined, ip: string): string {
  const [scheme, token] = authorization?.split(' ') ?? [];
  if (scheme !== 'Bearer' || !token) return `ip:${ip}`;
  return `token:${createHash('sha256').update(token).digest('base64url')}`;
}

/** True when the caller presents a bearer credential, which agents always do. */
function hasAgentIdentity(authorization: string | undefined): boolean {
  const [scheme, token] = authorization?.split(' ') ?? [];
  return scheme === 'Bearer' && Boolean(token);
}

async function bootstrap(): Promise<void> {
  const environment = getEnvironment();
  // Before anything binds a port: a replica must not accept a request against a
  // schema it was not built for.
  if (environment.DATABASE_PROVISION_ON_BOOT) await provisionDatabase(environment);
  const adapter = new FastifyAdapter({
    bodyLimit: environment.BODY_LIMIT_BYTES,
    trustProxy: environment.TRUST_PROXY,
    requestTimeout: environment.HTTP_REQUEST_TIMEOUT_MS,
    connectionTimeout: environment.HTTP_CONNECTION_TIMEOUT_MS,
    keepAliveTimeout: environment.HTTP_KEEP_ALIVE_TIMEOUT_MS,
    requestIdHeader: false,
    genReqId: (request: IncomingMessage): string =>
      createRequestId(request.headers['x-request-id']),
  });
  let application: NestFastifyApplication | undefined;

  try {
    application = await NestFactory.create<NestFastifyApplication>(AppModule, adapter, {
      bufferLogs: true,
    });
    application.useLogger(application.get(Logger));
    application.enableShutdownHooks(['SIGINT', 'SIGTERM']);
    application.setGlobalPrefix(`${environment.API_PREFIX}/${environment.API_VERSION}`, {
      exclude: [
        { path: 'health', method: RequestMethod.GET },
        { path: 'ready', method: RequestMethod.GET },
        { path: 'metrics', method: RequestMethod.GET },
      ],
    });
    if (environment.OTEL_ENABLED) {
      // Registered before the security plugins so the request span already
      // exists when helmet and the rate limiter run: a throttled request is
      // then visible in the trace instead of disappearing before it starts.
      await application.register(fastifyTracingPlugin());
    }
    await application.register(helmet, {
      contentSecurityPolicy: !environment.SWAGGER_ENABLED,
      crossOriginResourcePolicy: { policy: 'same-site' },
    });
    await application.register(rateLimit, {
      max: (request) =>
        hasAgentIdentity(request.headers.authorization)
          ? environment.RATE_LIMIT_AGENT_MAX
          : environment.RATE_LIMIT_MAX,
      timeWindow: environment.RATE_LIMIT_WINDOW_MS,
      // Keying on the authenticated subject rather than the address stops many
      // agents behind one NAT from sharing a quota, and confines a compromised
      // agent to its own budget instead of everyone else's.
      keyGenerator: (request) => rateLimitKey(request.headers.authorization, request.ip),
    });
    const origins = environment.CORS_ORIGINS.split(',')
      .map((origin) => origin.trim())
      .filter(Boolean);
    application.enableCors({
      origin: origins.length ? origins : false,
      credentials: false,
      methods: ['GET', 'POST', 'OPTIONS'],
      allowedHeaders: ['authorization', 'content-type', 'x-request-id'],
      maxAge: 600,
    });

    if (environment.SWAGGER_ENABLED) {
      const swaggerConfig = new DocumentBuilder()
        .setTitle('Observatorio Económico Core API')
        .setDescription(
          'Registro, revisión, consulta, calidad y trazabilidad del núcleo estadístico',
        )
        .setVersion('1.0.0')
        .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' })
        .build();
      SwaggerModule.setup(
        'docs',
        application,
        SwaggerModule.createDocument(application, swaggerConfig),
        { jsonDocumentUrl: 'docs/openapi.json' },
      );
    }

    await application.listen({ host: environment.APP_HOST, port: environment.APP_PORT });
  } catch (error) {
    if (application) {
      await application.close().catch(() => undefined);
    }
    throw error;
  }
}

void bootstrap().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : 'Application bootstrap failed'}\n`,
  );
  process.exitCode = 1;
});
