import { Body, Controller, Get, Patch, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { ApiObjectOk } from '../../common/openapi-response.js';
import { ResetConfirmDto, UpdateSettingsDto } from './profile.dto.js';
import { ProfileService } from './profile.service.js';

@ApiTags('profile')
@Controller('profile')
export class ProfileController {
  public constructor(private readonly profile: ProfileService) {}

  @Get()
  @ApiOperation({ summary: 'Получить локальный профиль и настройки' })
  @ApiObjectOk('Локальный профиль и runtime configuration')
  public getProfile(): Promise<unknown> {
    return this.profile.getProfile();
  }

  @Patch('settings')
  @ApiOperation({ summary: 'Обновить настройки профиля' })
  @ApiObjectOk('Обновлённый профиль')
  public updateSettings(@Body() input: UpdateSettingsDto): Promise<unknown> {
    return this.profile.updateSettings(input);
  }

  @Post('reset-preview')
  @ApiOperation({ summary: 'Предпросмотр destructive reset без изменения данных' })
  @ApiObjectOk('Счётчики данных и confirmation phrase')
  public resetPreview(): Promise<unknown> {
    return this.profile.resetPreview();
  }

  @Post('reset-confirm')
  @ApiOperation({ summary: 'Удалить пользовательские данные после typed confirmation' })
  @ApiObjectOk('Подтверждение завершённого reset')
  public resetConfirm(@Body() input: ResetConfirmDto): Promise<{ reset: true }> {
    return this.profile.resetConfirm(input.confirmation);
  }
}
