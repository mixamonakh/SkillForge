import type { CapabilityFamily, CapabilityState } from '@skillforge/learning-engine';
import { describe, expect, it, vi } from 'vitest';

import type { PrismaService } from '../src/database/prisma.service.js';
import type { CapabilityProjectionService } from '../src/modules/capability/capability-projection.service.js';
import type { CurriculumService } from '../src/modules/curriculum/curriculum.service.js';
import {
  primaryCapabilityGap,
  recommendationCandidateForTopic,
  repeatedMistakeScores,
  SessionRecommendationService,
} from '../src/modules/sessions/session-recommendation.service.js';

function capabilityState(
  family: CapabilityFamily,
  overrides: Partial<CapabilityState> = {},
): CapabilityState {
  return {
    family,
    coverage: 'SUFFICIENT',
    estimate: 80,
    confidence: 70,
    evidenceCount: 2,
    independentDays: 2,
    noHelpSuccessCount: 1,
    pendingReviewCount: 0,
    lastEvidenceAt: '2026-07-01T00:00:00.000Z',
    explanation: [],
    ...overrides,
  };
}

function capabilityProfile() {
  return {
    topicKey: 'js.references',
    algorithmVersion: 'capability-profile-v1.0',
    capabilities: {
      TERM: capabilityState('TERM'),
      MECHANISM: capabilityState('MECHANISM'),
      TRACE: capabilityState('TRACE', {
        coverage: 'NOT_TESTED',
        estimate: null,
        confidence: 0,
        evidenceCount: 0,
        independentDays: 0,
        noHelpSuccessCount: 0,
        lastEvidenceAt: null,
      }),
      DEBUG: capabilityState('DEBUG'),
      CODE_PRODUCTION: capabilityState('CODE_PRODUCTION'),
      TRANSFER: capabilityState('TRANSFER'),
      CALIBRATION: capabilityState('CALIBRATION'),
    },
  } as const;
}

describe('session recommendation misconception signal', () => {
  it('stays zero for a single finding and rises only for a repeated misconception', () => {
    const scores = repeatedMistakeScores([
      { misconceptionId: 'closures-scope', topicIds: ['topic-a'] },
      { misconceptionId: 'different-error', topicIds: ['topic-a'] },
      { misconceptionId: 'closures-scope', topicIds: ['topic-a', 'topic-a'] },
    ]);

    expect(scores.get('topic-a')).toBe(50);
  });

  it('caps the normalized factor and keeps topics independent', () => {
    const occurrences = Array.from({ length: 6 }, () => ({
      misconceptionId: 'same-error',
      topicIds: ['topic-a'],
    }));
    occurrences.push({ misconceptionId: 'single', topicIds: ['topic-b'] });

    const scores = repeatedMistakeScores(occurrences);
    expect(scores.get('topic-a')).toBe(100);
    expect(scores.get('topic-b')).toBe(0);
  });
});

describe('session recommendation v2 projection', () => {
  it('selects a learning capability gap without treating CALIBRATION as a session target', () => {
    const profile = capabilityProfile();
    expect(primaryCapabilityGap(profile)).toMatchObject({
      family: 'TRACE',
      coverage: 'NOT_TESTED',
    });

    const candidate = recommendationCandidateForTopic(
      {
        key: 'js.references',
        title: 'Ссылки и объекты',
        status: 'UNKNOWN',
        needsReview: false,
        criticalPrerequisitesMet: true,
        prerequisiteUnlock: 20,
        targetRelevance: 40,
        repeatedMistakeScore: 0,
        recentExposureCount: 0,
        profile,
      },
      { loadMode: 'NORMAL', returnDue: false },
    );

    expect(candidate).toMatchObject({
      candidateKey: 'js.references.trace.acquisition',
      capabilityGap: 'TRACE',
      learningPhase: 'ACQUISITION',
      recommendedFamilyKey: 'js.references.trace',
      estimatedMinutes: 50,
      missingFamily: true,
      diversity: 10,
      recentExposurePenalty: 0,
    });
  });

  it('penalizes repeated recent exposure deterministically', () => {
    const input = {
      key: 'js.references',
      title: 'Ссылки и объекты',
      status: 'WEAK',
      needsReview: false,
      criticalPrerequisitesMet: true,
      prerequisiteUnlock: 0,
      targetRelevance: 10,
      repeatedMistakeScore: 0,
      recentExposureCount: 3,
      profile: capabilityProfile(),
    };
    const first = recommendationCandidateForTopic(input, {
      loadMode: 'MINIMAL',
      returnDue: false,
    });
    const second = recommendationCandidateForTopic(input, {
      loadMode: 'MINIMAL',
      returnDue: false,
    });

    expect(first).toEqual(second);
    expect(first).toMatchObject({
      diversity: 0,
      redundancyPenalty: 30,
      recentExposurePenalty: 30,
    });
  });

  it('returns the canonical v2 fields and no fabricated mastery/readiness score', async () => {
    const database = {
      client: {
        topic: {
          findMany: vi.fn().mockResolvedValue([
            {
              id: 'topic-id',
              key: 'js.references',
              title: 'Ссылки и объекты',
              metadata: { yandexRelevance: 2 },
              topicStates: [],
              prerequisites: [],
              _count: { dependents: 1 },
              learningSequences: [
                {
                  id: 'sequence-id',
                  key: 'js.references.acquisition-v1',
                  version: 1,
                  topicId: 'topic-id',
                  schemaVersion: '1.0',
                  phase: 'ACQUISITION',
                  estimatedMinutes: 20,
                  steps: [
                    {
                      kind: 'TASK',
                      taskKey: 'js.references.predict-basic-001',
                      version: 1,
                      purpose: 'PREDICT',
                    },
                  ],
                  completionRule: { requiredSteps: 1, minimumNoHelpSuccesses: 1 },
                  sourcePack: 'js-core-v1',
                  sourceVersion: '1.0.0',
                  checksum: 'sequence-checksum',
                  createdAt: new Date('2026-07-01T00:00:00.000Z'),
                },
              ],
              tasks: [
                {
                  stableKey: 'js.references.predict-basic-001',
                  versions: [
                    {
                      version: 1,
                      sourcePack: 'js-core-v1',
                      sourceVersion: '1.0.0',
                    },
                  ],
                },
              ],
              contentItems: [],
            },
          ]),
        },
        learningSession: { findMany: vi.fn().mockResolvedValue([]) },
        userSettings: {
          findUnique: vi.fn().mockResolvedValue({
            defaultLoadMode: 'NORMAL',
            resumeThresholdDays: 7,
          }),
        },
        evaluationMisconception: { findMany: vi.fn().mockResolvedValue([]) },
        contentPack: {
          findMany: vi.fn().mockResolvedValue([{ key: 'js-core-v1', version: '1.0.0' }]),
        },
      },
    } as unknown as PrismaService;
    const curriculum = {
      topics: vi.fn().mockResolvedValue([{ key: 'js.references', title: 'Ссылки и объекты' }]),
    } as unknown as CurriculumService;
    const capability = {
      userSummary: vi.fn().mockResolvedValue({ topics: [capabilityProfile()] }),
    } as unknown as CapabilityProjectionService;
    const service = new SessionRecommendationService(database, curriculum, capability);

    const first = await service.recommendation();
    const second = await service.recommendation();

    expect(first).toEqual(second);
    expect(first).toMatchObject({
      algorithmVersion: 'recommendation-v2.0',
      topicKey: 'js.references',
      capabilityGap: 'TRACE',
      learningPhase: 'ACQUISITION',
      recommendedFamilyKey: 'js.references.trace',
      mode: 'TRAINING',
      loadMode: 'NORMAL',
      sequenceKey: 'js.references.acquisition-v1',
      estimatedMinutes: 20,
      completionTarget: 'Обязательных steps: 1; успешных ответов без подсказки: 1.',
      evidenceNeeded: ['Первое явно сопоставленное evidence: чтение хода выполнения'],
      scoreBreakdown: {
        gapSeverity: 70,
        missingFamily: 20,
        prerequisiteUnlock: 20,
        targetRelevance: 40,
        reviewDue: 0,
        diversity: 10,
        overloadPenalty: 0,
      },
    });
    const scoreBreakdown = (
      first as {
        scoreBreakdown: { redundancyPenalty: number; recentExposurePenalty: number };
      }
    ).scoreBreakdown;
    expect(Math.abs(scoreBreakdown.redundancyPenalty)).toBe(0);
    expect(Math.abs(scoreBreakdown.recentExposurePenalty)).toBe(0);
    expect(first).not.toHaveProperty('mastery');
    expect(first).not.toHaveProperty('readiness');
    expect(first).not.toHaveProperty('score');
  });

  it('does not recommend a sequence whose exact source pack version is not ACTIVE', async () => {
    const database = {
      client: {
        topic: {
          findMany: vi.fn().mockResolvedValue([
            {
              id: 'topic-id',
              key: 'js.references',
              title: 'Ссылки и объекты',
              metadata: { yandexRelevance: 2 },
              topicStates: [],
              prerequisites: [],
              _count: { dependents: 1 },
              learningSequences: [
                {
                  id: 'draft-sequence-id',
                  key: 'js.references.acquisition-v1',
                  version: 1,
                  topicId: 'topic-id',
                  schemaVersion: '1.0',
                  phase: 'ACQUISITION',
                  estimatedMinutes: 20,
                  steps: [
                    {
                      kind: 'TASK',
                      taskKey: 'js.references.predict-basic-001',
                      version: 1,
                      purpose: 'PREDICT',
                    },
                  ],
                  completionRule: { requiredSteps: 1, minimumNoHelpSuccesses: 1 },
                  sourcePack: 'js-core-draft',
                  sourceVersion: '1.0.0',
                  checksum: 'draft-sequence-checksum',
                  createdAt: new Date('2026-07-01T00:00:00.000Z'),
                },
              ],
              tasks: [],
              contentItems: [],
            },
          ]),
        },
        learningSession: { findMany: vi.fn().mockResolvedValue([]) },
        userSettings: {
          findUnique: vi.fn().mockResolvedValue({
            defaultLoadMode: 'NORMAL',
            resumeThresholdDays: 7,
          }),
        },
        evaluationMisconception: { findMany: vi.fn().mockResolvedValue([]) },
        contentPack: {
          findMany: vi.fn().mockResolvedValue([{ key: 'js-core-draft', version: '0.9.0' }]),
        },
      },
    } as unknown as PrismaService;
    const curriculum = {
      topics: vi.fn().mockResolvedValue([{ key: 'js.references', title: 'Ссылки и объекты' }]),
    } as unknown as CurriculumService;
    const capability = {
      userSummary: vi.fn().mockResolvedValue({ topics: [capabilityProfile()] }),
    } as unknown as CapabilityProjectionService;

    const recommendation = await new SessionRecommendationService(
      database,
      curriculum,
      capability,
    ).recommendation();

    expect(recommendation).toMatchObject({ topic: { key: 'js.references' }, mode: 'TRAINING' });
    expect(recommendation).not.toHaveProperty('sequenceKey');
    expect(recommendation).not.toHaveProperty('algorithmVersion', 'recommendation-v2.0');
  });
});
