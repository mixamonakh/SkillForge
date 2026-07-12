import { describe, expect, it } from 'vitest';

import {
  calculateRecommendationPriority,
  recommendPrimarySession,
  type RecommendationCandidate,
} from '../src/index.js';

const candidate: RecommendationCandidate = {
  topicKey: 'js.async.promise',
  sessionMode: 'TRAINING',
  targetWeight: 100,
  weaknessScore: 80,
  prerequisiteUnlockValue: 60,
  reviewDueScore: 40,
  repeatedMistakeScore: 20,
  criticalPrerequisitesMet: true,
  reason: 'Тема блокирует async/await',
};

describe('recommendation engine v1', () => {
  it('uses the specified priority formula', () => {
    expect(calculateRecommendationPriority(candidate)).toBe(70);
  });

  it('filters blocked critical prerequisites and returns one primary recommendation', () => {
    const blocked = {
      ...candidate,
      topicKey: 'js.async.advanced',
      targetWeight: 1_000,
      criticalPrerequisitesMet: false,
    };
    expect(recommendPrimarySession([blocked, candidate])).toMatchObject({
      topicKey: 'js.async.promise',
      priority: 70,
    });
  });

  it('uses return after a pause and minimal load after overload', () => {
    expect(
      recommendPrimarySession([candidate], { daysSinceLastSession: 10, resumeThresholdDays: 7 }),
    ).toMatchObject({ sessionMode: 'RETURN', loadMode: 'RETURN' });
    expect(recommendPrimarySession([candidate], { loadFeedback: 'overload' })).toMatchObject({
      sessionMode: 'TRAINING',
      loadMode: 'MINIMAL',
    });
  });

  it('returns null when no prerequisite-safe candidate exists', () => {
    expect(recommendPrimarySession([])).toBeNull();
    expect(recommendPrimarySession([{ ...candidate, criticalPrerequisitesMet: false }])).toBeNull();
  });

  it('honours a matching user mode, selected load and stable topic-key tie break', () => {
    const review = { ...candidate, topicKey: 'js.a', sessionMode: 'REVIEW' as const };
    const training = { ...candidate, topicKey: 'js.z' };
    expect(
      recommendPrimarySession([training, review], {
        userSelectedMode: 'REVIEW',
        selectedLoadMode: 'DEEP',
      }),
    ).toMatchObject({
      topicKey: 'js.a',
      sessionMode: 'REVIEW',
      loadMode: 'DEEP',
    });
    expect(
      recommendPrimarySession([training, review], { userSelectedMode: 'INTERVIEW' }),
    ).toMatchObject({ topicKey: 'js.a' });
  });

  it.each(['heavy', 'HARD', 'overloaded', ' OVERLOAD '])(
    'normalizes %s feedback to minimal load',
    (loadFeedback) => {
      expect(recommendPrimarySession([candidate], { loadFeedback })).toMatchObject({
        loadMode: 'MINIMAL',
      });
    },
  );

  it('keeps normal load below the resume threshold or with blank feedback', () => {
    expect(
      recommendPrimarySession([candidate], {
        daysSinceLastSession: 6,
        resumeThresholdDays: 7,
        loadFeedback: ' ',
      }),
    ).toMatchObject({
      sessionMode: 'TRAINING',
      loadMode: 'NORMAL',
    });
    expect(recommendPrimarySession([candidate], { daysSinceLastSession: null })).toMatchObject({
      sessionMode: 'TRAINING',
    });
  });

  it.each([
    'targetWeight',
    'weaknessScore',
    'prerequisiteUnlockValue',
    'reviewDueScore',
    'repeatedMistakeScore',
  ] as const)('rejects invalid %s factors', (key) => {
    expect(() => calculateRecommendationPriority({ ...candidate, [key]: -1 })).toThrow(RangeError);
  });
});
