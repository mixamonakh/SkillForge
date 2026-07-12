import { HttpStatus, Injectable } from '@nestjs/common';

import { ApiError } from '../../common/api-error.js';
import type { AiEvaluationProvider } from './ai-evaluation.provider.js';

@Injectable()
export class DisabledAiProvider implements AiEvaluationProvider {
  public readonly mode = 'manual' as const;

  public analyzeAttempt(_input: unknown): Promise<never> {
    return Promise.reject(
      new ApiError(
        'AI_DISABLED',
        'Автоматический AI provider отключён; используй ручной export/import workflow',
        HttpStatus.SERVICE_UNAVAILABLE,
      ),
    );
  }
}
