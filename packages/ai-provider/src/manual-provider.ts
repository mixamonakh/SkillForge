import type {
  AiAttemptEvaluationCandidate,
  AiNudgeCandidate,
  ContentReviewResult,
  EvaluateAttemptInput,
  GenerateNudgeInput,
  ReviewContentInput,
} from './contracts.js';
import {
  AiProviderError,
  type AiProvider,
  type AiProviderRequestOptions,
  type AiProviderResult,
} from './provider.js';

function disabled(): AiProviderError {
  return new AiProviderError(
    'AI_PROVIDER_DISABLED',
    'API-assisted AI is disabled; use manual export/import',
  );
}

export class ManualAiProvider implements AiProvider {
  public evaluateAttempt(
    _input: EvaluateAttemptInput,
    _options?: AiProviderRequestOptions,
  ): Promise<AiProviderResult<AiAttemptEvaluationCandidate>> {
    return Promise.reject(disabled());
  }

  public generateNudge(
    _input: GenerateNudgeInput,
    _options?: AiProviderRequestOptions,
  ): Promise<AiProviderResult<AiNudgeCandidate>> {
    return Promise.reject(disabled());
  }

  public reviewContent(
    _input: ReviewContentInput,
    _options?: AiProviderRequestOptions,
  ): Promise<AiProviderResult<ContentReviewResult>> {
    return Promise.reject(disabled());
  }
}
