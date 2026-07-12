import { Module } from '@nestjs/common';

import { SessionsModule } from '../sessions/sessions.module.js';
import { MetricsController } from './metrics.controller.js';
import { MetricsReadService } from './metrics-read.service.js';
import { MetricsService } from './metrics.service.js';

@Module({
  imports: [SessionsModule],
  controllers: [MetricsController],
  providers: [MetricsService, MetricsReadService],
})
export class MetricsModule {}
