import { describe, expect, it } from 'vitest';

import { aiRuntimeConfigFromEnvironment } from '../src/modules/ai/ai-runtime-config.js';

describe('AI runtime configuration', () => {
  it('keeps manual mode usable without key or pricing and defaults to a hard 10 USD ledger', () => {
    expect(aiRuntimeConfigFromEnvironment({})).toEqual({
      mode: 'manual',
      provider: 'openai',
      monthlyBudgetUsd: 10,
      features: { attemptEvaluation: false, contentReview: false, nudge: false },
      pricing: null,
      fakeProviderEnabled: false,
    });
  });

  it('fails closed when a paid feature lacks a key or explicit current pricing', () => {
    expect(() =>
      aiRuntimeConfigFromEnvironment({
        AI_MODE: 'api-assisted',
        AI_ATTEMPT_REVIEW_ENABLED: 'true',
      }),
    ).toThrow('OPENAI_API_KEY');
    expect(() =>
      aiRuntimeConfigFromEnvironment({
        AI_MODE: 'api-assisted',
        AI_ATTEMPT_REVIEW_ENABLED: 'true',
        OPENAI_API_KEY: 'test-only',
      }),
    ).toThrow('OPENAI_PRICE');
  });

  it('accepts complete paid configuration without inventing model prices', () => {
    expect(
      aiRuntimeConfigFromEnvironment({
        AI_MODE: 'api-assisted',
        AI_ATTEMPT_REVIEW_ENABLED: 'true',
        OPENAI_API_KEY: 'test-only',
        OPENAI_PRICE_INPUT_USD_PER_MILLION: '2.5',
        OPENAI_PRICE_CACHED_INPUT_USD_PER_MILLION: '0.5',
        OPENAI_PRICE_OUTPUT_USD_PER_MILLION: '10',
      }),
    ).toMatchObject({
      mode: 'api-assisted',
      pricing: {
        inputUsdPerMillionTokens: 2.5,
        cachedInputUsdPerMillionTokens: 0.5,
        outputUsdPerMillionTokens: 10,
      },
    });
  });

  it('requires explicit opt-in for the fake runtime provider', () => {
    expect(() =>
      aiRuntimeConfigFromEnvironment({ AI_MODE: 'api-assisted', AI_PROVIDER: 'fake' }),
    ).toThrow('AI_FAKE_PROVIDER_ENABLED');
    expect(
      aiRuntimeConfigFromEnvironment({
        AI_MODE: 'api-assisted',
        AI_PROVIDER: 'fake',
        AI_FAKE_PROVIDER_ENABLED: 'true',
      }),
    ).toMatchObject({ mode: 'api-assisted', provider: 'fake', fakeProviderEnabled: true });
  });

  it('rejects ambiguous booleans and partial pricing', () => {
    expect(() => aiRuntimeConfigFromEnvironment({ AI_NUDGE_ENABLED: 'yes' })).toThrow(
      'AI_NUDGE_ENABLED',
    );
    expect(() =>
      aiRuntimeConfigFromEnvironment({ OPENAI_PRICE_INPUT_USD_PER_MILLION: '2' }),
    ).toThrow('configured together');
  });
});
