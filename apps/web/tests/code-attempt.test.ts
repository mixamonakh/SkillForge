import { describe, expect, it, vi } from 'vitest';

import {
  ensureCurrentCodeResult,
  runnerResultAfterCodeChange,
} from '@/features/runner/code-attempt';
import type { RunnerResult, TaskItem } from '@/shared/api/types';

const result: RunnerResult = {
  requestId: 'run-1',
  status: 'passed',
  tests: [{ name: 'works', passed: true }],
  console: [],
  durationMs: 4,
};

const item: TaskItem = {
  id: 'item-code',
  position: 0,
  blockIndex: 0,
  purpose: 'ASSESSMENT',
  task: {
    stableKey: 'js.code-001',
    version: 1,
    topicKey: 'js.code',
    topicTitle: 'Code',
    kind: 'CODE',
    promptMarkdown: 'Write code',
    starterCode: '',
    language: 'javascript',
    options: [],
    hints: [],
    visibleTests: [{ name: 'works' }],
    runnerHarness: 'test("works", () => assert.equal(value, 1));',
  },
  attempt: null,
};

describe('current CODE result orchestration', () => {
  it('automatically runs and persists current code when submit has no result', async () => {
    const run = vi.fn().mockResolvedValue(result);
    const persistResult = vi.fn().mockResolvedValue(undefined);
    const attempt = { id: 'attempt-code', revision: 7 };

    await expect(
      ensureCurrentCodeResult(
        {
          item,
          source: 'const value = 1;',
          attempt,
          requestId: 'run-1',
          currentResult: null,
        },
        { run, persistResult },
      ),
    ).resolves.toEqual(result);

    expect(run).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: 'run-1', source: 'const value = 1;' }),
    );
    expect(persistResult).toHaveBeenCalledWith(attempt, result);
  });

  it('clears the displayed result only when code changes', () => {
    expect(runnerResultAfterCodeChange(result, 'same', 'same')).toBe(result);
    expect(runnerResultAfterCodeChange(result, 'before', 'after')).toBeNull();
  });
});
