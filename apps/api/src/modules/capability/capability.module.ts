import { Module } from '@nestjs/common';

import { CapabilityController } from './capability.controller.js';
import { CapabilityProjectionService } from './capability-projection.service.js';

@Module({
  controllers: [CapabilityController],
  providers: [CapabilityProjectionService],
  exports: [CapabilityProjectionService],
})
export class CapabilityModule {}
