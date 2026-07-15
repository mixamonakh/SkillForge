import { Module } from '@nestjs/common';

import { CurriculumModule } from '../curriculum/curriculum.module.js';
import { CapabilityModule } from '../capability/capability.module.js';
import { SessionRecommendationService } from './session-recommendation.service.js';
import { SessionsController } from './sessions.controller.js';
import { SessionsService } from './sessions.service.js';

@Module({
  imports: [CurriculumModule, CapabilityModule],
  controllers: [SessionsController],
  providers: [SessionsService, SessionRecommendationService],
  exports: [SessionsService],
})
export class SessionsModule {}
