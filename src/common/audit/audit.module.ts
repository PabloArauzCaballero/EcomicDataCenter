import { Global, Module } from '@nestjs/common';
import { AuditService } from './audit.service';

/**
 * Exposes the audit trail globally.
 *
 * Auditing is a cross-cutting institutional obligation rather than a feature of
 * one module, so every module can record without declaring a dependency edge.
 */
@Global()
@Module({
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
