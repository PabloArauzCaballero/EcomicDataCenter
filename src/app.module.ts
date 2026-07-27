import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { AuditInterceptor } from './common/audit/audit.interceptor';
import { AuditModule } from './common/audit/audit.module';
import { JwtAuthGuard } from './common/auth/jwt-auth.guard';
import { RolesGuard } from './common/auth/roles.guard';
import { HttpExceptionFilter } from './common/errors/http-exception.filter';
import { RequestContextInterceptor } from './common/http/request-context.interceptor';
import { ObservabilityModule } from './common/observability/observability.module';
import { ConfigurationModule } from './config/configuration.module';
import { getEnvironment } from './config/environment';
import { DatabaseModule } from './database/database.module';
import { GovernanceModule } from './modules/governance/governance.module';
import { HealthModule } from './modules/health/health.module';
import { IngestionModule } from './modules/ingestion/ingestion.module';
import { IntelligenceModule } from './modules/intelligence/intelligence.module';
import { ProvenanceModule } from './modules/provenance/provenance.module';
import { QualityModule } from './modules/quality/quality.module';
import { DataQueryModule } from './modules/query/data-query.module';

interface LoggableRequest {
  readonly id?: string | number;
  readonly method?: string;
  readonly url?: string;
}

interface LoggableResponse {
  readonly statusCode?: number;
}

const environment = getEnvironment();

@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        level: environment.LOG_LEVEL,
        redact: {
          paths: [
            'req.headers.authorization',
            'req.headers.cookie',
            'res.headers["set-cookie"]',
            '*.password',
            '*.token',
            '*.*.password',
            '*.*.token',
          ],
          censor: '[REDACTED]',
        },
        autoLogging: false,
        serializers: {
          req: (request: LoggableRequest) => ({
            id: request.id,
            method: request.method,
            // Strip the query string so a sensitive filter value passed as a
            // query parameter is never logged verbatim.
            url: request.url?.split('?')[0],
          }),
          res: (response: LoggableResponse) => ({ statusCode: response.statusCode }),
        },
      },
    }),
    ConfigurationModule,
    ObservabilityModule,
    DatabaseModule,
    AuditModule,
    HealthModule,
    ProvenanceModule,
    GovernanceModule,
    IngestionModule,
    IntelligenceModule,
    DataQueryModule,
    QualityModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: RequestContextInterceptor },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
  ],
})
export class AppModule {}
