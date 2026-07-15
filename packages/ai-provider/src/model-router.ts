import type { SupportedAiFeature } from './provider.js';

export const DEFAULT_AI_MODELS = Object.freeze({
  attemptEvaluation: 'gpt-5.6-luna',
  contentReview: 'gpt-5.6-luna',
  nudge: 'gpt-5.6-luna',
  escalation: 'gpt-5.6-terra',
});

export interface AiModelRouterConfig {
  attemptEvaluation: string;
  contentReview: string;
  nudge: string;
  escalation: string;
}

function configuredModel(value: string | undefined, fallback: string): string {
  const normalized = value?.trim();
  return normalized ? normalized : fallback;
}

export function aiModelRouterConfigFromEnv(
  environment: Readonly<Record<string, string | undefined>>,
): AiModelRouterConfig {
  return {
    attemptEvaluation: configuredModel(
      environment.OPENAI_MODEL_ATTEMPT_EVALUATION,
      DEFAULT_AI_MODELS.attemptEvaluation,
    ),
    contentReview: configuredModel(
      environment.OPENAI_MODEL_CONTENT_REVIEW,
      DEFAULT_AI_MODELS.contentReview,
    ),
    nudge: configuredModel(environment.OPENAI_MODEL_NUDGE, DEFAULT_AI_MODELS.nudge),
    escalation: configuredModel(environment.OPENAI_MODEL_ESCALATION, DEFAULT_AI_MODELS.escalation),
  };
}

export function routeAiModel(
  feature: SupportedAiFeature,
  config: Readonly<AiModelRouterConfig>,
  escalate = false,
): string {
  if (escalate) return config.escalation;
  if (feature === 'ATTEMPT_EVALUATION') return config.attemptEvaluation;
  if (feature === 'CONTENT_REVIEW') return config.contentReview;
  return config.nudge;
}
