import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, Res } from '@nestjs/common';
import { ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import type { FastifyReply } from 'fastify';

import { ApiObjectArrayOk, ApiObjectOk } from '../../common/openapi-response.js';
import { CreateExportDto, DownloadQueryDto, ValidateImportDto } from './import-export.dto.js';
import { ExportService } from './export.service.js';
import { ImportApplyService } from './import-apply.service.js';
import { ImportPreviewService } from './import-preview.service.js';
import { ImportValidationService } from './import-validation.service.js';

@ApiTags('import-export')
@Controller()
export class ImportExportController {
  public constructor(
    private readonly exports: ExportService,
    private readonly validation: ImportValidationService,
    private readonly previews: ImportPreviewService,
    private readonly applyService: ImportApplyService,
  ) {}

  @Post('exports')
  @ApiOperation({ summary: 'Создать immutable strict JSON + Markdown export' })
  @ApiObjectOk('Export bundle, strict JSON и Markdown wrapper')
  public createExport(@Body() input: CreateExportDto): Promise<unknown> {
    return this.exports.create(input);
  }

  @Get('exports/:bundleId')
  @ApiObjectOk('Сохранённый export bundle')
  public getExport(@Param('bundleId', ParseUUIDPipe) bundleId: string): Promise<unknown> {
    return this.exports.get(bundleId);
  }

  @Get('exports/:bundleId/download')
  @ApiProduces('application/json', 'text/markdown')
  public async download(
    @Param('bundleId', ParseUUIDPipe) bundleId: string,
    @Query() query: DownloadQueryDto,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<string> {
    const result = (await this.exports.get(bundleId)) as {
      fileName: string;
      json: string;
      markdown: string;
    };
    const markdown = query.format === 'markdown';
    reply.type(markdown ? 'text/markdown; charset=utf-8' : 'application/json; charset=utf-8');
    reply.header(
      'content-disposition',
      `attachment; filename="${result.fileName}.${markdown ? 'md' : 'json'}"`,
    );
    return markdown ? result.markdown : result.json;
  }

  @Post('imports/validate')
  @ApiOperation({ summary: 'Strict fenced/raw JSON validation с лимитами' })
  @ApiObjectOk('Validation result и normalized JSON')
  public validateImport(@Body() input: ValidateImportDto): Promise<unknown> {
    return this.validation.validate(input.payload, input.source);
  }

  @Post('imports/:importId/preview')
  @ApiOperation({ summary: 'Симуляция learning engine без изменения TopicState' })
  @ApiObjectOk('Preview diff без записи evidence')
  public preview(@Param('importId', ParseUUIDPipe) importId: string): Promise<unknown> {
    return this.previews.preview(importId);
  }

  @Post('imports/:importId/apply')
  @ApiOperation({ summary: 'Atomic idempotent import apply после preview' })
  @ApiObjectOk('Результат атомарного import apply')
  public apply(@Param('importId', ParseUUIDPipe) importId: string): Promise<unknown> {
    return this.applyService.apply(importId);
  }

  @Post('imports/:importId/rollback')
  @ApiOperation({ summary: 'Компенсирующая отмена последнего применённого import' })
  @ApiObjectOk('Результат атомарной отмены imported evaluations/evidence')
  public rollback(@Param('importId', ParseUUIDPipe) importId: string): Promise<unknown> {
    return this.applyService.rollback(importId);
  }

  @Get('imports')
  @ApiObjectArrayOk('История import batches')
  public listImports(): Promise<unknown[]> {
    return this.validation.list();
  }

  @Get('imports/:importId')
  @ApiObjectOk('Import batch, preview и normalized JSON')
  public getImport(@Param('importId', ParseUUIDPipe) importId: string): Promise<unknown> {
    return this.validation.get(importId);
  }
}
