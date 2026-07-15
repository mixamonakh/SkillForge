import type {
  AiAttemptEvaluationCandidate,
  AiNudgeCandidate,
  ContentReviewResult,
  EvaluateAttemptInput,
  GenerateNudgeInput,
  ReviewContentInput,
} from './contracts.js';
import {
  validateAttemptEvaluationCandidate,
  validateContentReviewResult,
  validateNudgeCandidate,
} from './domain-validation.js';
import {
  AiProviderError,
  type AiProvider,
  type AiProviderRequestOptions,
  type AiProviderResult,
  type AiTokenUsage,
} from './provider.js';

export interface FakeAiProviderFixtures {
  attemptEvaluations?: Readonly<Record<string, unknown>>;
  nudges?: Readonly<Record<string, unknown>>;
  contentReviews?: Readonly<Record<string, unknown>>;
}

export interface FakeAiProviderResolvers {
  attemptEvaluation?: (input: EvaluateAttemptInput) => unknown;
  nudge?: (input: GenerateNudgeInput) => unknown;
  contentReview?: (input: ReviewContentInput) => unknown;
}

export interface FakeAiProviderOptions {
  fixtures?: FakeAiProviderFixtures;
  resolvers?: FakeAiProviderResolvers;
  model?: string;
  usage?: AiTokenUsage;
  latencyMs?: number;
}

const ZERO_USAGE: AiTokenUsage = Object.freeze({
  inputTokens: 0,
  cachedInputTokens: 0,
  outputTokens: 0,
});

export class FakeAiProvider implements AiProvider {
  private readonly model: string;
  private readonly usage: AiTokenUsage;
  private readonly latencyMs: number;

  public constructor(private readonly options: FakeAiProviderOptions) {
    this.model = options.model ?? 'fake-deterministic-v1';
    this.usage = options.usage ?? ZERO_USAGE;
    this.latencyMs = options.latencyMs ?? 0;
  }

  public async evaluateAttempt(
    input: EvaluateAttemptInput,
    _options?: AiProviderRequestOptions,
  ): Promise<AiProviderResult<AiAttemptEvaluationCandidate>> {
    const raw = this.options.resolvers?.attemptEvaluation
      ? await this.options.resolvers.attemptEvaluation(input)
      : this.options.fixtures?.attemptEvaluations?.[input.attemptId];
    return this.result(validateAttemptEvaluationCandidate(input, this.requireFixture(raw)));
  }

  public async generateNudge(
    input: GenerateNudgeInput,
    _options?: AiProviderRequestOptions,
  ): Promise<AiProviderResult<AiNudgeCandidate>> {
    const raw = this.options.resolvers?.nudge
      ? await this.options.resolvers.nudge(input)
      : this.options.fixtures?.nudges?.[input.attemptId];
    return this.result(validateNudgeCandidate(input, this.requireFixture(raw)));
  }

  public async reviewContent(
    input: ReviewContentInput,
    _options?: AiProviderRequestOptions,
  ): Promise<AiProviderResult<ContentReviewResult>> {
    const raw = this.options.resolvers?.contentReview
      ? await this.options.resolvers.contentReview(input)
      : this.options.fixtures?.contentReviews?.[`${input.stableKey}@${String(input.version)}`];
    return this.result(validateContentReviewResult(input, this.requireFixture(raw)));
  }

  private requireFixture(fixture: unknown): unknown {
    if (fixture === undefined) {
      throw new AiProviderError(
        'AI_PROVIDER_FIXTURE_MISSING',
        'Fake provider fixture is not configured',
      );
    }
    return structuredClone(fixture);
  }

  private result<T>(candidate: T): AiProviderResult<T> {
    return {
      candidate,
      provider: 'fake',
      model: this.model,
      usage: { ...this.usage },
      latencyMs: this.latencyMs,
      providerRequestId: null,
    };
  }
}
