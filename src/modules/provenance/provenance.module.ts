import { Module } from '@nestjs/common';
import { ProvenanceController } from './provenance.controller';
import { ProvenanceService } from './provenance.service';

@Module({ controllers: [ProvenanceController], providers: [ProvenanceService] })
export class ProvenanceModule {}
