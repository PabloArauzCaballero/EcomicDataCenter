import 'dotenv/config';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { RequestMethod } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { stringify } from 'yaml';
import { AppModule } from '../src/app.module';
import { getEnvironment } from '../src/config/environment';

async function exportOpenApi(): Promise<void> {
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter(), {
    logger: false,
  });
  try {
    const environment = getEnvironment();
    app.setGlobalPrefix(`${environment.API_PREFIX}/${environment.API_VERSION}`, {
      exclude: [
        { path: 'health', method: RequestMethod.GET },
        { path: 'ready', method: RequestMethod.GET },
        { path: 'metrics', method: RequestMethod.GET },
      ],
    });
    const config = new DocumentBuilder()
      .setTitle('Observatorio Económico Core API')
      .setVersion('1.0.0')
      .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' })
      .build();
    const document = SwaggerModule.createDocument(app, config);
    const directory = resolve('artifacts/openapi');
    await mkdir(directory, { recursive: true });
    await writeFile(resolve(directory, 'runtime-openapi.yaml'), stringify(document), 'utf8');
  } finally {
    await app.close();
  }
}

exportOpenApi().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : 'OpenAPI export failed'}\n`);
  process.exitCode = 1;
});
