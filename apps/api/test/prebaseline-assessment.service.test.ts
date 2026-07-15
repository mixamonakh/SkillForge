import { describe, expect, it, vi } from 'vitest';

import type { PrismaService } from '../src/database/prisma.service.js';
import { PrebaselineAssessmentService } from '../src/modules/assessment/prebaseline-assessment.service.js';

const decision = {
  decision: 'NEXT_ITEM' as const,
  nextTaskVersionId: 'task-version',
  topicKey: 'js.values.types',
  primaryGap: 'TRACE' as const,
  recommendedPhase: 'ACQUISITION' as const,
  reasons: ['selected'],
  scoreBreakdown: { gapSeverity: 40 },
  dataSufficiency: 'LOW' as const,
};

const snapshot = {
  schemaVersion: '2.0' as const,
  kind: 'ADAPTIVE_PREBASELINE' as const,
  algorithmVersion: 'recommendation-v2.0' as const,
  blueprint: {
    key: 'js-prebaseline-v1' as const,
    version: 1,
    checksum: 'checksum',
    contentStatus: 'DRAFT' as const,
    reviewState: 'NEEDS_HUMAN_REVIEW' as const,
    estimatedMinutes: 29,
  },
  hardCaps: { items: 18 as const, minutes: 35 as const },
  candidatePool: [
    {
      taskVersionId: 'task-version',
      taskKey: 'js.values.types.trace-001',
      taskVersion: 1,
      topicKey: 'js.values.types',
      topicTitle: 'Примитивы и типы',
      prerequisiteTopicKeys: [],
      unlocksTopicKeys: [],
      blockIndex: 0,
      position: 0,
      required: false,
      taskKind: 'PREDICT_OUTPUT',
      difficulty: 'EASY' as const,
      primaryFamily: 'TRACE' as const,
      evidenceFamilies: ['TRACE' as const],
      familyKey: 'values.trace',
      misconceptionTags: ['values.trace-miss'],
      estimatedMinutes: 1,
      productionLoad: 'NONE' as const,
      targetRelevance: {},
    },
  ],
  selectedHistory: [
    {
      sequence: 1,
      taskVersionId: 'task-version',
      sessionItemId: 'session-item',
      selectedAt: '2026-07-15T10:00:00.000Z',
      decision,
    },
  ],
  decisionHistory: [
    {
      sequence: 1,
      decidedAt: '2026-07-15T10:00:00.000Z',
      decision,
    },
  ],
  timing: {
    startedAt: '2026-07-15T10:00:00.000Z',
    activeStartedAt: '2026-07-15T10:00:00.000Z',
    accumulatedActiveMs: 0,
  },
};

function runRecord() {
  return {
    id: 'run-id',
    status: 'ACTIVE',
    currentBlock: 0,
    currentPosition: 0,
    snapshot,
    blueprint: { title: 'Pre-baseline' },
    session: {
      id: 'session-id',
      items: [
        {
          id: 'session-item',
          sessionId: 'session-id',
          taskVersionId: 'task-version',
          position: 0,
          purpose: 'PREBASELINE',
          required: false,
          taskVersion: {
            version: 1,
            promptMarkdown: 'Что выведет код?',
            starterCode: null,
            language: null,
            options: null,
            rubric: { dimensions: { PREDICT_OUTPUT: 100 } },
            hints: [],
            testCases: [],
            task: {
              stableKey: 'js.values.types.trace-001',
              kind: 'PREDICT_OUTPUT',
              topic: { key: 'js.values.types', title: 'Примитивы и типы' },
            },
          },
          attempts: [
            {
              id: 'attempt-id',
              revision: 0,
              answerText: null,
              answerCode: null,
              selectedOptions: [],
              selfRating: null,
              confidence: null,
              helpLevel: 'NONE',
              hintsUsed: [],
              submittedAt: null,
              runnerOutput: null,
              evaluations: [],
            },
          ],
        },
      ],
    },
  };
}

describe('PrebaselineAssessmentService next', () => {
  it('returns the same unfinished item without creating another SessionItem or Attempt', async () => {
    const createItem = vi.fn();
    const createAttempt = vi.fn();
    const transaction = {
      assessmentRun: { findFirst: vi.fn().mockResolvedValue(runRecord()) },
      evaluation: { findMany: vi.fn().mockResolvedValue([]) },
      sessionItem: { create: createItem },
      attempt: { create: createAttempt },
    };
    type TransactionOperation = (value: typeof transaction) => Promise<unknown>;
    const database = {
      client: {
        $transaction: vi.fn((operation: TransactionOperation) => operation(transaction)),
      },
    } as unknown as PrismaService;
    const service = new PrebaselineAssessmentService(database);

    const first = await service.next('run-id');
    const second = await service.next('run-id');

    expect(first).toMatchObject({
      decision: 'NEXT_ITEM',
      item: { id: 'session-item' },
    });
    expect(first.explanation).toMatch(/незавершённый/iu);
    expect(second).toMatchObject({ item: { id: 'session-item' } });
    expect(createItem).not.toHaveBeenCalled();
    expect(createAttempt).not.toHaveBeenCalled();
  });
});
