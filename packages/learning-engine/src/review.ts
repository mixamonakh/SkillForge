import type { TopicStatus } from '@skillforge/contracts';

import { REVIEW_ALGORITHM_VERSION, REVIEW_BASE_INTERVAL_DAYS } from './config.js';
import { addUtcDays, toDate } from './math.js';
import type { ReviewScheduleInput, ReviewScheduleResult } from './types.js';

export function createReviewSchedule(input: ReviewScheduleInput): ReviewScheduleResult | null {
  const baseInterval = REVIEW_BASE_INTERVAL_DAYS[input.status];
  if (baseInterval === undefined || input.status === 'UNKNOWN') return null;

  let multiplier = 1;
  let reason: ReviewScheduleResult['reason'] = 'partial-attempt';
  if (input.outcome === 'success' && input.helpLevel === 'NONE') {
    multiplier = 1.5;
    reason = 'successful-independent-attempt';
  } else if (input.outcome === 'failure') {
    multiplier = input.overloaded === true ? 0.75 : 0.5;
    reason = input.overloaded === true ? 'failed-overloaded-attempt' : 'failed-attempt';
  }

  const intervalDays = Math.max(1, Math.min(90, Math.round(baseInterval * multiplier)));
  const lastEvidenceAt = toDate(input.lastEvidenceAt, 'lastEvidenceAt');
  return {
    dueAt: addUtcDays(lastEvidenceAt, intervalDays).toISOString(),
    intervalDays,
    reason,
    algorithmVersion: REVIEW_ALGORITHM_VERSION,
  };
}

export function isReviewDue(schedule: ReviewScheduleResult | null, now: Date | string): boolean {
  if (!schedule) return false;
  return toDate(now, 'now').getTime() >= toDate(schedule.dueAt, 'schedule.dueAt').getTime();
}

export function reviewIntervalForStatus(status: TopicStatus): number | null {
  return REVIEW_BASE_INTERVAL_DAYS[status] ?? null;
}
