import type { AiModelPricing } from '@skillforge/ai-provider';

export type AiRuntimeMode = 'manual' | 'api-assisted';
export type AiRuntimeProvider = 'openai' | 'fake';

export type AiRuntimeConfig = {
  mode: AiRuntimeMode;
  provider: AiRuntimeProvider;
  monthlyBudgetUsd: number;
  features: {
    attemptEvaluation: boolean;
    contentReview: boolean;
    nudge: boolean;
  };
  pricing: AiModelPricing | null;
  fakeProviderEnabled: boolean;
};

function enumValue<T extends string>(
  value: string | undefined,
  fallback: T,
  allowed: readonly T[],
  name: string,
): T {
  const normalized = value?.trim() || fallback;
  if (!allowed.includes(normalized as T)) {
    throw new Error(`${name} must be one of: ${allowed.join(', ')}`);
  }
  return normalized as T;
}

function booleanValue(value: string | undefined, fallback: boolean, name: string): boolean {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return fallback;
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  throw new Error(`${name} must be true or false`);
}

function decimalValue(
  value: string | undefined,
  fallback: number,
  name: string,
  maximum: number,
): number {
  const normalized = value?.trim();
  const parsed = normalized ? Number(normalized) : fallback;
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > maximum) {
    throw new Error(`${name} must be a finite number between 0 and ${String(maximum)}`);
  }
  return parsed;
}

function pricingFromEnvironment(
  environment: Readonly<Record<string, string | undefined>>,
): AiModelPricing | null {
  const raw = [
    environment.OPENAI_PRICE_INPUT_USD_PER_MILLION,
    environment.OPENAI_PRICE_CACHED_INPUT_USD_PER_MILLION,
    environment.OPENAI_PRICE_OUTPUT_USD_PER_MILLION,
  ];
  if (raw.every((value) => !value?.trim())) return null;
  if (raw.some((value) => !value?.trim())) {
    throw new Error('All three OPENAI_PRICE_* variables must be configured together');
  }
  const pricing = {
    inputUsdPerMillionTokens: decimalValue(raw[0], 0, 'OPENAI_PRICE_INPUT_USD_PER_MILLION', 10_000),
    cachedInputUsdPerMillionTokens: decimalValue(
      raw[1],
      0,
      'OPENAI_PRICE_CACHED_INPUT_USD_PER_MILLION',
      10_000,
    ),
    outputUsdPerMillionTokens: decimalValue(
      raw[2],
      0,
      'OPENAI_PRICE_OUTPUT_USD_PER_MILLION',
      10_000,
    ),
  };
  if (pricing.inputUsdPerMillionTokens === 0 || pricing.outputUsdPerMillionTokens === 0) {
    throw new Error('OpenAI input/output pricing must be positive for conservative reservation');
  }
  return pricing;
}

export function aiRuntimeConfigFromEnvironment(
  environment: Readonly<Record<string, string | undefined>>,
): AiRuntimeConfig {
  const mode = enumValue(environment.AI_MODE, 'manual', ['manual', 'api-assisted'], 'AI_MODE');
  const provider = enumValue(environment.AI_PROVIDER, 'openai', ['openai', 'fake'], 'AI_PROVIDER');
  const features = {
    attemptEvaluation: booleanValue(
      environment.AI_ATTEMPT_REVIEW_ENABLED,
      false,
      'AI_ATTEMPT_REVIEW_ENABLED',
    ),
    contentReview: booleanValue(
      environment.AI_CONTENT_REVIEW_ENABLED,
      false,
      'AI_CONTENT_REVIEW_ENABLED',
    ),
    nudge: booleanValue(environment.AI_NUDGE_ENABLED, false, 'AI_NUDGE_ENABLED'),
  };
  const anyFeatureEnabled = Object.values(features).some(Boolean);
  const pricing = pricingFromEnvironment(environment);
  const fakeProviderEnabled = booleanValue(
    environment.AI_FAKE_PROVIDER_ENABLED,
    false,
    'AI_FAKE_PROVIDER_ENABLED',
  );
  if (mode === 'api-assisted' && anyFeatureEnabled && provider === 'openai') {
    if (!environment.OPENAI_API_KEY?.trim()) {
      throw new Error('OPENAI_API_KEY is required when an API-assisted OpenAI feature is enabled');
    }
    if (pricing === null) {
      throw new Error('Explicit OPENAI_PRICE_* values are required for hard budget reservation');
    }
  }
  if (mode === 'api-assisted' && provider === 'fake' && !fakeProviderEnabled) {
    throw new Error('AI_PROVIDER=fake requires explicit AI_FAKE_PROVIDER_ENABLED=true');
  }
  return {
    mode,
    provider,
    monthlyBudgetUsd: decimalValue(
      environment.AI_MONTHLY_BUDGET_USD,
      10,
      'AI_MONTHLY_BUDGET_USD',
      1_000_000,
    ),
    features,
    pricing,
    fakeProviderEnabled,
  };
}
