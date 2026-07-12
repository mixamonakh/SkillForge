import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { ApiObjectOk } from '../../common/openapi-response.js';
import { HealthService } from './health.service.js';

@ApiTags('health')
@Controller('health')
export class HealthController {
  public constructor(private readonly health: HealthService) {}

  @Get('live')
  @ApiOperation({ summary: 'Liveness процесса без проверки внешних зависимостей' })
  @ApiObjectOk('Процесс API работает')
  public live(): unknown {
    return this.health.live();
  }

  @Get('ready')
  @ApiOperation({ summary: 'Readiness PostgreSQL, Prisma migrations и content pack' })
  @ApiObjectOk('DB, migrations и content готовы')
  public ready(): Promise<unknown> {
    return this.health.ready();
  }
}
