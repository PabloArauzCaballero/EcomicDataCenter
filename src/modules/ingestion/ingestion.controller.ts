import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ACTOR_ROLES, type Actor } from '../../common/auth/actor';
import { CurrentActor, Roles } from '../../common/auth/auth.decorators';
import { ZodValidationPipe } from '../../common/validation/zod-validation.pipe';
import { BatchImportService } from './batch-import.service';
import {
  importObservationBatchSchema,
  registerObservationSchema,
  type ImportObservationBatchInput,
  type RegisterObservationInput,
} from './observation-input.schemas';
import { ObservationRegistrationService } from './observation-registration.service';

@ApiTags('Data ingestion')
@ApiBearerAuth()
@Controller('data')
export class IngestionController {
  constructor(
    private readonly registration: ObservationRegistrationService,
    private readonly batches: BatchImportService,
  ) {}

  @Post('observations')
  @HttpCode(HttpStatus.OK)
  @Roles(ACTOR_ROLES.DATA_OFFICER)
  @ApiOperation({
    operationId: 'registerObservation',
    summary: 'Register or revise one observation',
  })
  register(
    @Body(new ZodValidationPipe(registerObservationSchema)) input: RegisterObservationInput,
    @CurrentActor() actor: Actor,
  ) {
    return this.registration.register(input, actor);
  }

  @Post('observation-batches')
  @HttpCode(HttpStatus.OK)
  @Roles(ACTOR_ROLES.DATA_OFFICER)
  @ApiOperation({ operationId: 'importObservationBatch', summary: 'Import up to 500 observations' })
  importBatch(
    @Body(new ZodValidationPipe(importObservationBatchSchema)) input: ImportObservationBatchInput,
    @CurrentActor() actor: Actor,
  ) {
    return this.batches.import(input, actor);
  }
}
