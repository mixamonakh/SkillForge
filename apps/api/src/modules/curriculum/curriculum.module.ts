import { Module } from '@nestjs/common';

import { ContentLibraryService } from './content-library.service.js';
import { CurriculumController } from './curriculum.controller.js';
import { CurriculumService } from './curriculum.service.js';

@Module({
  controllers: [CurriculumController],
  providers: [CurriculumService, ContentLibraryService],
  exports: [CurriculumService],
})
export class CurriculumModule {}
