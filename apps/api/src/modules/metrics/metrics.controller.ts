import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { MetricsService } from './metrics.service.js';

@ApiTags('metrics')
@Controller('metrics')
export class MetricsController {
  public constructor(private readonly metrics: MetricsService) {}

  @Get('dashboard')
  @ApiOperation({ summary: 'Dashboard без fake readiness и с одной рекомендацией' })
  public dashboard(): Promise<unknown> {
    return this.metrics.dashboard();
  }

  @Get('topics')
  public topics(): Promise<unknown> {
    return this.metrics.topicsMetrics();
  }

  @Get('readiness/:targetKey')
  public readiness(@Param('targetKey') targetKey: string): Promise<unknown> {
    return this.metrics.readiness(targetKey);
  }

  @Get('calibration')
  public calibration(): Promise<unknown> {
    return this.metrics.calibration();
  }

  @Get('misconceptions')
  public misconceptions(): Promise<Array<{ key: string; title: string; count: number }>> {
    return this.metrics.misconceptions();
  }
}
