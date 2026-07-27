import { Injectable } from '@nestjs/common';
import type { Actor } from '../../common/auth/actor';
import { resolveDisclosureScope } from '../../common/auth/disclosure.policy';
import { mapQueryRow } from './data-query.mapper';
import { encodeCursor } from './pagination-cursor';
import type { DataQueryInput } from './data-query.schemas';
import { DataQueryRepository } from './data-query.repository';
import { TraceRepository } from './trace.repository';

@Injectable()
export class DataQueryService {
  constructor(
    private readonly queries: DataQueryRepository,
    private readonly traces: TraceRepository,
  ) {}

  async search(input: DataQueryInput, actor: Actor) {
    const result = await this.queries.search(input, resolveDisclosureScope(actor));
    const last = result.rows.at(-1);
    // A keyset page reports no total: computing it would reintroduce the full
    // scan the cursor exists to avoid. Clients follow nextCursor until it is null.
    const nextCursor =
      result.rows.length === input.pageSize && last
        ? encodeCursor({ periodStart: last.period_start, seriesKey: last.series_key })
        : null;
    return {
      pagination: {
        page: input.cursor ? null : input.page,
        pageSize: input.pageSize,
        total: input.cursor ? null : result.total,
        totalPages: input.cursor ? null : Math.ceil(result.total / input.pageSize),
        nextCursor,
      },
      data: result.rows.map(mapQueryRow),
      queryMode: input.vintageDate ? 'VINTAGE' : 'CURRENT',
    };
  }

  trace(observationId: string, revisionId: string) {
    return this.traces.getTrace(observationId, revisionId);
  }
}
