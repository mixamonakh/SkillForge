import { describe, expect, it, vi } from 'vitest';

import type { PrismaService } from '../src/database/prisma.service.js';
import {
  isPrebaselineV2ImportSnapshot,
  suppressedExternalEvaluationEffect,
} from '../src/modules/import-export/external-evaluation-policy.js';
import { ImportApplyService } from '../src/modules/import-export/import-apply.service.js';
import { ImportPreviewService } from '../src/modules/import-export/import-preview.service.js';
import type { MasteryService } from '../src/modules/mastery/mastery.service.js';

const ATTEMPT_ID = '00000000-0000-4000-8000-000000000011';
const BUNDLE_ID = '00000000-0000-4000-8000-000000000012';
const IMPORT_ID = '00000000-0000-4000-8000-000000000013';
const TOPIC_ID = '00000000-0000-4000-8000-000000000014';
const TOPIC_KEY = 'js.values.types';
const PREBASELINE_MARKER = {
  schemaVersion: '2.0',
  kind: 'ADAPTIVE_PREBASELINE',
};

function analysis() {
  return {
    schemaVersion: '1.0',
    contract: 'skillforge-analysis-v1',
    sourceBundleId: BUNDLE_ID,
    evaluator: {
      kind: 'external-ai',
      model: 'fake-evaluator',
      analyzedAt: '2026-07-15T10:00:00.000Z',
    },
    attemptEvaluations: [
      {
        attemptId: ATTEMPT_ID,
        overallScore: 25,
        passed: false,
        reliability: 0.6,
        dimensions: { TRACE: 25 },
        feedbackMarkdown: 'Audit feedback.',
        misconceptions: [],
        topicEvidence: [{ topicKey: TOPIC_KEY, kind: 'PREDICT_OUTPUT', score: 25 }],
      },
    ],
    recommendations: [],
    summary: 'Pre-baseline audit only.',
    warnings: [],
  };
}

function sourcePayload() {
  return {
    schemaVersion: '1.0',
    bundleId: BUNDLE_ID,
    generatedAt: '2026-07-15T09:59:00.000Z',
    appVersion: '1.0.0',
    bundleType: 'assessment-run',
    user: { displayName: 'Test', targetTrack: 'frontend', locale: 'ru' },
    scope: { id: '00000000-0000-4000-8000-000000000010' },
    topics: [
      {
        key: TOPIC_KEY,
        status: 'UNKNOWN',
        masteryEstimate: null,
        masteryConfidence: 0,
        evidenceCount: 0,
      },
    ],
    attempts: [
      {
        attemptId: ATTEMPT_ID,
        taskKey: 'js.values.types.trace-001',
        taskVersion: 1,
        topicKey: TOPIC_KEY,
        taskKind: 'PREDICT_OUTPUT',
        prompt: 'Что выведет код?',
        answerText: 'Не знаю',
        answerCode: null,
        selfRating: null,
        confidence: null,
        helpLevel: 'NONE',
        deterministicEvaluation: null,
      },
    ],
    requestedAnalysis: {
      contract: 'skillforge-analysis-v1',
      language: 'ru',
      instructions: ['Evaluate for audit.'],
    },
  };
}

function matchedAttempt() {
  return {
    id: ATTEMPT_ID,
    helpLevel: 'NONE',
    submittedAt: new Date('2026-07-15T09:58:00.000Z'),
    taskVersion: {
      task: {
        kind: 'PREDICT_OUTPUT',
        difficulty: 'EASY',
        topic: { id: TOPIC_ID, key: TOPIC_KEY },
      },
    },
    session: { assessmentRun: { snapshot: PREBASELINE_MARKER } },
  };
}

describe('external evaluator pre-baseline policy', () => {
  it('fails closed for the immutable v2 marker and exposes an explicit no-mutation effect', () => {
    expect(isPrebaselineV2ImportSnapshot(PREBASELINE_MARKER)).toBe(true);
    expect(
      isPrebaselineV2ImportSnapshot({ schemaVersion: '1.0', kind: 'ADAPTIVE_PREBASELINE' }),
    ).toBe(false);
    expect(
      suppressedExternalEvaluationEffect({
        attemptId: ATTEMPT_ID,
        assessmentSnapshot: PREBASELINE_MARKER,
        requestedEvidenceItems: 1,
      }),
    ).toEqual({
      attemptId: ATTEMPT_ID,
      reason: 'PREBASELINE_ROUTING_ONLY',
      evaluationAction: 'CREATE_AUDIT_RECORD',
      evidenceAction: 'SUPPRESSED',
      topicStateAction: 'NO_MUTATION',
      masteryAction: 'NO_MUTATION',
      requestedEvidenceItems: 1,
    });
  });

  it('preview suppresses projections while retaining the external Evaluation audit plan', async () => {
    const updateInputs: unknown[] = [];
    const update = vi.fn((input: unknown) => {
      updateInputs.push(input);
      return Promise.resolve({});
    });
    const transaction = {};
    const database = {
      client: {
        importBatch: {
          findFirst: vi.fn().mockResolvedValue({
            id: IMPORT_ID,
            status: 'VALIDATED',
            preview: null,
            normalized: analysis(),
          }),
          update,
        },
        exportBundle: { findFirst: vi.fn().mockResolvedValue({ payload: sourcePayload() }) },
        attempt: { findMany: vi.fn().mockResolvedValue([matchedAttempt()]) },
        topic: {
          findMany: vi.fn().mockResolvedValue([
            {
              id: TOPIC_ID,
              key: TOPIC_KEY,
              title: 'Типы',
              defaultHalfLifeDays: 14,
              topicStates: [],
            },
          ]),
        },
        $transaction: vi.fn((callback: (client: typeof transaction) => Promise<unknown>) =>
          callback(transaction),
        ),
      },
    } as unknown as PrismaService;
    const projectWithin = vi.fn();
    const mastery = { projectWithin } as unknown as MasteryService;

    const result = await new ImportPreviewService(database, mastery).preview(IMPORT_ID);

    expect(result).toMatchObject({
      matchedAttempts: 1,
      evaluationsToCreate: 1,
      evidenceToCreate: 0,
      projectedTopics: [],
      suppressedEvaluationEffects: [
        {
          attemptId: ATTEMPT_ID,
          evaluationAction: 'CREATE_AUDIT_RECORD',
          evidenceAction: 'SUPPRESSED',
          topicStateAction: 'NO_MUTATION',
          masteryAction: 'NO_MUTATION',
        },
      ],
    });
    expect(JSON.stringify(result)).toContain('Evidence SUPPRESSED');
    expect(projectWithin).not.toHaveBeenCalled();
    expect(updateInputs[0]).toMatchObject({
      where: { id: IMPORT_ID },
      data: { status: 'PREVIEWED' },
    });
  });

  it('apply creates only the audit Evaluation and skips all knowledge-state writes', async () => {
    const evaluationCreateInputs: unknown[] = [];
    const createEvaluation = vi.fn((input: unknown) => {
      evaluationCreateInputs.push(input);
      return Promise.resolve({ id: 'evaluation-id' });
    });
    const createEvidence = vi.fn();
    const transaction = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: IMPORT_ID }]),
      importBatch: {
        findFirst: vi.fn().mockResolvedValue({
          id: IMPORT_ID,
          status: 'PREVIEWED',
          normalized: analysis(),
        }),
        update: vi.fn().mockResolvedValue({}),
      },
      exportBundle: { findFirst: vi.fn().mockResolvedValue({ payload: sourcePayload() }) },
      attempt: { findMany: vi.fn().mockResolvedValue([matchedAttempt()]) },
      topic: {
        findMany: vi
          .fn()
          .mockResolvedValue([{ id: TOPIC_ID, key: TOPIC_KEY, defaultHalfLifeDays: 14 }]),
      },
      evaluation: { create: createEvaluation },
      evidence: { create: createEvidence },
    };
    const database = {
      client: {
        $transaction: vi.fn((callback: (client: typeof transaction) => Promise<unknown>) =>
          callback(transaction),
        ),
      },
    } as unknown as PrismaService;
    const recomputeWithin = vi.fn();
    const snapshotWithin = vi.fn();
    const mastery = { recomputeWithin, snapshotWithin } as unknown as MasteryService;

    const result = await new ImportApplyService(database, mastery).apply(IMPORT_ID);

    expect(result).toMatchObject({
      status: 'APPLIED',
      evaluationsCreated: 1,
      evidenceCreated: 0,
      affectedTopics: 0,
      suppressedEvaluationEffects: [
        {
          attemptId: ATTEMPT_ID,
          evidenceAction: 'SUPPRESSED',
          topicStateAction: 'NO_MUTATION',
          masteryAction: 'NO_MUTATION',
        },
      ],
    });
    expect(createEvaluation).toHaveBeenCalledOnce();
    expect(evaluationCreateInputs[0]).toMatchObject({
      data: {
        attemptId: ATTEMPT_ID,
        evaluatorType: 'EXTERNAL_AI',
        rubricResult: { evidencePolicy: { evidenceAction: 'SUPPRESSED' } },
      },
    });
    expect(createEvidence).not.toHaveBeenCalled();
    expect(recomputeWithin).not.toHaveBeenCalled();
    expect(snapshotWithin).not.toHaveBeenCalled();
  });

  it('rolls back an audit-only batch without creating a mastery snapshot', async () => {
    const transaction = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: IMPORT_ID }]),
      importBatch: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce({
            id: IMPORT_ID,
            status: 'APPLIED',
            appliedAt: new Date('2026-07-15T10:00:00.000Z'),
            validationErrors: null,
          })
          .mockResolvedValueOnce(null),
        update: vi.fn().mockResolvedValue({}),
      },
      evidence: {
        findMany: vi.fn().mockResolvedValue([]),
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      evaluation: { deleteMany: vi.fn().mockResolvedValue({ count: 1 }) },
    };
    const database = {
      client: {
        $transaction: vi.fn((callback: (client: typeof transaction) => Promise<unknown>) =>
          callback(transaction),
        ),
      },
    } as unknown as PrismaService;
    const recomputeWithin = vi.fn();
    const snapshotWithin = vi.fn();
    const mastery = { recomputeWithin, snapshotWithin } as unknown as MasteryService;

    const result = await new ImportApplyService(database, mastery).rollback(IMPORT_ID);

    expect(result).toMatchObject({ rolledBack: true, affectedTopics: 0, idempotent: false });
    expect(transaction.evaluation.deleteMany).toHaveBeenCalledWith({
      where: { importBatchId: IMPORT_ID },
    });
    expect(recomputeWithin).not.toHaveBeenCalled();
    expect(snapshotWithin).not.toHaveBeenCalled();
  });
});
