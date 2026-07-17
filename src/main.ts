import 'dotenv/config';
import 'reflect-metadata';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { RequestMethod } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { getEnvironment } from './config/environment';

async function bootstrap(): Promise<void> {
  const environment = getEnvironment();
  const adapter = new FastifyAdapter({
    bodyLimit: environment.BODY_LIMIT_BYTES,
    trustProxy: environment.TRUST_PROXY,
    requestIdHeader: 'x-request-id',
  });
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, adapter, {
    bufferLogs: true,
  });
  app.useLogger(app.get(Logger));
  app.enableShutdownHooks();
  app.setGlobalPrefix(`${environment.API_PREFIX}/${environment.API_VERSION}`, {
    exclude: [
      { path: 'health', method: RequestMethod.GET },
      { path: 'ready', method: RequestMethod.GET },
      { path: 'metrics', method: RequestMethod.GET },
    ],
  });
  await app.register(helmet, {
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: 'same-site' },
  });
  await app.register(rateLimit, {
    max: environment.RATE_LIMIT_MAX,
    timeWindow: environment.RATE_LIMIT_WINDOW_MS,
    keyGenerator: (request) => request.ip,
  });
  const origins = environment.CORS_ORIGINS.split(',').map((origin) => origin.trim()).filter(Boolean);
  app.enableCors({
    origin: origins.length ? origins : false,
    credentials: false,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['authorization', 'content-type', 'x-request-id'],
    maxAge: 600,
  });

  if (environment.SWAGGER_ENABLED) {
    const config = new DocumentBuilder()
      .setTitle('Observatorio Económico Core API')
      .setDescription('Registro, revisión, consulta, calidad y trazabilidad del núcleo estadístico')
      .setVersion('1.0.0')
      .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' })
      .build();
    SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, config), {
      jsonDocumentUrl: 'docs/openapi.json',
    });
  }

  await app.listen({ host: environment.APP_HOST, port: environment.APP_PORT });
}

bootstrap().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : 'Application bootstrap failed'}\n`);
  process.exitCode = 1;
});
