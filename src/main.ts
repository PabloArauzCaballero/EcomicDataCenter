import 'dotenv/config';
import 'reflect-metadata';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { RequestMethod } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { createRequestId } from './common/http/request-id';
import { getEnvironment } from './config/environment';

async function bootstrap(): Promise<void> {
  const environment = getEnvironment();
  const adapter = new FastifyAdapter({
    bodyLimit: environment.BODY_LIMIT_BYTES,
    trustProxy: environment.TRUST_PROXY,
    requestTimeout: environment.HTTP_REQUEST_TIMEOUT_MS,
    connectionTimeout: environment.HTTP_CONNECTION_TIMEOUT_MS,
    keepAliveTimeout: environment.HTTP_KEEP_ALIVE_TIMEOUT_MS,
    requestIdHeader: false,
    genReqId: (request: FastifyRequest): string =>
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
    await application.register(helmet, {
      contentSecurityPolicy: !environment.SWAGGER_ENABLED,
      crossOriginResourcePolicy: { policy: 'same-site' },
    });
    await application.register(rateLimit, {
      max: environment.RATE_LIMIT_MAX,
      timeWindow: environment.RATE_LIMIT_WINDOW_MS,
      keyGenerator: (request) => request.ip,
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
