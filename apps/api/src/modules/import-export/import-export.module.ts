import { Module } from '@nestjs/common';

import { ExportService } from './export.service.js';
import { ImportApplyService } from './import-apply.service.js';
import { ImportExportController } from './import-export.controller.js';
import { ImportPreviewService } from './import-preview.service.js';
import { ImportValidationService } from './import-validation.service.js';

@Module({
  controllers: [ImportExportController],
  providers: [ExportService, ImportValidationService, ImportPreviewService, ImportApplyService],
})
export class ImportExportModule {}
