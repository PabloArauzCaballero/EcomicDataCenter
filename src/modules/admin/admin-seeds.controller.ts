import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { ACTOR_ROLES, type Actor } from '../../common/auth/actor';
import { CurrentActor, Roles } from '../../common/auth/auth.decorators';
import { RequestId } from '../../common/http/request-id.decorator';
import { ZodValidationPipe } from '../../common/validation/zod-validation.pipe';
import { envelope, type AdminEnvelope } from './admin.envelope';
import { seedRequestSchema, seedRunParamsSchema, type SeedRequest } from './admin.schemas';
import { DeploymentIdentity } from './deployment-identity';
import { SeedExecutionService } from './seed-execution.service';
import { SeedInspectionService } from './seed-inspection.service';

const validationSchema = z.object({
  packageCode: z.string().regex(/^[a-z][a-z0-9-]{1,79}$/u),
});

/**
 * The seed console: read the manifest, see the difference, ask for a repair.
 *
 * Three things it deliberately cannot do. It takes a package **code** from an
 * allowlist and never a path, a script name or a statement. It refuses a
 * reconciliation whose stated version and checksum no longer match what the
 * build carries, so «apply what I reviewed» cannot become «apply whatever is
 * there now». And it answers a reconciliation with 202 and a run identifier,
 * never with a result, because a corpus takes minutes and an HTTP response that
 * claims completion it did not observe is the failure this whole portal exists
 * to stop.
 */
@ApiTags('Administration')
@ApiBearerAuth()
@Controller('admin/seeds')
export class AdminSeedsController {
  constructor(
    private readonly identity: DeploymentIdentity,
    private readonly inspection: SeedInspectionService,
    private readonly execution: SeedExecutionService,
  ) {}

  @Get('packages')
  @Roles(ACTOR_ROLES.ANALYST, ACTOR_ROLES.METHODOLOGY_STEWARD, ACTOR_ROLES.SEED_OPERATOR)
  @ApiOperation({ operationId: 'listSeedPackages', summary: 'Manifest and ledger state' })
  async listPackages(@RequestId() requestId: string): Promise<AdminEnvelope<unknown>> {
    const packages = await this.inspection.listPackages();
    return envelope(
      {
        items: packages,
        profile: this.identity.seedProfile,
        demoEnabled: this.identity.demoSeedsEnabled,
      },
      {
        environmentId: this.identity.environmentId,
        requestId,
        observedAt: new Date(),
        evidenceState: 'known',
      },
    );
  }

  @Get('runs/:seedRunId')
  @Roles(ACTOR_ROLES.ANALYST, ACTOR_ROLES.METHODOLOGY_STEWARD, ACTOR_ROLES.SEED_OPERATOR)
  @ApiOperation({ operationId: 'getSeedRun', summary: 'Durable state of one seed run' })
  async getRun(
    @Param(new ZodValidationPipe(seedRunParamsSchema)) params: { seedRunId: string },
    @RequestId() requestId: string,
  ): Promise<AdminEnvelope<unknown>> {
    const run = await this.execution.findRun(params.seedRunId);
    return envelope(
      {
        seedRunId: run.seedRunId,
        packageCode: run.packageCode,
        packageVersion: run.packageVersion,
        operation: run.operation,
        status: run.status,
        attemptNo: run.attemptNo,
        startedAt: run.startedAt.toISOString(),
        heartbeatAt: run.heartbeatAt.toISOString(),
        completedAt: run.completedAt ? run.completedAt.toISOString() : null,
        errorSummary: run.errorSummary,
        checkpoint: run.checkpoint,
        counters: run.counters,
      },
      {
        environmentId: this.identity.environmentId,
        requestId,
        observedAt: run.heartbeatAt,
        evidenceState: 'known',
      },
    );
  }

  /** Checks a package without touching a single domain row. */
  @Post('validations')
  @HttpCode(HttpStatus.OK)
  @Roles(ACTOR_ROLES.METHODOLOGY_STEWARD, ACTOR_ROLES.SEED_OPERATOR)
  @ApiOperation({ operationId: 'validateSeedPackage', summary: 'Validate without mutating' })
  async validate(
    @Body(new ZodValidationPipe(validationSchema)) input: { packageCode: string },
    @CurrentActor() actor: Actor,
    @RequestId() requestId: string,
  ): Promise<AdminEnvelope<unknown>> {
    const result = await this.inspection.validate(input.packageCode, actor);
    return envelope(result, {
      environmentId: this.identity.environmentId,
      requestId,
      observedAt: new Date(),
      evidenceState: 'known',
    });
  }

  /**
   * Accepts a reconciliation. The body is the acceptance, not the outcome.
   *
   * `accepted: false` means an identical request is already in flight or has
   * already run, and the identifier returned is that run's. A second tab cannot
   * start a second application of the same package.
   */
  @Post('reconciliations')
  @HttpCode(HttpStatus.ACCEPTED)
  @Roles(ACTOR_ROLES.SEED_OPERATOR)
  @ApiOperation({ operationId: 'reconcileSeedPackage', summary: 'Request a seed reconciliation' })
  async reconcile(
    @Body(new ZodValidationPipe(seedRequestSchema)) input: SeedRequest,
    @CurrentActor() actor: Actor,
    @RequestId() requestId: string,
  ): Promise<AdminEnvelope<unknown>> {
    const accepted = await this.execution.requestReconciliation(
      input.packageCode,
      { version: input.expectedVersion, checksum: input.expectedChecksum },
      actor,
    );
    return envelope(accepted, {
      environmentId: this.identity.environmentId,
      requestId,
      observedAt: null,
      evidenceState: 'not_applicable',
    });
  }
}
