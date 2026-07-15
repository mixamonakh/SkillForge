import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { TopicCapabilityProfile } from '@skillforge/learning-engine';

import { ApiObjectOk } from '../../common/openapi-response.js';
import {
  CapabilityProjectionService,
  type UserCapabilitySummary,
} from './capability-projection.service.js';

@ApiTags('capability')
@Controller()
export class CapabilityController {
  public constructor(private readonly capability: CapabilityProjectionService) {}

  @Get('topics/:topicKey/capability-profile')
  @ApiOperation({ summary: 'Capability profile темы без изменения TopicStatus' })
  @ApiObjectOk('TopicCapabilityProfile v1')
  public topicProfile(@Param('topicKey') topicKey: string): Promise<TopicCapabilityProfile> {
    return this.capability.topicProfile(topicKey);
  }

  @Get('users/me/capability-summary')
  @ApiOperation({ summary: 'Capability coverage локального пользователя' })
  @ApiObjectOk('User capability summary v1')
  public userSummary(): Promise<UserCapabilitySummary> {
    return this.capability.userSummary();
  }
}
