import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import {
  ConfirmExternalEvidenceDto,
  CreateExternalArtifactDto,
  UpdateExternalArtifactDto,
} from './battle-evidence.dto.js';
import { BattleEvidenceService } from './battle-evidence.service.js';

@ApiTags('battle-evidence')
@Controller('external-artifacts')
export class BattleEvidenceController {
  public constructor(private readonly battleEvidence: BattleEvidenceService) {}

  @Post()
  @ApiOperation({ summary: 'Создать external artifact без автоматического mastery' })
  public create(@Body() input: CreateExternalArtifactDto): Promise<unknown> {
    return this.battleEvidence.create(input);
  }

  @Get()
  public list(): Promise<unknown[]> {
    return this.battleEvidence.list();
  }

  @Get(':id')
  public get(@Param('id', ParseUUIDPipe) id: string): Promise<unknown> {
    return this.battleEvidence.get(id);
  }

  @Patch(':id')
  public update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: UpdateExternalArtifactDto,
  ): Promise<unknown> {
    return this.battleEvidence.update(id, input);
  }

  @Delete(':id')
  public remove(@Param('id', ParseUUIDPipe) id: string): Promise<{ deleted: true }> {
    return this.battleEvidence.remove(id);
  }

  @Post(':id/create-evidence')
  @ApiOperation({
    summary: 'Создать idempotent BATTLE/TRANSFER evidence после явного подтверждения',
  })
  public createEvidence(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() _input: ConfirmExternalEvidenceDto,
  ): Promise<unknown> {
    return this.battleEvidence.createEvidence(id);
  }
}
