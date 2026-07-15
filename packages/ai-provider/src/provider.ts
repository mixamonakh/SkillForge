import type {
  AiAttemptEvaluationCandidate,
  AiNudgeCandidate,
  ContentReviewResult,
  EvaluateAttemptInput,
  GenerateNudgeInput,
  ReviewContentInput,
} from './contracts.js';

export type AiFeature =
  | 'ATTEMPT_EVALUATION'
  | 'NUDGE'
  | 'CONTENT_REVIEW'
  | 'MISCONCEPTION_SYNTHESIS';

export type SupportedAiFeature = Exclude<AiFeature, 'MISCONCEPTION_SYNTHESIS'>;

export interface AiTokenUsage {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
}

export interface AiProviderResult<T> {
  candidate: T;
  provider: string;
  model: string;
  usage: AiTokenUsage;
  latencyMs: number;
  providerRequestId: string | null;
}

export interface AiProviderRequestOptions {
  model?: string;
  escalate?: boolean;
  signal?: AbortSignal;
}

export interface AiProvider {
  evaluateAttempt(
    input: EvaluateAttemptInput,
    options?: AiProviderRequestOptions,
  ): Promise<AiProviderResult<AiAttemptEvaluationCandidate>>;

  generateNudge(
    input: GenerateNudgeInput,
    options?: AiProviderRequestOptions,
  ): Promise<AiProviderResult<AiNudgeCandidate>>;

  reviewContent(
    input: ReviewContentInput,
    options?: AiProviderRequestOptions,
  ): Promise<AiProviderResult<ContentReviewResult>>;
}

export type AiProviderErrorCode =
  | 'AI_PROVIDER_DISABLED'
  | 'AI_PROVIDER_KEY_MISSING'
  | 'AI_PROVIDER_TIMEOUT'
  | 'AI_PROVIDER_HTTP_ERROR'
  | 'AI_PROVIDER_RESPONSE_INVALID'
  | 'AI_PROVIDER_DOMAIN_INVALID'
  | 'AI_PROVIDER_FIXTURE_MISSING';

export class AiProviderError extends Error {
  public constructor(
    public readonly code: AiProviderErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'AiProviderError';
  }
}
