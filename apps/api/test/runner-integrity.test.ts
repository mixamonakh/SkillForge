import { describe, expect, it, vi } from 'vitest';

import { bindRunnerResult, currentRunnerResult } from '../src/common/bound-runner-result.js';
import type { PrismaService } from '../src/database/prisma.service.js';
import { AttemptAutosaveService } from '../src/modules/assessment/attempt-autosave.service.js';
import { AttemptEvaluationService } from '../src/modules/assessment/attempt-evaluation.service.js';
import type { MasteryService } from '../src/modules/mastery/mastery.service.js';

const runnerResult = {
  requestId: 'run-current',
  status: 'passed' as const,
  tests: [{ name: 'works', passed: true }],
  console: [],
  durationMs: 5,
};

const prebaselineSnapshot = {
  schemaVersion: '2.0',
  kind: 'ADAPTIVE_PREBASELINE',
  algorithmVersion: 'recommendation-v2.0',
  blueprint: {
    key: 'js-prebaseline-v1',
    version: 1,
    checksum: 'checksum',
    contentStatus: 'DRAFT',
    reviewState: 'NEEDS_HUMAN_REVIEW',
    estimatedMinutes: 29,
  },
  hardCaps: { items: 18, minutes: 35 },
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
      difficulty: 'EASY',
      primaryFamily: 'TRACE',
      evidenceFamilies: ['TRACE'],
      familyKey: 'values.trace',
      misconceptionTags: ['values.trace-miss'],
      estimatedMinutes: 1,
      productionLoad: 'NONE',
      targetRelevance: {},
    },
  ],
  selectedHistory: [],
  decisionHistory: [],
  timing: {
    startedAt: '2026-07-15T10:00:00.000Z',
    activeStartedAt: '2026-07-15T10:00:00.000Z',
    accumulatedActiveMs: 0,
  },
};

describe('CODE runner integrity', () => {
  it('accepts a bound result only for the source that was executed', () => {
    const bound = bindRunnerResult(runnerResult, 3, 'return 1;');

    expect(currentRunnerResult(bound, 'return 1;')).toEqual(runnerResult);
    expect(currentRunnerResult(bound, 'return 2;')).toBeNull();
    expect(currentRunnerResult(runnerResult, 'return 1;')).toBeNull();
  });

  it('does not submit or create fake failure evidence without a current result', async () => {
    const updateAttempt = vi.fn();
    const createEvaluation = vi.fn();
    const transaction = {
      attempt: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'attempt-code',
          userId: 'user',
          sessionId: 'session',
          sessionItemId: 'item',
          taskVersionId: 'task-version',
          submittedAt: null,
          evaluations: [],
          answerCode: 'return 1;',
          runnerOutput: null,
          session: { status: 'ACTIVE', assessmentRun: null },
          taskVersion: { task: { kind: 'CODE' } },
        }),
        update: updateAttempt,
      },
      evaluation: { create: createEvaluation },
    };
    type TransactionOperation = (value: typeof transaction) => Promise<unknown>;
    const database = {
      client: {
        $transaction: vi.fn((operation: TransactionOperation) => operation(transaction)),
      },
    } as unknown as PrismaService;
    const service = new AttemptEvaluationService(database, {} as MasteryService);

    const error = await service.submit('attempt-code').catch((reason: unknown) => reason);

    expect(error).toMatchObject({ code: 'CODE_RUN_REQUIRED' });
    expect(updateAttempt).not.toHaveBeenCalled();
    expect(createEvaluation).not.toHaveBeenCalled();
  });

  it('returns the same v2 projection when a submitted attempt is retried', async () => {
    const storedResult = {
      evaluatorType: 'EXACT_MATCH',
      evaluatorVersion: 'exact-match-v2.0',
      score: null,
      passed: null,
      dimensionScores: { PREDICT_OUTPUT: 0 },
      coverage: {
        evaluatedDimensions: ['PREDICT_OUTPUT'],
        pendingDimensions: ['EXPLANATION'],
        unsupportedDimensions: [],
        isFinal: false,
      },
      feedback: ['Локальная проверка завершена частично.'],
    };
    const submittedAt = new Date('2026-07-15T10:00:00.000Z');
    const transaction = {
      attempt: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'attempt-predict',
          revision: 2,
          answerText: 'wrong output with explanation',
          answerCode: null,
          selectedOptions: [],
          selfRating: null,
          confidence: null,
          helpLevel: 'NONE',
          hintsUsed: [],
          submittedAt,
          runnerOutput: null,
          evaluations: [
            {
              evaluatorType: 'EXACT_MATCH',
              evaluatorVersion: 'exact-match-v2.0',
              rawScore: 0,
              passed: null,
              dimensionScores: { PREDICT_OUTPUT: 0 },
              rubricResult: storedResult,
            },
          ],
          session: { status: 'ACTIVE', assessmentRun: null },
          taskVersion: {
            rubric: { dimensions: { PREDICT_OUTPUT: 70, EXPLANATION: 30 } },
            task: { kind: 'PREDICT_OUTPUT' },
          },
        }),
      },
    };
    type TransactionOperation = (value: typeof transaction) => Promise<unknown>;
    const database = {
      client: {
        $transaction: vi.fn((operation: TransactionOperation) => operation(transaction)),
      },
    } as unknown as PrismaService;
    const service = new AttemptEvaluationService(database, {} as MasteryService);

    const result = (await service.submit('attempt-predict')) as {
      attempt: { deterministicEvaluation: unknown };
      evaluation: unknown;
      pendingExternalReview: boolean;
    };

    expect(result.evaluation).toEqual(storedResult);
    expect(result.attempt.deterministicEvaluation).toEqual(storedResult);
    expect(result.pendingExternalReview).toBe(true);
  });

  it('keeps a retried free-text attempt pending without creating a zero evaluation', async () => {
    const transaction = {
      attempt: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'attempt-explain',
          revision: 1,
          answerText: 'Пользовательское объяснение',
          answerCode: null,
          selectedOptions: [],
          selfRating: null,
          confidence: null,
          helpLevel: 'NONE',
          hintsUsed: [],
          submittedAt: new Date('2026-07-15T10:30:00.000Z'),
          runnerOutput: null,
          evaluations: [],
          session: { status: 'ACTIVE', assessmentRun: null },
          taskVersion: {
            rubric: { dimensions: { EXPLANATION: 80, RECALL: 20 } },
            task: { kind: 'EXPLAIN' },
          },
        }),
      },
    };
    type TransactionOperation = (value: typeof transaction) => Promise<unknown>;
    const database = {
      client: {
        $transaction: vi.fn((operation: TransactionOperation) => operation(transaction)),
      },
    } as unknown as PrismaService;
    const service = new AttemptEvaluationService(database, {} as MasteryService);

    const result = (await service.submit('attempt-explain')) as {
      attempt: {
        evaluationCoverage: {
          evaluatedDimensions: string[];
          pendingDimensions: string[];
          isFinal: boolean;
        };
      };
      evaluation: unknown;
      pendingExternalReview: boolean;
    };

    expect(result).toMatchObject({
      attempt: {
        evaluationCoverage: {
          evaluatedDimensions: [],
          pendingDimensions: ['EXPLANATION', 'RECALL'],
          isFinal: false,
        },
      },
      evaluation: null,
      pendingExternalReview: true,
    });
  });

  it('persists partial exact-match coverage without an overall pass/fail verdict', async () => {
    const submittedAt = new Date('2026-07-15T11:00:00.000Z');
    const savedAttempt = {
      id: 'attempt-predict-new',
      revision: 1,
      answerText: 'wrong output with explanation',
      answerCode: null,
      selectedOptions: [],
      selfRating: null,
      confidence: null,
      helpLevel: 'NONE',
      hintsUsed: [],
      submittedAt,
      runnerOutput: null,
    };
    const createEvaluation = vi.fn().mockResolvedValue({
      id: 'evaluation-predict',
      evaluatorVersion: 'exact-match-v2.0',
    });
    const createEvidence = vi.fn().mockResolvedValue({ id: 'evidence-predict' });
    const transaction = {
      attempt: {
        findFirst: vi.fn().mockResolvedValue({
          ...savedAttempt,
          submittedAt: null,
          userId: 'user',
          sessionId: 'session',
          sessionItemId: 'item',
          taskVersionId: 'task-version',
          evaluations: [],
          session: { status: 'ACTIVE', assessmentRun: null },
          taskVersion: {
            expectedAnswer: { output: ['expected'] },
            rubric: { dimensions: { PREDICT_OUTPUT: 70, EXPLANATION: 30 } },
            task: {
              kind: 'PREDICT_OUTPUT',
              topic: { id: 'topic', defaultHalfLifeDays: 90 },
            },
          },
        }),
        update: vi.fn().mockResolvedValue(savedAttempt),
        findUniqueOrThrow: vi.fn().mockResolvedValue(savedAttempt),
      },
      evaluation: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: createEvaluation,
      },
      evidence: { create: createEvidence },
      learningSession: { update: vi.fn().mockResolvedValue({}) },
    };
    type TransactionOperation = (value: typeof transaction) => Promise<unknown>;
    const database = {
      client: {
        $transaction: vi.fn((operation: TransactionOperation) => operation(transaction)),
      },
    } as unknown as PrismaService;
    const mastery = {
      recomputeWithin: vi.fn().mockResolvedValue(undefined),
    } as unknown as MasteryService;
    const service = new AttemptEvaluationService(database, mastery);

    const result = (await service.submit('attempt-predict-new')) as {
      attempt: {
        evaluationCoverage: { pendingDimensions: string[]; isFinal: boolean };
        deterministicEvaluation: unknown;
      };
      evaluation: {
        score: number | null;
        passed: boolean | null;
        dimensionScores: Record<string, number>;
        coverage: { pendingDimensions: string[]; isFinal: boolean };
      };
      pendingExternalReview: boolean;
    };

    expect(createEvaluation).toHaveBeenCalledOnce();
    const persistedEvaluation = JSON.stringify(createEvaluation.mock.calls);
    expect(persistedEvaluation).toContain('"rawScore":0');
    expect(persistedEvaluation).toContain('"passed":null');
    expect(persistedEvaluation).toContain('"dimensionScores":{"PREDICT_OUTPUT":0}');
    expect(persistedEvaluation).toContain('"evaluatedDimensions":["PREDICT_OUTPUT"]');
    expect(persistedEvaluation).toContain('"pendingDimensions":["EXPLANATION"]');
    expect(persistedEvaluation).toContain('"isFinal":false');
    expect(createEvidence).toHaveBeenCalledOnce();
    expect(result).toMatchObject({
      evaluation: {
        score: null,
        passed: null,
        dimensionScores: { PREDICT_OUTPUT: 0 },
        coverage: { pendingDimensions: ['EXPLANATION'], isFinal: false },
      },
      attempt: {
        evaluationCoverage: { pendingDimensions: ['EXPLANATION'], isFinal: false },
      },
      pendingExternalReview: true,
    });
    expect(result.attempt.deterministicEvaluation).toEqual(result.evaluation);
  });

  it('stores a pre-baseline evaluation without Evidence or TopicState recompute', async () => {
    const submittedAt = new Date('2026-07-15T12:00:00.000Z');
    const savedAttempt = {
      id: 'attempt-prebaseline',
      revision: 1,
      answerText: 'wrong',
      answerCode: null,
      selectedOptions: [],
      selfRating: null,
      confidence: null,
      helpLevel: 'NONE',
      hintsUsed: [],
      submittedAt,
      runnerOutput: null,
    };
    const createEvaluation = vi.fn().mockResolvedValue({
      id: 'evaluation-prebaseline',
      evaluatorVersion: 'exact-match-v2.0',
    });
    const createEvidence = vi.fn();
    const recomputeWithin = vi.fn();
    const transaction = {
      attempt: {
        findFirst: vi.fn().mockResolvedValue({
          ...savedAttempt,
          submittedAt: null,
          userId: 'user',
          sessionId: 'session',
          sessionItemId: 'item',
          taskVersionId: 'task-version',
          evaluations: [],
          session: {
            status: 'ACTIVE',
            assessmentRun: { snapshot: prebaselineSnapshot },
          },
          sessionItem: { id: 'item' },
          taskVersion: {
            expectedAnswer: { output: ['expected'] },
            rubric: { dimensions: { PREDICT_OUTPUT: 100 } },
            task: {
              kind: 'PREDICT_OUTPUT',
              stableKey: 'js.values.types.trace-001',
              topic: { id: 'topic', title: 'Примитивы', defaultHalfLifeDays: 90 },
            },
          },
        }),
        update: vi.fn().mockResolvedValue(savedAttempt),
        findUniqueOrThrow: vi.fn().mockResolvedValue(savedAttempt),
      },
      evaluation: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: createEvaluation,
      },
      evidence: { create: createEvidence },
      learningSession: { update: vi.fn().mockResolvedValue({}) },
      assessmentRun: { update: vi.fn().mockResolvedValue({}) },
    };
    type TransactionOperation = (value: typeof transaction) => Promise<unknown>;
    const database = {
      client: {
        $transaction: vi.fn((operation: TransactionOperation) => operation(transaction)),
      },
    } as unknown as PrismaService;
    const mastery = { recomputeWithin } as unknown as MasteryService;
    const service = new AttemptEvaluationService(database, mastery);

    const result = (await service.submit('attempt-prebaseline')) as {
      evaluation: { score: number | null; passed: boolean | null };
    };

    expect(createEvaluation).toHaveBeenCalledOnce();
    expect(result.evaluation).toMatchObject({ score: 0, passed: false });
    expect(createEvidence).not.toHaveBeenCalled();
    expect(recomputeWithin).not.toHaveBeenCalled();
  });

  it('rejects a worker result when autosave wins the revision race', async () => {
    const database = {
      client: {
        attempt: {
          findFirst: vi.fn().mockResolvedValue({
            id: 'attempt-code',
            revision: 4,
            answerCode: 'return 1;',
            submittedAt: null,
            taskVersion: { task: { kind: 'CODE' } },
          }),
          updateMany: vi.fn().mockResolvedValue({ count: 0 }),
          findUnique: vi.fn().mockResolvedValue({ revision: 5 }),
        },
      },
    } as unknown as PrismaService;
    const service = new AttemptEvaluationService(database, {} as MasteryService);

    const error = await service
      .persistRunnerResult('attempt-code', 4, runnerResult)
      .catch((reason: unknown) => reason);

    expect(error).toMatchObject({
      code: 'RUNNER_REVISION_CONFLICT',
      details: { expectedRevision: 5, receivedRevision: 4 },
    });
  });

  it('clears persisted runner output when answerCode changes', async () => {
    const current = {
      id: 'attempt-code',
      revision: 2,
      sequence: 1,
      answerText: null,
      answerCode: 'return 1;',
      selectedOptions: [],
      selfRating: null,
      confidence: null,
      helpLevel: 'NONE',
      hintsUsed: [],
      submittedAt: null,
      runnerOutput: bindRunnerResult(runnerResult, 2, 'return 1;'),
    };
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const transaction = {
      sessionItem: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'item',
          taskVersionId: 'task-version',
          attempts: [current],
        }),
      },
      attempt: {
        updateMany,
        findUniqueOrThrow: vi.fn().mockResolvedValue({
          ...current,
          revision: 3,
          answerCode: 'return 2;',
          runnerOutput: null,
        }),
      },
    };
    type TransactionOperation = (value: typeof transaction) => Promise<unknown>;
    const database = {
      client: {
        $transaction: vi.fn((operation: TransactionOperation) => operation(transaction)),
      },
    } as unknown as PrismaService;
    const service = new AttemptAutosaveService(database);

    await service.autosave('session', 'item', {
      revision: 2,
      answerText: null,
      answerCode: 'return 2;',
      selectedOptions: [],
      selfRating: null,
      confidence: null,
      helpLevel: 'NONE',
      hintsUsed: [],
      clientUpdatedAt: new Date().toISOString(),
    });

    expect(updateMany).toHaveBeenCalledOnce();
    expect(JSON.stringify(updateMany.mock.calls)).toContain('runnerOutput');
  });
});
