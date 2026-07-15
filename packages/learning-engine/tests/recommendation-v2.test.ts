import { describe, expect, it } from 'vitest';

import {
  calculateRecommendationV2Score,
  recommendNextV2,
  RECOMMENDATION_V2_ALGORITHM_VERSION,
  type RecommendationV2Candidate,
} from '../src/index.js';

function candidate(overrides: Partial<RecommendationV2Candidate> = {}): RecommendationV2Candidate {
  return {
    candidateKey: 'js.references.trace-route',
    topicKey: 'js.references',
    capabilityGap: 'TRACE',
    learningPhase: 'ACQUISITION',
    recommendedFamilyKey: 'js.references.trace',
    criticalPrerequisitesMet: true,
    loadMode: 'NORMAL',
    sequenceKey: 'js.references.acquisition-v1',
    estimatedMinutes: 20,
    title: 'Ссылки и объекты: trace',
    reason: 'Нужно подтвердить чтение кода до самостоятельного production.',
    evidenceNeeded: ['Два независимых trace signal'],
    completionTarget: 'Завершить sequence и получить один no-help success.',
    gapSeverity: 40,
    missingFamily: true,
    prerequisiteUnlock: 10,
    targetRelevance: 8,
    reviewDue: 5,
    diversity: 4,
    redundancyPenalty: 3,
    overloadPenalty: 15,
    recentExposurePenalty: 2,
    ...overrides,
  };
}

describe('recommendation-v2.0 scoring', () => {
  it('returns an explainable additive breakdown with all required factors', () => {
    expect(calculateRecommendationV2Score(candidate(), { loadFeedback: 'NORMAL' })).toEqual({
      total: 82,
      breakdown: {
        gapSeverity: 40,
        missingFamily: 20,
        prerequisiteUnlock: 10,
        targetRelevance: 8,
        reviewDue: 5,
        diversity: 4,
        redundancyPenalty: -3,
        overloadPenalty: 0,
        recentExposurePenalty: -2,
      },
    });
  });

  it('activates the supplied overload penalty and switches to minimal load', () => {
    const result = recommendNextV2([candidate()], { loadFeedback: 'OVERLOAD' });

    expect(result).toMatchObject({
      algorithmVersion: RECOMMENDATION_V2_ALGORITHM_VERSION,
      loadMode: 'MINIMAL',
      scoreBreakdown: { overloadPenalty: -15 },
    });
    expect(calculateRecommendationV2Score(candidate(), { loadFeedback: 'OVERLOAD' }).total).toBe(
      67,
    );
  });

  it('normalizes zero penalties to positive numeric zero', () => {
    const result = calculateRecommendationV2Score(
      candidate({ redundancyPenalty: 0, overloadPenalty: 0, recentExposurePenalty: 0 }),
      { loadFeedback: 'OVERLOAD' },
    );

    expect(Object.is(result.breakdown.redundancyPenalty, -0)).toBe(false);
    expect(Object.is(result.breakdown.overloadPenalty, -0)).toBe(false);
    expect(Object.is(result.breakdown.recentExposurePenalty, -0)).toBe(false);
  });

  it('selects prerequisite unlock value without bypassing prerequisite gates', () => {
    const lowUnlock = candidate({
      candidateKey: 'js.a-low-unlock',
      topicKey: 'js.a',
      prerequisiteUnlock: 1,
    });
    const highUnlock = candidate({
      candidateKey: 'js.b-high-unlock',
      topicKey: 'js.b',
      prerequisiteUnlock: 30,
    });
    const blocked = candidate({
      candidateKey: 'js.c-blocked',
      topicKey: 'js.c',
      prerequisiteUnlock: 1_000,
      criticalPrerequisitesMet: false,
    });

    expect(
      recommendNextV2([blocked, lowUnlock, highUnlock], { loadFeedback: 'NORMAL' }),
    ).toMatchObject({ topicKey: 'js.b' });
    expect(recommendNextV2([blocked], { loadFeedback: 'NORMAL' })).toBeNull();
  });

  it('does not bombard the same gap when redundancy and recent exposure remove its value', () => {
    const repeated = candidate({
      candidateKey: 'js.a-repeated-trace',
      topicKey: 'js.repeated',
      redundancyPenalty: 35,
      recentExposurePenalty: 25,
    });
    const diverse = candidate({
      candidateKey: 'js.b-diverse-debug',
      topicKey: 'js.diverse',
      capabilityGap: 'DEBUG',
      recommendedFamilyKey: 'js.references.debug',
      gapSeverity: 25,
      missingFamily: false,
      diversity: 20,
      redundancyPenalty: 0,
      recentExposurePenalty: 0,
    });

    expect(recommendNextV2([repeated, diverse], { loadFeedback: 'NORMAL' })).toMatchObject({
      topicKey: 'js.diverse',
      capabilityGap: 'DEBUG',
    });
  });

  it('uses the stable candidate machine key as deterministic tie-break', () => {
    const a = candidate({ candidateKey: 'candidate.a', topicKey: 'js.a' });
    const z = candidate({ candidateKey: 'candidate.z', topicKey: 'js.z' });
    const first = recommendNextV2([z, a], { loadFeedback: 'NORMAL' });
    const second = recommendNextV2([a, z], { loadFeedback: 'NORMAL' });

    expect(first).toEqual(second);
    expect(first?.topicKey).toBe('js.a');
  });

  it('returns the bounded learning target without inventing mastery/readiness', () => {
    expect(recommendNextV2([candidate()], { loadFeedback: 'NORMAL' })).toEqual({
      algorithmVersion: 'recommendation-v2.0',
      topicKey: 'js.references',
      capabilityGap: 'TRACE',
      learningPhase: 'ACQUISITION',
      recommendedFamilyKey: 'js.references.trace',
      loadMode: 'NORMAL',
      sequenceKey: 'js.references.acquisition-v1',
      estimatedMinutes: 20,
      title: 'Ссылки и объекты: trace',
      reason: 'Нужно подтвердить чтение кода до самостоятельного production.',
      evidenceNeeded: ['Два независимых trace signal'],
      completionTarget: 'Завершить sequence и получить один no-help success.',
      scoreBreakdown: {
        gapSeverity: 40,
        missingFamily: 20,
        prerequisiteUnlock: 10,
        targetRelevance: 8,
        reviewDue: 5,
        diversity: 4,
        redundancyPenalty: -3,
        overloadPenalty: 0,
        recentExposurePenalty: -2,
      },
    });
  });

  it('rejects invalid factors and unstable keys', () => {
    expect(() =>
      calculateRecommendationV2Score(candidate({ reviewDue: -1 }), { loadFeedback: 'NORMAL' }),
    ).toThrow(RangeError);
    expect(() =>
      recommendNextV2([candidate({ candidateKey: 'Русский заголовок' })], {
        loadFeedback: 'NORMAL',
      }),
    ).toThrow(RangeError);
    expect(() =>
      calculateRecommendationV2Score(candidate(), {
        loadFeedback: 'UNKNOWN' as 'NORMAL',
      }),
    ).toThrow(RangeError);
  });
});
