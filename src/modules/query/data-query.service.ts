import { Injectable } from '@nestjs/common';
import { mapQueryRow } from './data-query.mapper';
import type { DataQueryInput } from './data-query.schemas';
import { DataQueryRepository } from './data-query.repository';
import { TraceRepository } from './trace.repository';

@Injectable()
export class DataQueryService {
  constructor(
    private readonly queries: DataQueryRepository,
    private readonly traces: TraceRepository,
  ) {}

  async search(input: DataQueryInput) {
    const result = await this.queries.search(input);
    return {
      pagination: {
        page: input.page,
        pageSize: input.pageSize,
        total: result.total,
        totalPages: Math.ceil(result.total / input.pageSize),
      },
      data: result.rows.map(mapQueryRow),
      queryMode: input.vintageDate ? 'VINTAGE' : 'CURRENT',
    };
  }

  trace(observationId: string, revisionId: string) {
    return this.traces.getTrace(observationId, revisionId);
  }
}
