import { describe, expect, it } from 'vitest';
import { summarizeAssessmentItems } from '@/features/assessment/assessment-results';
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
});
