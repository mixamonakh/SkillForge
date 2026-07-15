import type { AiTokenUsage } from './provider.js';

export interface AiModelPricing {
  inputUsdPerMillionTokens: number;
  cachedInputUsdPerMillionTokens: number;
  outputUsdPerMillionTokens: number;
}

export interface AiMaximumUsage {
  inputTokens: number;
  outputTokens: number;
}

function assertNonNegativeFinite(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${label} must be a finite non-negative number`);
  }
}

function assertTokenCount(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${label} must be a non-negative integer`);
  }
}

function validatePricing(pricing: Readonly<AiModelPricing>): void {
  assertNonNegativeFinite(pricing.inputUsdPerMillionTokens, 'inputUsdPerMillionTokens');
  assertNonNegativeFinite(pricing.cachedInputUsdPerMillionTokens, 'cachedInputUsdPerMillionTokens');
  assertNonNegativeFinite(pricing.outputUsdPerMillionTokens, 'outputUsdPerMillionTokens');
}

function roundUsd(value: number): number {
  return Math.round((value + Number.EPSILON) * 1_000_000) / 1_000_000;
}

export function calculateAiCostUsd(
  usage: Readonly<AiTokenUsage>,
  pricing: Readonly<AiModelPricing>,
): number {
  validatePricing(pricing);
  assertTokenCount(usage.inputTokens, 'inputTokens');
  assertTokenCount(usage.cachedInputTokens, 'cachedInputTokens');
  assertTokenCount(usage.outputTokens, 'outputTokens');
  if (usage.cachedInputTokens > usage.inputTokens) {
    throw new RangeError('cachedInputTokens cannot exceed inputTokens');
  }
  const regularInputTokens = usage.inputTokens - usage.cachedInputTokens;
  return roundUsd(
    (regularInputTokens * pricing.inputUsdPerMillionTokens +
      usage.cachedInputTokens * pricing.cachedInputUsdPerMillionTokens +
      usage.outputTokens * pricing.outputUsdPerMillionTokens) /
      1_000_000,
  );
}

export function estimateMaximumAiCostUsd(
  maximum: Readonly<AiMaximumUsage>,
  pricing: Readonly<AiModelPricing>,
): number {
  assertTokenCount(maximum.inputTokens, 'inputTokens');
  assertTokenCount(maximum.outputTokens, 'outputTokens');
  return calculateAiCostUsd(
    {
      inputTokens: maximum.inputTokens,
      cachedInputTokens: 0,
      outputTokens: maximum.outputTokens,
    },
    pricing,
  );
}
