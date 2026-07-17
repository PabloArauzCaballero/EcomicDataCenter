import { Global, Module } from '@nestjs/common';
import { getEnvironment } from './environment';

export const ENVIRONMENT = Symbol('ENVIRONMENT');

@Global()
@Module({
  providers: [{ provide: ENVIRONMENT, useFactory: getEnvironment }],
  exports: [ENVIRONMENT],
})
export class ConfigurationModule {}
