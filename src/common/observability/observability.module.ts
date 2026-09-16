import { Global, Module } from '@nestjs/common';
import { IngestionEventRecorder } from './ingestion-event.recorder';
import { MessagingTraceService } from './messaging-trace.service';
import { MetricsService } from './metrics.service';
import { TelemetryLifecycle } from './telemetry.lifecycle';
import { TraceContextService } from './trace-context.service';
import { TracingService } from './tracing.service';

@Global()
@Module({
  providers: [
    IngestionEventRecorder,
    MetricsService,
    TracingService,
    TraceContextService,
    MessagingTraceService,
    TelemetryLifecycle,
  ],
  exports: [
    IngestionEventRecorder,
    MetricsService,
    TracingService,
    TraceContextService,
    MessagingTraceService,
  ],
})
export class ObservabilityModule {}
