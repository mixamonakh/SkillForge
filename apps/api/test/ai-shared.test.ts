import { describe, expect, it } from 'vitest';

import { ApiError } from '../src/common/api-error.js';
import type { AiRuntime } from '../src/modules/ai/ai-runtime.provider.js';
import {
  apiDatabaseSchema,
  assertAiFeature,
  currentAiPeriod,
  estimateInputReservation,
} from '../src/modules/ai/ai-shared.js';

function runtime(overrides: Partial<AiRuntime['config']> = {}): AiRuntime {
  return {
    config: {
      mode: 'manual',
      provider: 'openai',
      monthlyBudgetUsd: 10,
      features: { attemptEvaluation: false, contentReview: false, nudge: false },
      pricing: null,
      fakeProviderEnabled: false,
      ...overrides,
    },
    provider: {} as AiRuntime['provider'],
    providerName: 'manual',
    models: {} as AiRuntime['models'],
    modelFor: () => 'manual-disabled-v1',
    estimateMaximumCostUsd: () => 0,
    calculateCostUsd: (usage) => (usage.inputTokens + usage.outputTokens) / 1_000_000,
  };
}

describe('AI API shared invariants', () => {
  it('keeps manual mode as an explicit 503 fallback instead of requiring a key', () => {
    expect(() => assertAiFeature(runtime(), 'attemptEvaluation')).toThrow(ApiError);
    try {
      assertAiFeature(runtime(), 'attemptEvaluation');
    } catch (error) {
      expect(error).toMatchObject({
        code: 'AI_PROVIDER_DISABLED',
        details: { manualFallback: true, feature: 'attemptEvaluation' },
      });
    }
  });

  it('uses a conservative byte upper bound for paid reservation without returning the input', () => {
    const paid = runtime({
      mode: 'api-assisted',
      pricing: {
        inputUsdPerMillionTokens: 1,
        cachedInputUsdPerMillionTokens: 0.1,
        outputUsdPerMillionTokens: 1,
      },
    });
    expect(estimateInputReservation(paid, { answer: 'не логировать' }, 100)).toBeGreaterThan(0);
  });

  it('uses UTC budget periods and rejects unsafe schema identifiers', () => {
    expect(currentAiPeriod(new Date('2026-07-31T23:59:59.000Z'))).toBe('2026-07');
    const original = process.env.DATABASE_URL;
    process.env.DATABASE_URL = 'postgresql://localhost/db?schema=unsafe-name';
    expect(() => apiDatabaseSchema()).toThrow('invalid identifier');
    if (original === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = original;
  });
});
