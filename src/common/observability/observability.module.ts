import { Global, Module } from '@nestjs/common';
import { DomainMetricsCollector } from './domain-metrics.collector';
import { MetricsService } from './metrics.service';

@Global()
@Module({
  providers: [MetricsService, DomainMetricsCollector],
  exports: [MetricsService],
})
export class ObservabilityModule {}
