import { describe, expect, it } from 'vitest';
import {
  deterministicResultLabel,
  summarizeAssessmentItems,
} from '@/features/assessment/assessment-results';
import type { TaskItem, TaskKind } from '@/shared/api/types';

function item(kind: TaskKind): TaskItem {
  return {
    id: `item-${kind}`,
    position: 0,
    blockIndex: 0,
    purpose: 'ASSESSMENT',
    task: {
      stableKey: `task-${kind}`,
      version: 1,
      topicKey: 'js.topic',
      topicTitle: 'Topic',
      kind,
      promptMarkdown: 'Prompt',
      starterCode: null,
      language: null,
      options: [],
      hints: [],
      visibleTests: [],
      runnerHarness: null,
    },
    attempt: null,
  };
}

describe('assessment result summary', () => {
  it('counts predict-output as both deterministic and pending external review', () => {
    const predictOutput = item('PREDICT_OUTPUT');
    const summary = summarizeAssessmentItems([
      predictOutput,
      item('CODE'),
      item('EXPLAIN'),
      item('SINGLE_CHOICE'),
    ]);

    expect(summary.deterministicCount).toBe(3);
    expect(summary.pendingItems).toEqual([
      predictOutput,
      expect.objectContaining({ id: 'item-EXPLAIN' }),
    ]);
  });

  it('shows a dimension score as partial instead of an overall failed result', () => {
    const predictOutput = item('PREDICT_OUTPUT');
    predictOutput.attempt = {
      id: 'attempt-predict',
      revision: 1,
      answerText: 'wrong output with a useful explanation',
      answerCode: null,
      selectedOptions: [],
      selfRating: null,
      confidence: null,
      helpLevel: 'NONE',
      hintsUsed: [],
      submittedAt: '2026-07-15T00:00:00.000Z',
      runnerOutput: null,
      evaluationCoverage: {
        evaluatedDimensions: ['PREDICT_OUTPUT'],
        pendingDimensions: ['EXPLANATION'],
        unsupportedDimensions: [],
        isFinal: false,
      },
      deterministicEvaluation: {
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
      },
    };

    expect(deterministicResultLabel(predictOutput)).toBe(
      'вывод программы: 0 / 100 · проверено частично',
    );
  });

  it('uses projected coverage instead of task-kind heuristics when no review is pending', () => {
    const predictOutput = item('PREDICT_OUTPUT');
    predictOutput.attempt = {
      id: 'attempt-final',
      revision: 1,
      answerText: 'ok',
      answerCode: null,
      selectedOptions: [],
      selfRating: null,
      confidence: null,
      helpLevel: 'NONE',
      hintsUsed: [],
      submittedAt: '2026-07-15T00:00:00.000Z',
      runnerOutput: null,
      evaluationCoverage: {
        evaluatedDimensions: ['PREDICT_OUTPUT'],
        pendingDimensions: [],
        unsupportedDimensions: [],
        isFinal: true,
      },
      deterministicEvaluation: {
        evaluatorType: 'EXACT_MATCH',
        evaluatorVersion: 'exact-match-v2.0',
        score: 100,
        passed: true,
        dimensionScores: { PREDICT_OUTPUT: 100 },
        coverage: {
          evaluatedDimensions: ['PREDICT_OUTPUT'],
          pendingDimensions: [],
          unsupportedDimensions: [],
          isFinal: true,
        },
        feedback: ['Локальная проверка завершена.'],
      },
    };

    expect(summarizeAssessmentItems([predictOutput]).pendingItems).toEqual([]);
  });
});
