import {
  AI_PROMPT_REGISTRY,
  FakeAiProvider,
  ManualAiProvider,
  OpenAiProvider,
  aiModelRouterConfigFromEnv,
  calculateAiCostUsd,
  estimateMaximumAiCostUsd,
  routeAiModel,
  type AiAttemptEvaluationCandidate,
  type AiModelRouterConfig,
  type AiProvider,
  type AiTokenUsage,
  type EvaluateAttemptInput,
  type GenerateNudgeInput,
  type SupportedAiFeature,
} from '@skillforge/ai-provider';

import { aiRuntimeConfigFromEnvironment, type AiRuntimeConfig } from './ai-runtime-config.js';

export const AI_RUNTIME = Symbol('AI_RUNTIME');

const MAXIMUM_USAGE = Object.freeze({
  ATTEMPT_EVALUATION: { inputTokens: 12_000, outputTokens: 4_000 },
  NUDGE: { inputTokens: 8_000, outputTokens: 500 },
  CONTENT_REVIEW: { inputTokens: 16_000, outputTokens: 4_000 },
});

export type AiRuntime = {
  config: AiRuntimeConfig;
  provider: AiProvider;
  providerName: 'manual' | 'openai' | 'fake';
  models: AiModelRouterConfig;
  modelFor(feature: SupportedAiFeature): string;
  estimateMaximumCostUsd(feature: SupportedAiFeature): number;
  calculateCostUsd(usage: Readonly<AiTokenUsage>): number;
};

function answerHasSubstance(input: EvaluateAttemptInput): boolean {
  return Boolean(
    input.answer.text?.trim() ||
    input.answer.code?.trim() ||
    input.answer.selectedOptionIds.length > 0,
  );
}

function fakeEvaluation(input: EvaluateAttemptInput): AiAttemptEvaluationCandidate {
  const score = answerHasSubstance(input) ? 60 : 0;
  return {
    contract: 'skillforge-ai-attempt-evaluation-v1',
    attemptId: input.attemptId,
    taskStableKey: input.task.stableKey,
    taskVersion: input.task.version,
    score,
    passed: score >= 60,
    reliability: 0.5,
    dimensionScores: Object.fromEntries(
      input.task.allowedDimensions.map((dimension) => [dimension, score]),
    ),
    correctObservations: score > 0 ? ['Ответ содержит проверяемую попытку решения.'] : [],
    errors: score > 0 ? [] : ['Ответ не содержит достаточного материала для проверки.'],
    misconceptions: [],
    evidenceCandidates: input.task.allowedEvidenceKinds.map((kind) => ({
      topicKey: input.task.topicKey,
      kind,
      strength: score / 100,
      explanation: 'Детерминированный fake-provider результат для интеграционного теста.',
    })),
    coverage: {
      evaluatedDimensions: [...input.task.allowedDimensions],
      pendingDimensions: [],
      unsupportedDimensions: [],
      isFinal: true,
    },
    feedbackMarkdown:
      score > 0
        ? 'Fake-provider зафиксировал ограниченный результат для проверки workflow.'
        : 'Для проверки нужен непустой ответ.',
    warnings: ['FAKE_PROVIDER_RESULT'],
  };
}

function fakeNudge(input: GenerateNudgeInput): unknown {
  return {
    contract: 'skillforge-ai-nudge-v1',
    attemptId: input.attemptId,
    hintType: 'NUDGE',
    hint: 'Сформулируй один следующий маленький шаг и проверь его на простом примере.',
    revealsSolution: false,
    containsCodeSolution: false,
    warnings: ['FAKE_PROVIDER_RESULT'],
  };
}

function manualRuntime(config: AiRuntimeConfig, models: AiModelRouterConfig): AiRuntime {
  return {
    config,
    provider: new ManualAiProvider(),
    providerName: 'manual',
    models,
    modelFor: () => 'manual-disabled-v1',
    estimateMaximumCostUsd: () => 0,
    calculateCostUsd: () => 0,
  };
}

export function createAiRuntime(
  environment: Readonly<Record<string, string | undefined>>,
): AiRuntime {
  const config = aiRuntimeConfigFromEnvironment(environment);
  const models = aiModelRouterConfigFromEnv(environment);
  const anyFeatureEnabled = Object.values(config.features).some(Boolean);
  if (config.mode !== 'api-assisted' || !anyFeatureEnabled) {
    return manualRuntime(config, models);
  }

  let provider: AiProvider;
  let providerName: 'openai' | 'fake';
  if (config.provider === 'fake') {
    providerName = 'fake';
    provider = new FakeAiProvider({
      model: 'fake-deterministic-v1',
      resolvers: { attemptEvaluation: fakeEvaluation, nudge: fakeNudge },
    });
  } else {
    const apiKey = environment.OPENAI_API_KEY?.trim();
    if (!apiKey || config.pricing === null) {
      throw new Error('OpenAI runtime requires an API key and explicit pricing');
    }
    providerName = 'openai';
    provider = new OpenAiProvider({
      apiKey,
      ...(environment.OPENAI_PROJECT_ID?.trim()
        ? { projectId: environment.OPENAI_PROJECT_ID.trim() }
        : {}),
      ...(environment.OPENAI_ORGANIZATION_ID?.trim()
        ? { organizationId: environment.OPENAI_ORGANIZATION_ID.trim() }
        : {}),
      ...(environment.OPENAI_RESPONSES_ENDPOINT?.trim()
        ? { endpoint: environment.OPENAI_RESPONSES_ENDPOINT.trim() }
        : {}),
      models,
    });
  }

  return {
    config,
    provider,
    providerName,
    models,
    modelFor: (feature) =>
      providerName === 'fake' ? 'fake-deterministic-v1' : routeAiModel(feature, models),
    estimateMaximumCostUsd: (feature) =>
      config.pricing === null
        ? 0
        : estimateMaximumAiCostUsd(MAXIMUM_USAGE[feature], config.pricing),
    calculateCostUsd: (usage) =>
      config.pricing === null ? 0 : calculateAiCostUsd(usage, config.pricing),
  };
}

export function createAiRuntimeFromProcess(): AiRuntime {
  return createAiRuntime(process.env);
}

export const REGISTERED_AI_PROMPTS = AI_PROMPT_REGISTRY;
