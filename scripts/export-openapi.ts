import 'dotenv/config';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { RequestMethod } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Test } from '@nestjs/testing';
import type { Sequelize } from 'sequelize-typescript';
import { stringify } from 'yaml';
import { AppModule } from '../src/app.module';
import { getEnvironment } from '../src/config/environment';
import type { DatabaseConnections } from '../src/database/database-connections';
import { DATABASE_CONNECTIONS } from '../src/database/database.tokens';

function createDatabaseDouble(): Sequelize {
  return {
    close: async (): Promise<void> => undefined,
  } as unknown as Sequelize;
}

/**
 * Builds the API contract without opening PostgreSQL pools.
 *
 * OpenAPI generation is a deterministic build-time operation. Depending on a
 * live database made contract export fail for infrastructure reasons unrelated
 * to controller metadata and also created unnecessary sockets in CI.
 */
async function createContractApplication(): Promise<NestFastifyApplication> {
  const database = createDatabaseDouble();
  const connections: DatabaseConnections = { writer: database, reader: database };
  const moduleReference = await Test.createTestingModule({
    imports: [AppModule],
    // TestingModule does not install Nest's HTTP core Reflector automatically,
    // while both global guards require it during provider construction.
    providers: [Reflector],
  })
    .overrideProvider(DATABASE_CONNECTIONS)
    .useValue(connections)
    .compile();
  const application = moduleReference.createNestApplication<NestFastifyApplication>(
    new FastifyAdapter(),
    { logger: false },
  );
  await application.init();
  return application;
}

async function exportOpenApi(): Promise<void> {
  let application: NestFastifyApplication | undefined;

  try {
    application = await createContractApplication();
    const environment = getEnvironment();
    application.setGlobalPrefix(`${environment.API_PREFIX}/${environment.API_VERSION}`, {
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
    const document = SwaggerModule.createDocument(application, config);
    const directory = resolve('artifacts/openapi');
    await mkdir(directory, { recursive: true });
    await writeFile(resolve(directory, 'runtime-openapi.yaml'), stringify(document), 'utf8');
  } finally {
    if (application) await application.close();
  }
}

exportOpenApi().catch((error: unknown) => {
  const message = error instanceof Error ? (error.stack ?? error.message) : 'OpenAPI export failed';
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
