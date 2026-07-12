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
