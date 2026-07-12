import { describe, expect, it } from 'vitest';

import { createReviewSchedule, reviewIntervalForStatus } from '../src/index.js';

describe('review schedule v1', () => {
  it('uses a longer interval after independent success', () => {
    expect(
      createReviewSchedule({
        status: 'SOLID',
        lastEvidenceAt: '2026-01-01T00:00:00.000Z',
        outcome: 'success',
        helpLevel: 'NONE',
      }),
    ).toMatchObject({ intervalDays: 30, dueAt: '2026-01-31T00:00:00.000Z' });
  });

  it('does not interpret overload as a reason for an aggressive reduction', () => {
    const regular = createReviewSchedule({
      status: 'UNSTABLE',
      lastEvidenceAt: '2026-01-01T00:00:00.000Z',
      outcome: 'failure',
      helpLevel: 'NONE',
    });
    const overloaded = createReviewSchedule({
      status: 'UNSTABLE',
      lastEvidenceAt: '2026-01-01T00:00:00.000Z',
      outcome: 'failure',
      helpLevel: 'NONE',
      overloaded: true,
    });
    expect(regular?.intervalDays).toBe(2);
    expect(overloaded?.intervalDays).toBe(3);
    expect(reviewIntervalForStatus('UNKNOWN')).toBeNull();
  });
});
