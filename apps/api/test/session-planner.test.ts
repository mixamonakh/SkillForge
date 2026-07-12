import { describe, expect, it } from 'vitest';

import {
  purposeForTaskKind,
  selectSessionTasks,
  type SessionTaskCandidate,
} from '../src/modules/sessions/session-planner.js';

const candidates: SessionTaskCandidate[] = [
  {
    id: 'choice',
    stableKey: 'task.choice',
    kind: 'SINGLE_CHOICE',
    difficulty: 'EASY',
    language: null,
  },
  {
    id: 'explain',
    stableKey: 'task.explain',
    kind: 'EXPLAIN',
    difficulty: 'MEDIUM',
    language: null,
  },
  {
    id: 'predict',
    stableKey: 'task.predict',
    kind: 'PREDICT_OUTPUT',
    difficulty: 'EASY',
    language: null,
  },
  { id: 'debug', stableKey: 'task.debug', kind: 'FIND_BUG', difficulty: 'MEDIUM', language: null },
  {
    id: 'code-js',
    stableKey: 'task.code-js',
    kind: 'CODE',
    difficulty: 'MEDIUM',
    language: 'javascript',
  },
  {
    id: 'code-ts',
    stableKey: 'task.code-ts',
    kind: 'CODE',
    difficulty: 'MEDIUM',
    language: 'typescript',
  },
  {
    id: 'compare',
    stableKey: 'task.compare',
    kind: 'COMPARE_SOLUTIONS',
    difficulty: 'HARD',
    language: null,
  },
];

describe('session planner', () => {
  it('builds different deterministic sequences for training, review and return', () => {
    const base = { loadMode: 'NORMAL' as const, codeLanguage: 'javascript' as const };
    const training = selectSessionTasks(candidates, { ...base, mode: 'TRAINING' });
    const review = selectSessionTasks(candidates, { ...base, mode: 'REVIEW' });
    const returning = selectSessionTasks(candidates, { ...base, mode: 'RETURN' });

    expect(training.map((item) => item.task.id)).not.toEqual(review.map((item) => item.task.id));
    expect(returning).toHaveLength(2);
    expect(returning[0]?.purpose).toBe('retrieval');
    expect(returning.map((item) => item.task.id)).toEqual(['choice', 'debug']);
    expect(['FIND_BUG', 'CODE']).toContain(returning[1]?.task.kind);
    expect(returning[1]?.task.kind).not.toBe('EXPLAIN');
  });

  it('does not substitute an explanation when return application content is missing', () => {
    const returning = selectSessionTasks(
      candidates.filter((candidate) => ['choice', 'explain'].includes(candidate.id)),
      { mode: 'RETURN', loadMode: 'RETURN', codeLanguage: 'javascript' },
    );

    expect(returning.map((item) => item.task.id)).toEqual(['choice']);
  });

  it('keeps purpose aligned with actual task kind and prefers requested code language', () => {
    const planned = selectSessionTasks(candidates, {
      mode: 'INTERVIEW',
      loadMode: 'DEEP',
      codeLanguage: 'typescript',
    });
    for (const item of planned) expect(item.purpose).toBe(purposeForTaskKind(item.task.kind));
    expect(planned.find((item) => item.task.kind === 'CODE')?.task.id).toBe('code-ts');
  });
});
