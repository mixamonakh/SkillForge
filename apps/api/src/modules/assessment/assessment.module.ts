import { Module } from '@nestjs/common';

import { AssessmentController } from './assessment.controller.js';
import { AssessmentLifecycleService } from './assessment-lifecycle.service.js';
import { AssessmentQueryService } from './assessment-query.service.js';
import { AssessmentService } from './assessment.service.js';
import { AttemptAutosaveService } from './attempt-autosave.service.js';
import { AttemptEvaluationService } from './attempt-evaluation.service.js';

@Module({
  controllers: [AssessmentController],
  providers: [
    AssessmentService,
    AssessmentQueryService,
    AssessmentLifecycleService,
    AttemptAutosaveService,
    AttemptEvaluationService,
  ],
  exports: [AssessmentService],
})
export class AssessmentModule {}
