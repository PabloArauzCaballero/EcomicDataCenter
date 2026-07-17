import { Module } from '@nestjs/common';
import { DataQueryController } from './data-query.controller';
import { DataQueryRepository } from './data-query.repository';
import { DataQueryService } from './data-query.service';
import { TraceRepository } from './trace.repository';

@Module({
  controllers: [DataQueryController],
  providers: [DataQueryService, DataQueryRepository, TraceRepository],
})
export class DataQueryModule {}
