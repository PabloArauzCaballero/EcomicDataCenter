import { Global, Module } from '@nestjs/common';
import { DomainMetricsCollector } from './domain-metrics.collector';
import { MessagingTraceService } from './messaging-trace.service';
import { MetricsService } from './metrics.service';
import { TelemetryLifecycle } from './telemetry.lifecycle';
import { TraceContextService } from './trace-context.service';
import { TracingService } from './tracing.service';

@Global()
@Module({
  providers: [
    MetricsService,
    DomainMetricsCollector,
    TracingService,
    TraceContextService,
    MessagingTraceService,
    TelemetryLifecycle,
  ],
  exports: [MetricsService, TracingService, TraceContextService, MessagingTraceService],
})
export class ObservabilityModule {}
