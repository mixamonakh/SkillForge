import { Global, Module } from '@nestjs/common';

import { AI_EVALUATION_PROVIDER } from './ai-evaluation.provider.js';
import { DisabledAiProvider } from './disabled-ai.provider.js';

@Global()
@Module({
  providers: [
    DisabledAiProvider,
    { provide: AI_EVALUATION_PROVIDER, useExisting: DisabledAiProvider },
  ],
  exports: [AI_EVALUATION_PROVIDER],
})
export class AiModule {}
