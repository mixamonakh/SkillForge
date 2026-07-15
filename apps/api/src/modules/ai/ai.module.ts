import { Global, Module } from '@nestjs/common';

import { AI_EVALUATION_PROVIDER } from './ai-evaluation.provider.js';
import { AiController } from './ai.controller.js';
import { AiEvaluationService } from './ai-evaluation.service.js';
import { AiHintService } from './ai-hint.service.js';
import { AI_RUNTIME, createAiRuntimeFromProcess } from './ai-runtime.provider.js';
import { AiUsageService } from './ai-usage.service.js';
import { DisabledAiProvider } from './disabled-ai.provider.js';

@Global()
@Module({
  controllers: [AiController],
  providers: [
    DisabledAiProvider,
    { provide: AI_EVALUATION_PROVIDER, useExisting: DisabledAiProvider },
    { provide: AI_RUNTIME, useFactory: createAiRuntimeFromProcess },
    AiEvaluationService,
    AiHintService,
    AiUsageService,
  ],
  exports: [AI_EVALUATION_PROVIDER, AI_RUNTIME],
})
export class AiModule {}
