import type { EvidenceKind, EvaluatorType, TaskKind } from '@skillforge/contracts';
import { describe, expect, it } from 'vitest';

import {
  computeTopicState,
  MASTERY_ALGORITHM_VERSION,
  normalizeEvidence,
  type TopicEvidenceInput,
} from '../src/index.js';

const BASE_DATE = '2026-01-01T10:00:00.000Z';

function evidence(
  overrides: Partial<TopicEvidenceInput> & {
    kind?: EvidenceKind;
    evaluatorType?: EvaluatorType;
    taskKind?: TaskKind;
  } = {},
): TopicEvidenceInput {
  return {
    id: 'evidence-1',
    attemptId: 'attempt-1',
    rawScore: 100,
    evaluatorType: 'TEST_RUNNER',
    evaluatorReliability: 1,
    kind: 'CODE_CORRECTNESS',
    helpLevel: 'NONE',
    occurredAt: BASE_DATE,
    halfLifeDays: 90,
    taskKind: 'CODE',
    difficulty: 'MEDIUM',
    passed: true,
    submitted: true,
    ...overrides,
  };
}

function masteryEvidence(): TopicEvidenceInput[] {
  return [
    evidence({
      id: 'e-1',
      attemptId: 'a-1',
      kind: 'CODE_CORRECTNESS',
      taskKind: 'CODE',
      occurredAt: '2026-01-01T10:00:00.000Z',
    }),
    evidence({
      id: 'e-2',
      attemptId: 'a-2',
      kind: 'BATTLE',
      taskKind: 'FIND_BUG',
      occurredAt: '2026-01-02T10:00:00.000Z',
    }),
    evidence({
      id: 'e-3',
      attemptId: 'a-3',
      kind: 'TRANSFER',
      taskKind: 'EXPLAIN',
      occurredAt: '2026-01-09T10:00:00.000Z',
    }),
  ];
}

describe('mastery-v1.0', () => {
  it('returns an honest unknown state for zero evidence', () => {
    expect(computeTopicState([])).toMatchObject({
      status: 'UNKNOWN',
      masteryEstimate: null,
      masteryConfidence: 0,
      evidenceCount: 0,
      algorithmVersion: MASTERY_ALGORITHM_VERSION,
    });
  });

  it('does not call one perfect score mastered', () => {
    const state = computeTopicState([evidence()]);
    expect(state.status).toBe('UNKNOWN');
    expect(state.masteryEstimate).toBeNull();
    expect(state.explanation.estimateBeforeSufficiencyGate).toBeGreaterThan(70);
  });

  it('applies the documented solution-viewed autonomy penalty', () => {
    expect(
      normalizeEvidence({
        rawScore: 100,
        evaluatorReliability: 1,
        evidenceTypeWeight: 1,
        helpLevel: 'SOLUTION_VIEWED',
        ageDays: 0,
        halfLifeDays: 90,
      }),
    ).toEqual({ normalizedScore: 40, weight: 1 });
  });

  it('requires varied, delayed and transfer evidence for MASTERED', () => {
    const mastered = computeTopicState(masteryEvidence(), { now: '2026-01-09T10:00:00.000Z' });
    expect(mastered.status).toBe('MASTERED');
    expect(mastered.masteryEstimate).toBeGreaterThanOrEqual(85);
    expect(mastered.masteryConfidence).toBeGreaterThanOrEqual(75);

    const noDelay = masteryEvidence().map((item, index) => ({
      ...item,
      occurredAt: `2026-01-0${index + 1}T10:00:00.000Z`,
    }));
    expect(computeTopicState(noDelay).status).not.toBe('MASTERED');

    const noVariety = masteryEvidence().map((item) => ({
      ...item,
      kind: 'CODE_CORRECTNESS' as const,
    }));
    expect(computeTopicState(noVariety).status).not.toBe('MASTERED');

    const nonTransferKinds = ['CODE_CORRECTNESS', 'DEBUGGING', 'EDGE_CASES'] as const;
    const noTransfer = masteryEvidence().map((item, index) => ({
      ...item,
      kind: nonTransferKinds[index] ?? 'EDGE_CASES',
    }));
    expect(computeTopicState(noTransfer).status).not.toBe('MASTERED');
  });

  it('turns time passage into needsReview without degrading mastery', () => {
    const original = computeTopicState(masteryEvidence(), { now: '2026-01-09T10:00:00.000Z' });
    const later = computeTopicState(masteryEvidence(), { now: '2026-06-01T10:00:00.000Z' });
    expect(original).toMatchObject({ status: 'MASTERED', needsReview: false });
    expect(later).toMatchObject({ status: 'MASTERED', needsReview: true });
    expect(later.masteryEstimate).toBe(original.masteryEstimate);
  });

  it('does not let advisory AI scores outweigh repeated deterministic basic failures', () => {
    const failures = [
      evidence({
        id: 'failure-1',
        attemptId: 'failure-attempt-1',
        rawScore: 0,
        passed: false,
        occurredAt: '2026-01-09T10:00:00.000Z',
      }),
      evidence({
        id: 'failure-2',
        attemptId: 'failure-attempt-2',
        rawScore: 0,
        passed: false,
        occurredAt: '2026-01-10T09:00:00.000Z',
      }),
    ];
    const aiEvidence = Array.from({ length: 20 }, (_, index) =>
      evidence({
        id: `ai-${index}`,
        attemptId: `ai-attempt-${index}`,
        evaluatorType: 'EXTERNAL_AI',
        evaluatorReliability: 0.65,
        kind: index % 2 === 0 ? 'EXPLANATION' : 'AI_REVIEW',
        taskKind: index % 2 === 0 ? 'EXPLAIN' : 'AI_REVIEW',
        occurredAt: '2026-01-10T10:00:00.000Z',
      }),
    );
    const state = computeTopicState([...failures, ...aiEvidence]);
    expect(state.explanation.estimateBeforeSufficiencyGate).toBeGreaterThan(70);
    expect(state.status).toBe('WEAK');
    expect(state.explanation.factors.recentDeterministicBasicFailureCount).toBe(2);
  });

  it('keeps all successful hinted work unstable', () => {
    const hinted = masteryEvidence().map((item) => ({
      ...item,
      rawScore: 100,
      helpLevel: 'HINT' as const,
    }));
    expect(computeTopicState(hinted).status).toBe('UNSTABLE');
  });

  it('rejects invalid normalization inputs instead of silently inventing evidence', () => {
    expect(() =>
      normalizeEvidence({
        rawScore: 101,
        evaluatorReliability: 1,
        evidenceTypeWeight: 1,
        helpLevel: 'NONE',
        ageDays: 0,
        halfLifeDays: 90,
      }),
    ).toThrow(RangeError);
  });

  it.each([
    {
      field: 'reliability',
      input: {
        rawScore: 50,
        evaluatorReliability: -0.1,
        evidenceTypeWeight: 1,
        helpLevel: 'NONE' as const,
        ageDays: 0,
        halfLifeDays: 90,
      },
    },
    {
      field: 'type weight',
      input: {
        rawScore: 50,
        evaluatorReliability: 1,
        evidenceTypeWeight: 2.1,
        helpLevel: 'NONE' as const,
        ageDays: 0,
        halfLifeDays: 90,
      },
    },
    {
      field: 'age',
      input: {
        rawScore: 50,
        evaluatorReliability: 1,
        evidenceTypeWeight: 1,
        helpLevel: 'NONE' as const,
        ageDays: -1,
        halfLifeDays: 90,
      },
    },
    {
      field: 'age finite',
      input: {
        rawScore: 50,
        evaluatorReliability: 1,
        evidenceTypeWeight: 1,
        helpLevel: 'NONE' as const,
        ageDays: Number.NaN,
        halfLifeDays: 90,
      },
    },
    {
      field: 'half-life',
      input: {
        rawScore: 50,
        evaluatorReliability: 1,
        evidenceTypeWeight: 1,
        helpLevel: 'NONE' as const,
        ageDays: 0,
        halfLifeDays: 0,
      },
    },
    {
      field: 'half-life finite',
      input: {
        rawScore: 50,
        evaluatorReliability: 1,
        evidenceTypeWeight: 1,
        helpLevel: 'NONE' as const,
        ageDays: 0,
        halfLifeDays: Number.POSITIVE_INFINITY,
      },
    },
  ])('rejects invalid $field boundaries', ({ input }) => {
    expect(() => normalizeEvidence(input)).toThrow(RangeError);
  });

  it('covers weak, unstable and solid gates without manual status assignment', () => {
    const weak = computeTopicState([
      evidence({ id: 'w1', attemptId: 'wa1', rawScore: 20, passed: false }),
      evidence({
        id: 'w2',
        attemptId: 'wa2',
        rawScore: 25,
        passed: false,
        evaluatorType: 'MANUAL',
      }),
    ]);
    expect(weak.status).toBe('WEAK');

    const oneKind = [0, 1, 2].map((day) =>
      evidence({
        id: `u${day}`,
        attemptId: `ua${day}`,
        kind: 'CODE_CORRECTNESS',
        taskKind: day % 2 === 0 ? 'CODE' : 'FIND_BUG',
        occurredAt: `2026-01-0${day + 1}T10:00:00.000Z`,
      }),
    );
    expect(computeTopicState(oneKind).status).toBe('UNSTABLE');

    const solid = [
      evidence({ id: 's1', attemptId: 'sa1', occurredAt: '2026-01-01T10:00:00.000Z' }),
      evidence({
        id: 's2',
        attemptId: 'sa2',
        kind: 'DEBUGGING',
        taskKind: 'FIND_BUG',
        occurredAt: '2026-01-02T10:00:00.000Z',
      }),
    ];
    expect(computeTopicState(solid).status).toBe('SOLID');
  });

  it('keeps unsubmitted drafts unknown and infers a partial review outcome', () => {
    const draftOnly = computeTopicState([
      evidence({ submitted: false, evaluatorReliability: 1, evidenceTypeWeight: 2 }),
    ]);
    expect(draftOnly.status).toBe('UNKNOWN');
    expect(draftOnly.evidenceCount).toBe(0);

    const partial = computeTopicState([
      evidence({ id: 'partial-1', attemptId: 'partial-a1', rawScore: 60, passed: null }),
      evidence({
        id: 'partial-2',
        attemptId: 'partial-a2',
        rawScore: 60,
        passed: null,
        occurredAt: '2026-01-02T10:00:00.000Z',
      }),
    ]);
    expect(partial.reviewSchedule?.reason).toContain('partial');
  });
});
