import { Inject, Injectable, type OnApplicationShutdown, type OnModuleInit } from '@nestjs/common';
import type { Sequelize } from 'sequelize';
import { READER_DATABASE, WRITER_DATABASE } from '../../database/database.tokens';
import { MetricsService } from './metrics.service';

const SAMPLE_INTERVAL_MS = 15_000;

/** Live counters sequelize-pool exposes on the connection manager pool. */
interface PoolSnapshot {
  readonly size: number;
  readonly available: number;
  readonly using: number;
  readonly waiting: number;
}

/**
 * Reads the pool counters sequelize keeps in memory. The property is internal
 * to sequelize, so it is narrowed defensively: a shape change degrades to no
 * sample rather than crashing the collector.
 */
function readPool(sequelize: Sequelize): PoolSnapshot | undefined {
  const manager = (sequelize as unknown as { connectionManager?: { pool?: Partial<PoolSnapshot> } })
    .connectionManager;
  const pool = manager?.pool;
  if (!pool || typeof pool.size !== 'number') return undefined;
  return {
    size: pool.size,
    available: pool.available ?? 0,
    using: pool.using ?? 0,
    waiting: pool.waiting ?? 0,
  };
}

/**
 * Samples writer and reader pool saturation into gauges.
 *
 * Pool exhaustion is the most likely production stall and is invisible in the
 * RED metrics until it manifests as latency; sampling the in-memory counters is
 * a synchronous read that never touches the database.
 */
@Injectable()
export class DatabasePoolMetricsCollector implements OnModuleInit, OnApplicationShutdown {
  private timer: NodeJS.Timeout | undefined;

  constructor(
    @Inject(WRITER_DATABASE) private readonly writer: Sequelize,
    @Inject(READER_DATABASE) private readonly reader: Sequelize,
    private readonly metrics: MetricsService,
  ) {}

  onModuleInit(): void {
    this.sample();
    // `unref` keeps this timer from holding the event loop open so a shutdown
    // signal is honoured immediately.
    this.timer = setInterval(() => this.sample(), SAMPLE_INTERVAL_MS);
    this.timer.unref();
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  private sample(): void {
    this.publish('writer', this.writer);
    this.publish('reader', this.reader);
  }

  private publish(role: 'writer' | 'reader', sequelize: Sequelize): void {
    const pool = readPool(sequelize);
    if (!pool) return;
    this.metrics.setDatabasePool(role, {
      total: pool.size,
      idle: pool.available,
      inUse: pool.using,
      waiting: pool.waiting,
    });
  }
}
