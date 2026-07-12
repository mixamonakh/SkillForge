import { describe, expect, it } from 'vitest';

import {
  choiceScore,
  exactOutputScore,
  pendingExternalReview,
  runnerScore,
} from '../src/modules/assessment/deterministic-evaluation.js';

describe('deterministic assessment evaluation', () => {
  it('compares choice sets independently of order', () => {
    expect(choiceScore(['b', 'a'], { correctOptions: ['a', 'b'] })).toBe(100);
    expect(choiceScore(['a'], { correctOptions: ['a', 'b'] })).toBe(0);
  });

  it('normalizes fenced and enumerated output without fuzzy matching', () => {
    expect(exactOutputScore('```text\n1. alpha\n2. beta\n```', { output: ['alpha', 'beta'] })).toBe(
      100,
    );
    expect(exactOutputScore('alpha\ngamma', { output: ['alpha', 'beta'] })).toBe(0);
  });

  it('derives runner score only from protocol test results', () => {
    expect(
      runnerScore({
        requestId: 'run-1',
        status: 'failed',
        tests: [
          { name: 'one', passed: true },
          { name: 'two', passed: false },
        ],
        console: [],
        durationMs: 4,
      }),
    ).toBe(50);
    expect(
      runnerScore({
        requestId: 'run-2',
        status: 'timeout',
        tests: [],
        console: [],
        durationMs: 2_000,
      }),
    ).toBe(0);
  });

  it('keeps a predict-output explanation pending after deterministic output checking', () => {
    expect(pendingExternalReview('PREDICT_OUTPUT')).toBe(true);
    expect(pendingExternalReview('SINGLE_CHOICE')).toBe(false);
  });
});
